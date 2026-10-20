// Port of App\Http\Controllers\Api\BusinessController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request, Response } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../../core/http/respond.js';
import { nowDb } from '../../core/time.js';
import { url } from '../../core/url.js';
import { validate, type Messages } from '../../core/validation/validator.js';
import { all, exec, first, type Row } from '../../db/pool.js';
import {
  bind,
  createImageFromBase64,
  eloquentSave,
  filterValidateUrl,
  generateSeriesFromId,
  phpLower,
  phpStr,
  quickTranslatedText,
  strSlug,
  Tx,
  whereEq,
  type Db,
} from '../../helpers/business.js';
import { phpTruthy } from '../../helpers/phase5.js';
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

// ------------------------------------------------------------------------- categories (public)

/** POST get-all-business-categories-dropdown. */
export async function getAllBusinessCategories(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { language: 'required' }, { 'language.required': 'Language is required.' });
    if (v.fails()) return sendResponse(false, v.first());

    const nameField = input.language === 'en' ? 'name' : 'name_hi';
    const rows = await all(
      `SELECT c.id, c.\`${nameField}\` AS name, c.slug, c.status, c.img,
              (SELECT COUNT(*) FROM business_sub_categories s WHERE c.id = s.parent_id AND s.status = 1) AS subcategories_count
         FROM business_categories c WHERE c.status = 1`,
    );
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
    const category = await first('SELECT * FROM business_categories WHERE slug = ? LIMIT 1', [input.category_slug]);
    if (category) {
      const subcategories = await all(
        `SELECT s.id, s.\`${nameField}\` AS name, s.slug, s.status, s.img,
                (SELECT COUNT(*) FROM businesses b WHERE s.id = b.business_sub_category_id AND b.status = 1) AS businesses_count
           FROM business_sub_categories s
          WHERE s.parent_id = ? AND s.status = 1
          ORDER BY \`${nameField}\` ASC`,
        [category.id],
      );
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
    const rows = await all(
      `SELECT * FROM business_iamges
        WHERE EXISTS (SELECT * FROM businesses WHERE business_iamges.business_id = businesses.id AND user_id = ?)
        ORDER BY id DESC`,
      [req.user!.id],
    );
    return sendResponse(true, 'Business images found.', { data: rows.map(serializeBusinessImage) });
  } catch (e) {
    console.error('Error updating getBusinessImages ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  }
}

/** Business::getUserBusiness() — only the image columns are selected. */
async function getUserBusiness(db: Db, userId: unknown): Promise<Row | null> {
  return db.first(
    'SELECT image_1, image_2, image_3, image_4 FROM businesses WHERE user_id = ? AND status = ? ORDER BY id DESC LIMIT 1',
    [userId, 1],
  );
}

/** POST add-business-images. */
export async function addBusinessImage(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { image: 'required' }, { 'image.required': 'image is required.' });
    if (v.fails()) return sendResponse(false, v.first());

    const business = await getUserBusiness({ all, first, exec }, req.user!.id);
    if (business) {
      const imageUrl = createImageFromBase64(input.image, 'business_images', { mkdir: true });
      const now = nowDb();
      // Laravel quirk: getUserBusiness() does not select `id`, so business_id is always NULL.
      await exec('INSERT INTO business_iamges (business_id, img, created_at, updated_at) VALUES (?, ?, ?, ?)', [
        business.id ?? null,
        imageUrl,
        now,
        now,
      ]);
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

/** POST delete-business-image. */
export async function deleteBusinessImage(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { image_id: 'required' }, { 'image_id.required': 'image not found.' });
    if (v.fails()) return sendResponse(false, v.first());

    // find([..]) returns a Collection (always truthy) whose ->image access throws.
    if (isList(input.image_id)) throw new Error('Property [image] does not exist on this collection instance.');
    const image = await first('SELECT * FROM business_iamges WHERE id = ? LIMIT 1', [input.image_id]);
    if (image) {
      // Laravel quirk: `$getImage->image` is not a column (it is `img`), so public_path(null) is the public
      // directory itself; File::delete() on a directory fails silently and the file is never removed.
      await exec('DELETE FROM business_iamges WHERE id = ?', [image.id]);
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
  const tx = await Tx.open();
  try {
    const input = req.input;
    const v = await validate(input, { image_id: 'required', image: 'required' }, {
      'image_id.required': 'image not found.',
      'image.required': 'Please add image.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const imageUrl = createImageFromBase64(input.image, 'business_images', { mkdir: true });
    await tx.begin();
    if (isList(input.image_id)) throw new Error('Method Illuminate\\Database\\Eloquent\\Collection::update does not exist.');
    const image = await tx.first('SELECT * FROM business_iamges WHERE id = ? LIMIT 1', [input.image_id]);
    // Laravel quirk: an unknown id is a fatal Error (not caught) → 500, after the file was written.
    if (!image) throw new PhpError('Call to a member function update() on null');
    await eloquentSave(tx, 'business_iamges', image, { img: imageUrl, updated_at: nowDb() }, { massAssign: true });
    await tx.commit();
    return sendResponse(true, 'Image updated successfully.');
  } catch (e) {
    if (e instanceof PhpError) throw e;
    await tx.rollBack();
    console.error('Error updating updateBusinessImage ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  } finally {
    await tx.release();
  }
}

// ------------------------------------------------------------------------- update-user-business

/** POST update-user-business (updateUserBusiness1). */
export async function updateUserBusiness1(req: Request) {
  const tx = await Tx.open();
  try {
    const input = req.input;
    const v = await validate(input, { name: 'required', city: 'required', address: 'required' }, {
      'name.required': 'Business name is required.',
      // PHP message key is just 'city' (applies to every rule of the attribute).
      'city.required': 'City is required',
      'address.required': 'Business address is required.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const business = await tx.first('SELECT * FROM businesses WHERE user_id = ? AND status = ? LIMIT 1', [req.user!.id, 1]);
    if (!business) return { status: false, msg: 'business not exist!' };

    await tx.begin();
    await eloquentSave(
      tx,
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
    const detail = await tx.first(
      'SELECT * FROM business_details WHERE business_details.business_id = ? AND business_details.business_id IS NOT NULL AND business_id = ? LIMIT 1',
      [business.id, business.id],
    );
    if (detail) {
      values.description = translationJson(detail.description, values.description);
      await eloquentSave(tx, 'business_details', detail, values, { massAssign: true });
    } else {
      values.description = translationJson(null, values.description);
      const now = nowDb();
      const row = { business_id: business.id, ...values, updated_at: now, created_at: now };
      const cols = Object.keys(row);
      await tx.exec(`INSERT INTO business_details (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (?)`, [
        Object.values(row).map(bind),
      ]);
    }

    await tx.commit();
    return sendResponse(true, 'Business profile and details updated.');
  } catch (e) {
    if (e instanceof PhpError) throw e;
    await tx.rollBack();
    console.error('Error updating user business details ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  } finally {
    await tx.release();
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
  tx: Tx,
  input: Input,
  userId: unknown,
  categoryId: unknown,
  subCategoryId: unknown,
  imageUrl: unknown,
): Promise<number | null> {
  await tx.begin();
  try {
    const now = nowDb();
    const res = await tx.exec(
      `INSERT INTO businesse_requests (user_id, business_category_id, business_sub_category_id, business_username, business_name,
         address_line, street_address, area_name, tahsil, pincode, district, state, business_email, mobile_number, business_image,
         created_at, updated_at) VALUES (?)`,
      [
        [
          userId,
          categoryId,
          subCategoryId,
          req_(input, 'business_username'),
          req_(input, 'business_name'),
          req_(input, 'address_line_1'),
          req_(input, 'street_address'),
          req_(input, 'area'),
          req_(input, 'tehsil'),
          req_(input, 'pincode'),
          req_(input, 'district'),
          req_(input, 'state'),
          req_(input, 'business_email'),
          req_(input, 'number'),
          imageUrl,
          now,
          now,
        ].map(bind),
      ],
    );
    await tx.commit();
    return res.insertId;
  } catch (e) {
    if (e instanceof PhpError) throw e;
    await tx.rollBack();
    return null;
  }
}

/** Business::insertNewBusiness(). */
async function insertNewBusiness(
  tx: Tx,
  input: Input,
  userId: unknown,
  categoryId: unknown,
  subCategoryId: unknown,
  imageUrl: unknown,
): Promise<number> {
  const language = input.language;
  const [w, p] = whereEq('pin_code', input.pincode);
  const state = await tx.first(`SELECT * FROM pincodes WHERE ${w} LIMIT 1`, p);
  if (!state) throw new Error('Attempt to read property "id" on null');
  const address = await tx.first('SELECT * FROM addresses WHERE pincode_id = ? LIMIT 1', [state.id]);

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

  const cols = Object.keys(data);
  const res = await tx.exec(`INSERT INTO businesses (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (?)`, [
    Object.values(data).map(bind),
  ]);
  const id = res.insertId;

  const pincodeData = await tx.first('SELECT state_code, district_code FROM pincodes WHERE id = ? LIMIT 1', [state.id]);
  if (!pincodeData) throw new Error('Invalid Pincode Data');
  const receipt =
    phpStr(pincodeData.state_code) + phpStr(pincodeData.district_code) + nowDb().slice(2, 4) + generateSeriesFromId(id);
  await tx.exec('UPDATE businesses SET receipt_number = ?, businesses.updated_at = ? WHERE id = ?', [receipt, nowDb(), id]);
  return id;
}

/** Business::find($id)->update([...]) after an insert. */
async function finalizeNewBusiness(tx: Tx, businessId: number, requestId: number | null) {
  const business = await tx.first('SELECT * FROM businesses WHERE id = ? LIMIT 1', [businessId]);
  if (!business) throw new PhpError('Call to a member function update() on null');
  await eloquentSave(
    tx,
    'businesses',
    business,
    { lft: businessId + 1, rgt: businessId + 1, depth: 1, business_request_id: requestId, is_business_approved: 0 },
    { massAssign: true },
  );
}

/** POST add-new-business-request. */
export async function createNewBusinessRequest(req: Request) {
  const tx = await Tx.open();
  await tx.begin();
  try {
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
          closure: async (value) => {
            const v = bind(value);
            const exists = await tx.first(
              `SELECT EXISTS(SELECT * FROM businesses WHERE owner_number_1 = ? OR business_contact_1 = ? OR business_contact_2 = ?
                 OR business_contact_3 = ? OR business_contact_4 = ?) AS e`,
              [v, v, v, v, v],
            );
            const pending = await tx.first('SELECT EXISTS(SELECT * FROM businesse_requests WHERE mobile_number = ?) AS e', [v]);
            return Number(exists?.e) || Number(pending?.e) ? 'The number is already associated with an existing business.' : null;
          },
        },
        {
          attr: 'business_email',
          rules: 'required',
          closure: async (value) => {
            const v = bind(value);
            const exists = await tx.first(
              'SELECT EXISTS(SELECT * FROM businesses WHERE business_email = ? OR owner_email = ?) AS e',
              [v, v],
            );
            const pending = await tx.first('SELECT EXISTS(SELECT * FROM businesse_requests WHERE business_email = ?) AS e', [v]);
            return Number(exists?.e) || Number(pending?.e) ? 'The email is already associated with an existing business.' : null;
          },
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

    const business = await tx.first('SELECT * FROM businesses WHERE user_id = ? AND status = ? LIMIT 1', [userId, 1]);
    if (business) return sendResponse(false, 'Business User already has a business.');

    const pendingRequest = await tx.first('SELECT * FROM businesse_requests WHERE user_id = ? LIMIT 1', [userId]);
    if (pendingRequest) return sendResponse(false, 'Your previous business request is under review.');

    let imageUrl = '';
    if (isDataImage(input.business_image)) {
      imageUrl = createImageFromBase64(input.business_image, 'business_logo', { mkdir: true });
    }

    const search = input.language === 'en' ? 'name' : 'name_hi';
    const [cw, cp] = whereEq(search, input.business_category);
    const category = await tx.first(`SELECT * FROM business_categories WHERE ${cw} LIMIT 1`, cp);
    if (!category) throw new Error('Attempt to read property "id" on null');
    const categoryId = category.id;
    const [sw, sp] = whereEq(search, input.business_sub_category);
    // Laravel quirk: a missing business_sub_category becomes `WHERE name IS NULL`.
    const sub = await tx.first(`SELECT * FROM business_sub_categories WHERE ${sw} LIMIT 1`, sp);
    const subCategoryId = sub?.id ?? null;

    const newRequestId = await insertNewBusinessRequest(tx, input, userId, categoryId, subCategoryId, imageUrl);
    const businessId = await insertNewBusiness(tx, input, userId, categoryId, subCategoryId, imageUrl);

    let businessStatus: unknown;
    let statusDefined = false;
    const newBusinessData =
      newRequestId === null ? null : await tx.first('SELECT * FROM businesse_requests WHERE id = ? LIMIT 1', [newRequestId]);
    if (newBusinessData) {
      businessStatus = newBusinessData.status;
      statusDefined = true;
      await eloquentSave(tx, 'businesse_requests', newBusinessData, { business_id: businessId }, { massAssign: false });
    }

    await finalizeNewBusiness(tx, businessId, newRequestId);
    await tx.commit();
    // Laravel quirk: when the request insert failed, $business_status is undefined → ErrorException.
    if (!statusDefined) throw new Error('Undefined variable $business_status');
    return sendResponse(true, 'Business request submitted successfully', {
      'new-business': newRequestId,
      business_status: businessStatus,
      business_added: businessAdded,
    });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error Adding New Business Request: ' + errorMessage(e));
    await tx.rollBack();
    return sendCatchLog(errorMessage(e));
  } finally {
    await tx.release();
  }
}

// ------------------------------------------------------------------------- update-business

/** POST update-business (updateUserBusiness) — updates the user's business or creates a new request. */
export async function updateUserBusiness(req: Request) {
  const tx = await Tx.open();
  await tx.begin();
  try {
    const input = req.input;
    const userId = req.user!.id;
    const existing = await tx.first('SELECT * FROM businesses WHERE user_id = ? LIMIT 1', [userId]);
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
          closure: async (value) => {
            const v = bind(value);
            const exists = await tx.first(
              `SELECT EXISTS(SELECT * FROM businesses WHERE user_id != ? AND (owner_number_1 = ? OR business_contact_1 = ?
                 OR business_contact_2 = ? OR business_contact_3 = ? OR business_contact_4 = ?)) AS e`,
              [userId, v, v, v, v, v],
            );
            const pending = await tx.first(
              'SELECT EXISTS(SELECT * FROM businesse_requests WHERE user_id != ? AND mobile_number = ?) AS e',
              [userId, v],
            );
            return Number(exists?.e) || Number(pending?.e) ? 'The number is already associated with another business.' : null;
          },
        },
        {
          attr: 'business_email',
          rules: `${r}|email`,
          closure: async (value) => {
            const v = bind(value);
            const exists = await tx.first(
              'SELECT EXISTS(SELECT * FROM businesses WHERE user_id != ? AND (business_email = ? OR owner_email = ?)) AS e',
              [userId, v, v],
            );
            const pending = await tx.first(
              'SELECT EXISTS(SELECT * FROM businesse_requests WHERE user_id != ? AND business_email = ? AND is_business_approved = ?) AS e',
              [userId, v, 0],
            );
            return Number(exists?.e) || Number(pending?.e) ? 'The email is already associated with another business.' : null;
          },
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
      const cat = await tx.first(`SELECT * FROM business_categories WHERE LOWER(${column}) = ? LIMIT 1`, [
        phpLower(phpStr(input.business_category, 'strtolower')),
      ]);
      if (!cat) return sendResponse(false, 'Invalid Business Category');
      categoryId = cat.id;
      if (phpTruthy(input.business_sub_category)) {
        const sub = await tx.first(`SELECT * FROM business_sub_categories WHERE LOWER(${column}) = ? LIMIT 1`, [
          phpLower(phpStr(input.business_sub_category, 'strtolower')),
        ]);
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
        await eloquentSave(tx, 'businesses', existing, updateData, { massAssign: true });
      }
      message = 'Business updated successfully';
      businessId = existing.id;
      status = existing.status;
    } else {
      const pending = await tx.first('SELECT EXISTS(SELECT * FROM businesse_requests WHERE user_id = ?) AS e', [userId]);
      if (Number(pending?.e)) return sendResponse(false, 'Your previous business request is under review.');
      if (!phpTruthy(categoryId)) return sendResponse(false, 'Business Category is required.');

      const requestId = await insertNewBusinessRequest(tx, input, userId, categoryId, subCategoryId, imageUrl ?? '');
      const insertedId = await insertNewBusiness(tx, input, userId, categoryId, subCategoryId, imageUrl ?? '');
      await finalizeNewBusiness(tx, insertedId, requestId);

      businessAdded = true;
      message = 'Business request submitted successfully';
      businessId = insertedId;
      status = 0;
      newRequestId = requestId;
    }

    await tx.commit();
    return sendResponse(true, message, {
      'new-business': newRequestId ?? null,
      business_id: businessId,
      business_status: status ?? null,
      business_added: businessAdded,
    });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    await tx.rollBack();
    console.error('Error Processing User Business: ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  } finally {
    await tx.release();
  }
}

// ------------------------------------------------------------------------- get-user-business-details

/** POST get-user-business-details — explicit status codes, generic 500 on errors. */
export async function getUserBusinessDetails(req: Request, res: Response) {
  try {
    const business = await first('SELECT * FROM businesses WHERE user_id = ? LIMIT 1', [req.user!.id]);
    if (!business) {
      res.status(404);
      return { status: false, message: 'Business not found.' };
    }
    const row: Record<string, unknown> = { ...business };
    if (phpTruthy(row.logo) && !filterValidateUrl(String(row.logo))) {
      // Laravel quirk: business_icon is computed from the already-absolutised logo (APP_URL/http://…).
      row.logo = url(req, String(row.logo));
    }
    const category = await first('SELECT name, slug FROM business_categories WHERE id = ? LIMIT 1', [
      row.business_category_id,
    ]);
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
