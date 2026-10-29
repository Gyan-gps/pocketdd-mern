// Port of App\Http\Controllers\Api\BusinessController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request, Response } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../../core/http/response.js';
import { nowDb } from '../../core/time.js';
import { url } from '../../core/url.js';
import { validate, type Messages } from '../../core/validation/validator.js';
import { C, childRow, col, insertRow, nextId, toRow, transaction, type Filter, type Row } from '../../db/mongo.js';
import { BUSINESS_CHILDREN, CI, eloquentSave, looseEq, ORPHANS, poolDb, tableRow, whereEq, type Db } from '../../db/eloquent.js';
import { createImageFromBase64 } from '../../utils/base64-image.js';
import { filterValidateUrl, phpLower, phpStr, strSlug } from '../../utils/php/values.js';
import { generateSeriesFromId, quickTranslatedText } from '../../utils/general.js';
import { phpTruthy } from '../../utils/php/compat.js';
import { serializeBusiness, serializeBusinessImage, serializeCategory } from '../../models/business.js';

type Input = Record<string, unknown>;
const has = (input: Input, key: string) => Object.prototype.hasOwnProperty.call(input, key);
/** `$request->key` — missing keys are null. */
const req_ = (input: Input, key: string): unknown => input[key] ?? null;

/**
 * Validator::make() whose rules include closures: attributes are checked in rule order and
 * `errors()->first()` is the first failing attribute's first message. A closure runs only when the
 * attribute is present and its earlier rules passed (otherwise the attribute already has an error,
 * or Laravel skips it).
 */
async function firstError(
  input: Input,
  steps: Array<{ attr: string; rules: string; closure?: (value: unknown) => Promise<string | null> }>,
  messages: Messages,
): Promise<string | null> {
  for (const s of steps) {
    const v = await validate(input, { [s.attr]: s.rules }, messages);
    if (v.fails()) return v.first();
    if (s.closure && has(input, s.attr)) {
      const fail = await s.closure(input[s.attr]);
      if (fail) return fail;
    }
  }
  return null;
}

/** str_starts_with($request->business_image, 'data:image') guarded by a truthiness check. */
function isDataImage(v: unknown): boolean {
  return phpTruthy(v) && phpStr(v, 'str_starts_with').startsWith('data:image');
}

/** `SELECT * FROM <collection> WHERE … LIMIT 1` (PK order; businesses without their embedded children). */
async function firstRow(db: Db, collection: string, filter: Filter<Row>, collation = false): Promise<Row | null> {
  const doc = await col(collection).findOne(filter, {
    sort: { _id: 1 },
    session: db.session,
    ...(collection === C.businesses ? { projection: BUSINESS_CHILDREN } : {}),
    ...(collation ? { collation: CI } : {}),
  });
  return toRow(doc);
}

/** `EXISTS(SELECT * FROM <collection> WHERE …)` with MySQL's case-insensitive string comparison. */
async function exists(db: Db, collection: string, filter: Filter<Row>): Promise<boolean> {
  return !!(await col(collection).findOne(filter, { projection: { _id: 1 }, collation: CI, session: db.session }));
}

/** `col != ?` (NULL never matches). */
const notEq = (v: unknown) => ({ $nin: [v, null] });
const byId = (id: unknown) => ({ _id: id }) as unknown as Filter<Row>;

// ------------------------------------------------------------------------- categories (public)

/** COUNT(*) of active rows grouped by an int column. */
async function countBy(collection: string, match: Filter<Row>, field: string): Promise<Map<number, number>> {
  const rows = await col(collection)
    .aggregate([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }])
    .toArray();
  return new Map(rows.filter((r) => r._id !== null).map((r) => [Number(r._id), Number(r.n)]));
}
const subCategoryCounts = () => countBy(C.businessSubCategories, { status: 1 }, 'parent_id');

/** POST get-all-business-categories-dropdown. */
export async function getAllBusinessCategories(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { language: 'required' }, { 'language.required': 'Language is required.' });
    if (v.fails()) return sendResponse(false, v.first());

    const nameField = input.language === 'en' ? 'name' : 'name_hi';
    const cats = await col(C.businessCategories).find({ status: 1 }).sort({ _id: 1 }).toArray();
    const counts = await subCategoryCounts();
    const rows = cats.map((c) => ({
      id: c._id,
      name: c[nameField] ?? null,
      slug: c.slug ?? null,
      status: c.status ?? null,
      img: c.img ?? null,
      subcategories_count: counts.get(Number(c._id)) ?? 0,
    }));
    // Laravel quirk: a Collection is always truthy, so the "No Categories" branch is unreachable.
    return sendResponse(true, 'Categories list retrieved successfully.', {
      data: rows.map(serializeCategory),
      cityName: req_(input, 'cityName'),
    });
  } catch (e) {
    console.error('Error in getAllCategories()', { message: errorMessage(e) });
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-all-business-sub-categories-dropdown. */
export async function getAllBusinessSubCategories(req: Request) {
  try {
    const input = req.input;
    const v = await validate(
      input,
      { category_slug: 'required|string|exists:business_categories,slug', cityName: 'required', language: 'required' },
      {
        'category_slug.required': 'Category is required.',
        'category_slug.exists': 'Category not found.',
        'language.required': 'Language is required.',
        'cityName.required': 'Location is required.',
      },
    );
    if (v.fails()) return sendResponse(false, v.first());

    // `$request->businessAdd == true` (loose comparison)
    const nameField = phpTruthy(input.businessAdd) ? 'name' : input.language === 'en' ? 'name' : 'name_hi';
    const category = await firstRow(poolDb, C.businessCategories, whereEq('slug', input.category_slug), true);
    if (category) {
      const subs = await col(C.businessSubCategories)
        .find({ parent_id: category.id, status: 1 })
        .sort({ [nameField]: 1, _id: 1 })
        .collation(CI)
        .toArray();
      const counts = await countBy(C.businesses, { status: 1 }, 'business_sub_category_id');
      const subcategories = subs.map((s) => ({
        id: s._id,
        name: s[nameField] ?? null,
        slug: s.slug ?? null,
        status: s.status ?? null,
        img: s.img ?? null,
        businesses_count: counts.get(Number(s._id)) ?? 0,
      }));
      if (subcategories.length) {
        return sendResponse(true, 'Sub-Categories retrieved.', {
          subcategories: subcategories.map(serializeCategory),
          cityName: req_(input, 'cityName'),
        });
      }
      return sendResponse(true, 'Sub-Categories Not Found in Records.', { subcategories: [], cityName: req_(input, 'cityName') });
    }
    return sendResponse(false, 'Category not found.');
  } catch (e) {
    console.error('Error in getAllCategories()', { message: errorMessage(e) });
    return sendCatchLog(errorMessage(e));
  }
}

// ------------------------------------------------------------------------- business images

/** POST get-business-images — BusinessImage::getImagesOfBusiness(). */
export async function getBusinessImages(req: Request) {
  try {
    const owned = await col(C.businesses)
      .find({ user_id: looseEq(req.user!.id) } as Filter<Row>, { projection: { images: 1 } })
      .toArray();
    const rows = owned
      .flatMap((b) => ((b.images ?? []) as Row[]).map((img) => childRow('business_iamges', b._id as unknown as number, img)))
      .sort((a, b) => Number(b.id) - Number(a.id));
    return sendResponse(true, 'Business images found.', { data: rows.map(serializeBusinessImage) });
  } catch (e) {
    console.error('Error updating getBusinessImages ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  }
}

/** Business::getUserBusiness() — only the image columns are selected. */
async function getUserBusiness(db: Db, userId: unknown): Promise<Row | null> {
  const doc = await col(C.businesses).findOne({ user_id: looseEq(userId), status: 1 } as Filter<Row>, {
    sort: { _id: -1 },
    projection: { _id: 0, image_1: 1, image_2: 1, image_3: 1, image_4: 1 },
    session: db.session,
  });
  return doc ? { image_1: doc.image_1, image_2: doc.image_2, image_3: doc.image_3, image_4: doc.image_4 } : null;
}

/** POST add-business-images. */
export async function addBusinessImage(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { image: 'required' }, { 'image.required': 'image is required.' });
    if (v.fails()) return sendResponse(false, v.first());

    const business = await getUserBusiness(poolDb, req.user!.id);
    if (business) {
      const imageUrl = createImageFromBase64(input.image, 'business_images', { mkdir: true });
      const now = nowDb();
      // Laravel quirk: getUserBusiness() does not select `id`, so business_id is always NULL
      // (the row has no parent and is kept in `_orphans`, like the migration does).
      const id = await nextId(`${C.businesses}.images`);
      await col(ORPHANS).insertOne({
        table: 'business_iamges',
        row: { id, business_id: null, img: imageUrl, created_at: now, updated_at: now },
      });
      return sendResponse(true, 'Business image saved.');
    }
    return sendResponse(false, 'Business not found');
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error updating addBusinessImage ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  }
}

const isList = (v: unknown) => Array.isArray(v) || (!!v && typeof v === 'object');

/** `BusinessImage::find($id)` — embedded in its business, or an orphan (business_id NULL). */
async function findBusinessImage(db: Db, id: unknown): Promise<Row | null> {
  const match = looseEq(id);
  const parent = await col(C.businesses).findOne({ 'images.id': match } as Filter<Row>, {
    projection: { images: 1 },
    session: db.session,
  });
  const child = (parent?.images as Row[] | undefined)?.find((c) => String(c.id) === String(id));
  if (parent && child) return childRow('business_iamges', parent._id as unknown as number, child);
  const orphan = await col(ORPHANS).findOne({ table: 'business_iamges', 'row.id': match }, { session: db.session });
  return orphan ? (orphan.row as Row) : null;
}

async function deleteBusinessImageRow(image: Row) {
  if (image.business_id === null || image.business_id === undefined) {
    await col(ORPHANS).deleteOne({ table: 'business_iamges', 'row.id': image.id });
  } else {
    await col(C.businesses).updateOne({ _id: image.business_id }, { $pull: { images: { id: image.id } } } as never);
  }
}

/** POST delete-business-image. */
export async function deleteBusinessImage(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { image_id: 'required' }, { 'image_id.required': 'image not found.' });
    if (v.fails()) return sendResponse(false, v.first());

    // find([..]) returns a Collection (always truthy) whose ->image access throws.
    if (isList(input.image_id)) throw new Error('Property [image] does not exist on this collection instance.');
    const image = await findBusinessImage(poolDb, input.image_id);
    if (image) {
      // Laravel quirk: `$getImage->image` is not a column (it is `img`), so public_path(null) is the public
      // directory itself; File::delete() on a directory fails silently and the file is never removed.
      await deleteBusinessImageRow(image);
      return sendResponse(true, 'Image removed successfully.');
    }
    return sendResponse(false, 'Image not found.');
  } catch (e) {
    console.error('Error updating deleteBusinessImage ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  }
}

/** POST update-business-image. */
export async function updateBusinessImage(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { image_id: 'required', image: 'required' }, {
      'image_id.required': 'image not found.',
      'image.required': 'Please add image.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const imageUrl = createImageFromBase64(input.image, 'business_images', { mkdir: true });
    await transaction(async (session) => {
      if (isList(input.image_id)) throw new Error('Method Illuminate\\Database\\Eloquent\\Collection::update does not exist.');
      const image = await findBusinessImage({ session }, input.image_id);
      // Laravel quirk: an unknown id is a fatal Error (not caught) → 500, after the file was written.
      if (!image) throw new PhpError('Call to a member function update() on null');
      await eloquentSave({ session }, 'business_iamges', image, { img: imageUrl, updated_at: nowDb() }, { massAssign: true });
    });
    return sendResponse(true, 'Image updated successfully.');
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error updating updateBusinessImage ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  }
}

// ------------------------------------------------------------------------- update-user-business

/** POST update-user-business (updateUserBusiness1). */
export async function updateUserBusiness1(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { name: 'required', city: 'required', address: 'required' }, {
      'name.required': 'Business name is required.',
      // PHP message key is just 'city' (applies to every rule of the attribute).
      'city.required': 'City is required',
      'address.required': 'Business address is required.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const business = await firstRow(poolDb, C.businesses, { user_id: looseEq(req.user!.id), status: 1 } as Filter<Row>);
    if (!business) return { status: false, msg: 'business not exist!' };

    await transaction(async (session) => {
      const db: Db = { session };
      await eloquentSave(
        db,
        'businesses',
        business,
        { name: input.name, slug: strSlug(input.name), address: input.address, city: input.city },
        { massAssign: false },
      );

      // $business->businessDetail()->updateOrCreate(['business_id' => id], [...])
      const values: Record<string, unknown> = {
        street_address: req_(input, 'street_address'),
        post: req_(input, 'post'),
        tahsil: req_(input, 'tahsil'),
        pincode: req_(input, 'pincode'),
        district: req_(input, 'district'),
        state: req_(input, 'state'),
        business_email: req_(input, 'business_email'),
        business_mobile_number: req_(input, 'business_mobile_number'),
        description: req_(input, 'description'),
      };
      const parent = await col(C.businesses).findOne({ _id: business.id }, { projection: { details: 1 }, session });
      const first = (parent?.details as Row[] | undefined)?.[0];
      const detail = first ? childRow('business_details', business.id, first) : null;
      if (detail) {
        values.description = translationJson(detail.description, values.description);
        await eloquentSave(db, 'business_details', detail, values, { massAssign: true });
      } else {
        values.description = translationJson(null, values.description);
        const now = nowDb();
        const id = await nextId(`${C.businesses}.details`, session);
        const child = { id, ...tableRow('business_details', { ...values, updated_at: now, created_at: now }) };
        await col(C.businesses).updateOne({ _id: business.id }, { $push: { details: child } } as never, { session });
      }
    });
    return sendResponse(true, 'Business profile and details updated.');
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error updating user business details ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  }
}

/**
 * Spatie HasTranslations::setTranslation($key, 'en', $value) on BusinessDetail (translatable description):
 * existing translations (null/'' filtered out) + en, stored as json_encode(..., JSON_UNESCAPED_UNICODE).
 */
function translationJson(raw: unknown, value: unknown): string {
  let translations: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try {
      const d = JSON.parse(raw);
      if (d && typeof d === 'object' && !Array.isArray(d)) translations = d;
    } catch {
      /* not JSON → no translations */
    }
  }
  const kept = Object.fromEntries(Object.entries(translations).filter(([, x]) => x !== null && x !== ''));
  kept.en = value;
  return JSON.stringify(kept).replace(/\//g, '\\/');
}

// ------------------------------------------------------------------------- new business request

/** BusinessRequestManagment::insertNewBusinessRequest() — own (nested) transaction; errors → null. */
async function insertNewBusinessRequest(
  db: Db,
  input: Input,
  userId: unknown,
  categoryId: unknown,
  subCategoryId: unknown,
  imageUrl: unknown,
): Promise<number | null> {
  try {
    const now = nowDb();
    const row = tableRow('businesse_requests', {
      user_id: userId,
      business_category_id: categoryId,
      business_sub_category_id: subCategoryId,
      business_username: req_(input, 'business_username'),
      business_name: req_(input, 'business_name'),
      address_line: req_(input, 'address_line_1'),
      street_address: req_(input, 'street_address'),
      area_name: req_(input, 'area'),
      tahsil: req_(input, 'tehsil'),
      pincode: req_(input, 'pincode'),
      district: req_(input, 'district'),
      state: req_(input, 'state'),
      business_email: req_(input, 'business_email'),
      mobile_number: req_(input, 'number'),
      business_image: imageUrl,
      created_at: now,
      updated_at: now,
    });
    return await insertRow(C.businessRequests, row, db.session);
  } catch (e) {
    if (e instanceof PhpError) throw e;
    return null;
  }
}

/** Business::insertNewBusiness(). */
async function insertNewBusiness(
  db: Db,
  input: Input,
  userId: unknown,
  categoryId: unknown,
  subCategoryId: unknown,
  imageUrl: unknown,
): Promise<number> {
  const language = input.language;
  const state = await firstRow(db, C.pincodes, whereEq('pin_code', input.pincode), true);
  if (!state) throw new Error('Attempt to read property "id" on null');
  const address = await firstRow(db, C.addresses, { pincode_id: looseEq(state.id) } as Filter<Row>);

  const now = nowDb();
  const data: Record<string, unknown> = {
    user_id: userId,
    business_category_id: categoryId ?? null,
    business_sub_category_id: subCategoryId ?? null,
    business_name_en: req_(input, 'business_name'),
    address_line_1_en: `${phpStr(input.area)},${phpStr(input.street_address)},${phpStr(input.address_line_1)}`,
    pincode_id: state.id ?? null,
    pincode_hi: req_(input, 'pincode'),
    business_email: req_(input, 'business_email'),
    owner_number_1: req_(input, 'number'),
    logo: imageUrl,
    slug: strSlug(input.business_name),
    created_at: now,
    updated_at: now,
  };

  if (language === 'en') {
    data.owner_name_en = req_(input, 'business_username');
    data.tehsil_en = input.tehsil ?? address?.tehsil ?? null;
    data.state_en = input.state ?? state.state ?? null;
    data.dist_en = input.city ?? state.city ?? null;
    data.area_en = phpTruthy(input.area_name) ? input.area_name : null;
    data.owner_name_hi = await quickTranslatedText(input.business_username);
    data.area_hi = await quickTranslatedText(input.area_name);
    data.business_name_hi = await quickTranslatedText(input.business_name);
    data.tehsil_hi = address?.tehsil_hi ?? null;
    data.state_hi = state.state_hi ?? null;
    data.dist_hi = state.city_hi ?? null;
  } else if (language === 'hi') {
    data.owner_name_hi = req_(input, 'business_username');
    data.tehsil_hi = input.tehsil ?? address?.tehsil_hi ?? null;
    data.state_hi = input.state ?? state.state_hi ?? null;
    data.dist_hi = input.city ?? state.city_hi ?? null;
    // Laravel quirk: addresses has no business_username column → always null.
    data.owner_name_en = null;
    data.tehsil_en = address?.tehsil ?? null;
    data.state_en = state.state ?? null;
    data.dist_en = state.city ?? null;
  }

  const id = await insertRow(
    C.businesses,
    { ...tableRow('businesses', data), details: [], images: [], locations: [], owners: [] },
    db.session,
  );

  const pincodeData = await col(C.pincodes).findOne(
    { _id: state.id },
    { projection: { _id: 0, state_code: 1, district_code: 1 }, session: db.session },
  );
  if (!pincodeData) throw new Error('Invalid Pincode Data');
  const receipt =
    phpStr(pincodeData.state_code) + phpStr(pincodeData.district_code) + nowDb().slice(2, 4) + generateSeriesFromId(id);
  await col(C.businesses).updateOne(byId(id), { $set: { receipt_number: receipt, updated_at: nowDb() } }, { session: db.session });
  return id;
}

/** Business::find($id)->update([...]) after an insert. */
async function finalizeNewBusiness(db: Db, businessId: number, requestId: number | null) {
  const business = await firstRow(db, C.businesses, byId(businessId));
  if (!business) throw new PhpError('Call to a member function update() on null');
  await eloquentSave(
    db,
    'businesses',
    business,
    { lft: businessId + 1, rgt: businessId + 1, depth: 1, business_request_id: requestId, is_business_approved: 0 },
    { massAssign: true },
  );
}

/** `EXISTS(... WHERE owner_number_1 = ? OR business_contact_1..4 = ?)` */
const numberTaken = (v: unknown) => ({
  $or: ['owner_number_1', 'business_contact_1', 'business_contact_2', 'business_contact_3', 'business_contact_4'].map((c) => ({
    [c]: looseEq(v),
  })),
});
const emailTaken = (v: unknown) => ({ $or: [{ business_email: looseEq(v) }, { owner_email: looseEq(v) }] });

/** POST add-new-business-request. */
export async function createNewBusinessRequest(req: Request) {
  try {
    let statusDefined = true;
    const out = await transaction(async (session) => {
      const db: Db = { session };
      const input = req.input;
      const userId = req.user!.id;
      const businessAdded = false;

      const error = await firstError(
        input,
        [
          { attr: 'business_username', rules: 'required' },
          {
            attr: 'number',
            rules: 'required',
            closure: async (value) =>
              (await exists(db, C.businesses, numberTaken(value) as Filter<Row>)) ||
              (await exists(db, C.businessRequests, { mobile_number: looseEq(value) } as Filter<Row>))
                ? 'The number is already associated with an existing business.'
                : null,
          },
          {
            attr: 'business_email',
            rules: 'required',
            closure: async (value) =>
              (await exists(db, C.businesses, emailTaken(value) as Filter<Row>)) ||
              (await exists(db, C.businessRequests, { business_email: looseEq(value) } as Filter<Row>))
                ? 'The email is already associated with an existing business.'
                : null,
          },
          { attr: 'business_category', rules: 'required' },
          { attr: 'state', rules: 'required' },
          { attr: 'district', rules: 'required' },
          {
            attr: 'pincode',
            rules: 'required|digits:6',
            // 'regex:/^[1-9][0-9]{5}$/' (passes only for strings/numbers)
            closure: async (value) =>
              (typeof value === 'string' || typeof value === 'number') && /^[1-9][0-9]{5}$/.test(String(value))
                ? null
                : 'Please enter a valid pincode.',
          },
        ],
        {
          'business_username.required': 'Business username is required.',
          'number.required': 'Mobile number is required.',
          'business_email.required': 'Business email is required.',
          'business_category.required': 'Business category is required.',
          'state.required': 'State is required.',
          'district.required': 'District is required.',
          'pincode.required': 'Pincode is required.',
          'pincode.digits': 'Pincode must be exactly 6 digits.',
        },
      );
      if (error !== null) return sendResponse(false, error);

      const business = await firstRow(db, C.businesses, { user_id: looseEq(userId), status: 1 } as Filter<Row>);
      if (business) return sendResponse(false, 'Business User already has a business.');

      const pendingRequest = await firstRow(db, C.businessRequests, { user_id: looseEq(userId) } as Filter<Row>);
      if (pendingRequest) return sendResponse(false, 'Your previous business request is under review.');

      let imageUrl = '';
      if (isDataImage(input.business_image)) {
        imageUrl = createImageFromBase64(input.business_image, 'business_logo', { mkdir: true });
      }

      const search = input.language === 'en' ? 'name' : 'name_hi';
      const category = await firstRow(db, C.businessCategories, whereEq(search, input.business_category), true);
      if (!category) throw new Error('Attempt to read property "id" on null');
      const categoryId = category.id;
      // Laravel quirk: a missing business_sub_category becomes `WHERE name IS NULL`.
      const sub = await firstRow(db, C.businessSubCategories, whereEq(search, input.business_sub_category), true);
      const subCategoryId = sub?.id ?? null;

      const newRequestId = await insertNewBusinessRequest(db, input, userId, categoryId, subCategoryId, imageUrl);
      const businessId = await insertNewBusiness(db, input, userId, categoryId, subCategoryId, imageUrl);

      let businessStatus: unknown;
      statusDefined = false;
      const newBusinessData = newRequestId === null ? null : await firstRow(db, C.businessRequests, byId(newRequestId));
      if (newBusinessData) {
        businessStatus = newBusinessData.status;
        statusDefined = true;
        await eloquentSave(db, 'businesse_requests', newBusinessData, { business_id: businessId }, { massAssign: false });
      }

      await finalizeNewBusiness(db, businessId, newRequestId);
      return sendResponse(true, 'Business request submitted successfully', {
        'new-business': newRequestId,
        business_status: businessStatus,
        business_added: businessAdded,
      });
    });
    // Laravel quirk: when the request insert failed, $business_status is undefined → ErrorException
    // (thrown after the commit).
    if (!statusDefined) throw new Error('Undefined variable $business_status');
    return out;
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error Adding New Business Request: ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  }
}

// ------------------------------------------------------------------------- update-business

/** POST update-business (updateUserBusiness) — updates the user's business or creates a new request. */
export async function updateUserBusiness(req: Request) {
  try {
    return await transaction(async (session) => {
      const db: Db = { session };
      const input = req.input;
      const userId = req.user!.id;
      const existing = await firstRow(db, C.businesses, { user_id: looseEq(userId) } as Filter<Row>);
      let businessAdded = false;
      const r = existing ? 'sometimes' : 'required';

      const error = await firstError(
        input,
        [
          { attr: 'business_username', rules: `${r}|string|max:100` },
          { attr: 'business_category', rules: `${r}|string` },
          { attr: 'state', rules: `${r}|string` },
          { attr: 'district', rules: `${r}|string` },
          { attr: 'pincode', rules: `${r}|digits:6` },
          {
            attr: 'number',
            rules: `${r}|digits:10`,
            closure: async (value) =>
              (await exists(db, C.businesses, { user_id: notEq(userId), ...numberTaken(value) } as Filter<Row>)) ||
              (await exists(db, C.businessRequests, { user_id: notEq(userId), mobile_number: looseEq(value) } as Filter<Row>))
                ? 'The number is already associated with another business.'
                : null,
          },
          {
            attr: 'business_email',
            rules: `${r}|email`,
            closure: async (value) =>
              (await exists(db, C.businesses, { user_id: notEq(userId), ...emailTaken(value) } as Filter<Row>)) ||
              (await exists(db, C.businessRequests, {
                user_id: notEq(userId),
                business_email: looseEq(value),
                is_business_approved: 0,
              } as Filter<Row>))
                ? 'The email is already associated with another business.'
                : null,
          },
        ],
        { 'number.digits': 'Mobile number must be 10 digits.', 'pincode.digits': 'Pincode must be 6 digits.' },
      );
      if (error !== null) return sendResponse(false, error);

      let imageUrl: unknown = existing?.image_1 ?? null;
      if (isDataImage(input.business_image)) {
        imageUrl = createImageFromBase64(input.business_image, 'business_images', { mkdir: true });
      }

      let categoryId: unknown = null;
      let subCategoryId: unknown = null;
      const column = input.language === 'hi' ? 'name_hi' : 'name';
      if (phpTruthy(input.business_category)) {
        // `LOWER(col) = strtolower(?)` → case-insensitive collation.
        const cat = await firstRow(
          db,
          C.businessCategories,
          { [column]: phpLower(phpStr(input.business_category, 'strtolower')) },
          true,
        );
        if (!cat) return sendResponse(false, 'Invalid Business Category');
        categoryId = cat.id;
        if (phpTruthy(input.business_sub_category)) {
          const sub = await firstRow(
            db,
            C.businessSubCategories,
            { [column]: phpLower(phpStr(input.business_sub_category, 'strtolower')) },
            true,
          );
          subCategoryId = sub?.id ?? null;
        }
      }

      let message: string;
      let businessId: unknown;
      let status: unknown;
      let newRequestId: unknown = null;

      if (existing) {
        const fieldsToUpdate: Array<[string, string]> = [
          ['business_name', 'business_name_en'],
          ['business_username', 'owner_name_en'],
          ['business_email', 'business_email'],
          ['state', 'state_en'],
          ['district', 'dist_en'],
          ['pincode', 'pincode_hi'],
          ['tehsil', 'tehsil_en'],
          ['number', 'owner_number_1'],
          // Laravel quirk: the "column" is the image path itself (or '' when null); fill() drops it as an
          // unknown column, but its presence still makes $updateData non-empty.
          ['business_logo', phpStr(imageUrl)],
        ];
        const updateData: Record<string, unknown> = {};
        for (const [reqKey, dbCol] of fieldsToUpdate) if (has(input, reqKey)) updateData[dbCol] = input[reqKey] ?? null;

        if (phpTruthy(input.area) || phpTruthy(input.street_address) || phpTruthy(input.address_line_1)) {
          updateData.area_en = input.area ?? null;
          updateData.address_line_1_en = `${phpStr(input.area ?? '')},${phpStr(input.street_address ?? '')},${phpStr(input.address_line_1 ?? '')}`;
        }
        if (phpTruthy(categoryId)) {
          updateData.business_category_id = categoryId;
          updateData.business_sub_category_id = subCategoryId;
        }
        if (phpTruthy(imageUrl)) updateData.image_1 = imageUrl;

        if (Object.keys(updateData).length) {
          updateData.is_business_approved = 0;
          await eloquentSave(db, 'businesses', existing, updateData, { massAssign: true });
        }
        message = 'Business updated successfully';
        businessId = existing.id;
        status = existing.status;
      } else {
        if (await exists(db, C.businessRequests, { user_id: looseEq(userId) } as Filter<Row>)) {
          return sendResponse(false, 'Your previous business request is under review.');
        }
        if (!phpTruthy(categoryId)) return sendResponse(false, 'Business Category is required.');

        const requestId = await insertNewBusinessRequest(db, input, userId, categoryId, subCategoryId, imageUrl ?? '');
        const insertedId = await insertNewBusiness(db, input, userId, categoryId, subCategoryId, imageUrl ?? '');
        await finalizeNewBusiness(db, insertedId, requestId);

        businessAdded = true;
        message = 'Business request submitted successfully';
        businessId = insertedId;
        status = 0;
        newRequestId = requestId;
      }

      return sendResponse(true, message, {
        'new-business': newRequestId ?? null,
        business_id: businessId,
        business_status: status ?? null,
        business_added: businessAdded,
      });
    });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error Processing User Business: ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  }
}

// ------------------------------------------------------------------------- get-user-business-details

/** POST get-user-business-details — explicit status codes, generic 500 on errors. */
export async function getUserBusinessDetails(req: Request, res: Response) {
  try {
    const business = await firstRow(poolDb, C.businesses, { user_id: looseEq(req.user!.id) } as Filter<Row>);
    if (!business) {
      res.status(404);
      return { status: false, message: 'Business not found.' };
    }
    const row: Record<string, unknown> = { ...business };
    if (phpTruthy(row.logo) && !filterValidateUrl(String(row.logo))) {
      // Laravel quirk: business_icon is computed from the already-absolutised logo (APP_URL/http://…).
      row.logo = url(req, String(row.logo));
    }
    const category = await col(C.businessCategories).findOne(
      { _id: looseEq(row.business_category_id) } as Filter<Row>,
      { projection: { _id: 0, name: 1, slug: 1 } },
    );
    row.category_en = category?.name ?? null;
    row.category_slug = category?.slug ?? null;

    const parts = phpStr(row.address_line_1_en).split(',');
    row.street_address = parts[1] ?? null;
    row.address_line_1_en = parts[2] ?? null;
    return {
      status: true,
      message: 'Business details fetched successfully.',
      data: serializeBusiness(row, ['image_1', 'image_2', 'image_3', 'image_4']),
    };
  } catch (e) {
    console.error('Error Fetching User Business: ' + errorMessage(e));
    res.status(500);
    return { status: false, message: 'Something went wrong.' };
  }
}
