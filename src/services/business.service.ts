// Business queries and writes used by the business endpoints (Api\BusinessController).
import { PhpError } from '../core/http/response.js';
import { nowDb } from '../core/time.js';
import { childRow, insertRow, nextId, toRow, type Row } from '../db/mongo.js';
import { BUSINESS_CHILDREN, CASE_INSENSITIVE, eloquentSave, looseEq, tableRow, whereEq, type Db } from '../db/eloquent.js';
import { Address } from '../models/address.model.js';
import { Business } from '../models/business.model.js';
import { BusinessCategory } from '../models/business-category.model.js';
import { BusinessRequest } from '../models/business-request.model.js';
import { BusinessSubCategory } from '../models/business-sub-category.model.js';
import { OrphanRow } from '../models/orphan-row.model.js';
import { Pincode } from '../models/pincode.model.js';
import type { AnyModel } from '../models/index.js';
import { generateSeriesFromId, quickTranslatedText } from '../utils/general.js';
import { phpTruthy } from '../utils/php/compat.js';
import { phpStr, strSlug } from '../utils/php/values.js';

type Input = Record<string, unknown>;

const BUSINESSES = Business.collection.collectionName;
const BUSINESS_REQUESTS = BusinessRequest.collection.collectionName;

/** `$request->key` — missing keys are null. */
export const requestValue = (input: Input, key: string): unknown => input[key] ?? null;

/** `SELECT * FROM <collection> WHERE … LIMIT 1` (PK order; businesses without their embedded children). */
async function findFirstRow(db: Db, model: AnyModel, filter: Row, collation = false): Promise<Row | null> {
  const document = await model
    .findOne(filter, model === Business ? BUSINESS_CHILDREN : undefined, {
      sort: { _id: 1 },
      session: db.session,
      ...(collation ? { collation: CASE_INSENSITIVE } : {}),
    })
    .lean<Row>();
  return toRow(document);
}

/** `EXISTS(SELECT * FROM <collection> WHERE …)` with MySQL's case-insensitive string comparison. */
async function rowExists(db: Db, model: AnyModel, filter: Row): Promise<boolean> {
  return !!(await model.findOne(filter, { _id: 1 }, { collation: CASE_INSENSITIVE, session: db.session }).lean<Row>());
}

/** `col != ?` (NULL never matches). */
const notEqual = (value: unknown) => ({ $nin: [value, null] });
const byId = (id: unknown): Row => ({ _id: id });

/** `EXISTS(... WHERE owner_number_1 = ? OR business_contact_1..4 = ?)` */
const numberTakenFilter = (value: unknown) => ({
  $or: ['owner_number_1', 'business_contact_1', 'business_contact_2', 'business_contact_3', 'business_contact_4'].map(
    (column) => ({ [column]: looseEq(value) }),
  ),
});
const emailTakenFilter = (value: unknown) => ({ $or: [{ business_email: looseEq(value) }, { owner_email: looseEq(value) }] });

// ------------------------------------------------------------------------- categories

/** COUNT(*) of active rows grouped by an int column. */
async function countGroupedBy(model: AnyModel, match: Row, field: string): Promise<Map<number, number>> {
  const groups = await model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]);
  return new Map(groups.filter((group) => group._id !== null).map((group) => [Number(group._id), Number(group.n)]));
}

export const countActiveSubCategoriesByParent = () => countGroupedBy(BusinessSubCategory, { status: 1 }, 'parent_id');
export const countActiveBusinessesBySubCategory = () =>
  countGroupedBy(Business, { status: 1 }, 'business_sub_category_id');

export const findActiveCategories = () => BusinessCategory.find({ status: 1 }).sort({ _id: 1 }).lean<Row[]>();

export const findCategoryBySlug = (slug: unknown) => findFirstRow({}, BusinessCategory, whereEq('slug', slug), true);

export const findActiveSubCategories = (parentId: unknown, orderByField: string) =>
  BusinessSubCategory.find({ parent_id: parentId, status: 1 })
    .sort({ [orderByField]: 1, _id: 1 })
    .collation(CASE_INSENSITIVE)
    .lean<Row[]>();

/** Category / sub-category whose (language's) name equals `value` (`->where($search, $value)`). */
export const findCategoryByName = (db: Db, nameField: string, value: unknown) =>
  findFirstRow(db, BusinessCategory, whereEq(nameField, value), true);
export const findSubCategoryByName = (db: Db, nameField: string, value: unknown) =>
  findFirstRow(db, BusinessSubCategory, whereEq(nameField, value), true);

/** `LOWER(col) = ?` → case-insensitive collation. */
export const findCategoryByLowerName = (db: Db, nameField: string, lowerName: string) =>
  findFirstRow(db, BusinessCategory, { [nameField]: lowerName }, true);
export const findSubCategoryByLowerName = (db: Db, nameField: string, lowerName: string) =>
  findFirstRow(db, BusinessSubCategory, { [nameField]: lowerName }, true);

export const findCategoryNameAndSlug = (categoryId: unknown) =>
  BusinessCategory.findOne({ _id: looseEq(categoryId) }, { _id: 0, name: 1, slug: 1 }).lean<Row>();

// ------------------------------------------------------------------------- businesses / requests

export const findUserBusiness = (db: Db, userId: unknown) => findFirstRow(db, Business, { user_id: looseEq(userId) });
export const findActiveUserBusiness = (db: Db, userId: unknown) =>
  findFirstRow(db, Business, { user_id: looseEq(userId), status: 1 });
export const findUserBusinessRequest = (db: Db, userId: unknown) =>
  findFirstRow(db, BusinessRequest, { user_id: looseEq(userId) });
export const findBusinessRequestById = (db: Db, requestId: number) => findFirstRow(db, BusinessRequest, byId(requestId));
export const userHasBusinessRequest = (db: Db, userId: unknown) =>
  rowExists(db, BusinessRequest, { user_id: looseEq(userId) });

/** The number is used by any business or business request. */
export async function isNumberTaken(db: Db, number: unknown): Promise<boolean> {
  return (
    (await rowExists(db, Business, numberTakenFilter(number))) ||
    (await rowExists(db, BusinessRequest, { mobile_number: looseEq(number) }))
  );
}

/** The email is used by any business or business request. */
export async function isEmailTaken(db: Db, email: unknown): Promise<boolean> {
  return (
    (await rowExists(db, Business, emailTakenFilter(email))) ||
    (await rowExists(db, BusinessRequest, { business_email: looseEq(email) }))
  );
}

/** The number is used by a business or business request of another user. */
export async function isNumberTakenByOtherUser(db: Db, userId: unknown, number: unknown): Promise<boolean> {
  return (
    (await rowExists(db, Business, { user_id: notEqual(userId), ...numberTakenFilter(number) })) ||
    (await rowExists(db, BusinessRequest, { user_id: notEqual(userId), mobile_number: looseEq(number) }))
  );
}

/** The email is used by a business or an unapproved business request of another user. */
export async function isEmailTakenByOtherUser(db: Db, userId: unknown, email: unknown): Promise<boolean> {
  return (
    (await rowExists(db, Business, { user_id: notEqual(userId), ...emailTakenFilter(email) })) ||
    (await rowExists(db, BusinessRequest, {
      user_id: notEqual(userId),
      business_email: looseEq(email),
      is_business_approved: 0,
    }))
  );
}

/** BusinessRequestManagment::insertNewBusinessRequest() — own (nested) transaction; errors → null. */
export async function insertNewBusinessRequest(
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
      business_username: requestValue(input, 'business_username'),
      business_name: requestValue(input, 'business_name'),
      address_line: requestValue(input, 'address_line_1'),
      street_address: requestValue(input, 'street_address'),
      area_name: requestValue(input, 'area'),
      tahsil: requestValue(input, 'tehsil'),
      pincode: requestValue(input, 'pincode'),
      district: requestValue(input, 'district'),
      state: requestValue(input, 'state'),
      business_email: requestValue(input, 'business_email'),
      mobile_number: requestValue(input, 'number'),
      business_image: imageUrl,
      created_at: now,
      updated_at: now,
    });
    return await insertRow(BUSINESS_REQUESTS, row, db.session);
  } catch (error) {
    if (error instanceof PhpError) throw error;
    return null;
  }
}

/** Business::insertNewBusiness(). */
export async function insertNewBusiness(
  db: Db,
  input: Input,
  userId: unknown,
  categoryId: unknown,
  subCategoryId: unknown,
  imageUrl: unknown,
): Promise<number> {
  const language = input.language;
  const state = await findFirstRow(db, Pincode, whereEq('pin_code', input.pincode), true);
  if (!state) throw new Error('Attempt to read property "id" on null');
  const address = await findFirstRow(db, Address, { pincode_id: looseEq(state.id) });

  const now = nowDb();
  const data: Record<string, unknown> = {
    user_id: userId,
    business_category_id: categoryId ?? null,
    business_sub_category_id: subCategoryId ?? null,
    business_name_en: requestValue(input, 'business_name'),
    address_line_1_en: `${phpStr(input.area)},${phpStr(input.street_address)},${phpStr(input.address_line_1)}`,
    pincode_id: state.id ?? null,
    pincode_hi: requestValue(input, 'pincode'),
    business_email: requestValue(input, 'business_email'),
    owner_number_1: requestValue(input, 'number'),
    logo: imageUrl,
    slug: strSlug(input.business_name),
    created_at: now,
    updated_at: now,
  };

  if (language === 'en') {
    data.owner_name_en = requestValue(input, 'business_username');
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
    data.owner_name_hi = requestValue(input, 'business_username');
    data.tehsil_hi = input.tehsil ?? address?.tehsil_hi ?? null;
    data.state_hi = input.state ?? state.state_hi ?? null;
    data.dist_hi = input.city ?? state.city_hi ?? null;
    // Laravel quirk: addresses has no business_username column → always null.
    data.owner_name_en = null;
    data.tehsil_en = address?.tehsil ?? null;
    data.state_en = state.state ?? null;
    data.dist_en = state.city ?? null;
  }

  const businessId = await insertRow(
    BUSINESSES,
    { ...tableRow('businesses', data), details: [], images: [], locations: [], owners: [] },
    db.session,
  );

  const pincodeData = await Pincode.findOne(
    { _id: state.id },
    { _id: 0, state_code: 1, district_code: 1 },
    { session: db.session },
  ).lean<Row>();
  if (!pincodeData) throw new Error('Invalid Pincode Data');
  const receiptNumber =
    phpStr(pincodeData.state_code) +
    phpStr(pincodeData.district_code) +
    nowDb().slice(2, 4) +
    generateSeriesFromId(businessId);
  await Business.updateOne(
    byId(businessId),
    { $set: { receipt_number: receiptNumber, updated_at: nowDb() } },
    { session: db.session },
  );
  return businessId;
}

/** Business::find($id)->update([...]) after an insert. */
export async function finalizeNewBusiness(db: Db, businessId: number, requestId: number | null) {
  const business = await findFirstRow(db, Business, byId(businessId));
  if (!business) throw new PhpError('Call to a member function update() on null');
  await eloquentSave(
    db,
    'businesses',
    business,
    { lft: businessId + 1, rgt: businessId + 1, depth: 1, business_request_id: requestId, is_business_approved: 0 },
    { massAssign: true },
  );
}

/**
 * Spatie HasTranslations::setTranslation($key, 'en', $value) on BusinessDetail (translatable description):
 * existing translations (null/'' filtered out) + en, stored as json_encode(..., JSON_UNESCAPED_UNICODE).
 */
function translationJson(raw: unknown, value: unknown): string {
  let translations: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try {
      const decoded = JSON.parse(raw);
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) translations = decoded;
    } catch {
      /* not JSON → no translations */
    }
  }
  const kept = Object.fromEntries(Object.entries(translations).filter(([, text]) => text !== null && text !== ''));
  kept.en = value;
  return JSON.stringify(kept).replace(/\//g, '\\/');
}

/**
 * update-user-business: saves the business columns, then
 * `$business->businessDetail()->updateOrCreate(['business_id' => id], [...])`.
 */
export async function updateBusinessAndDetail(
  db: Db,
  business: Row,
  businessValues: Record<string, unknown>,
  detailValues: Record<string, unknown>,
): Promise<void> {
  await eloquentSave(db, 'businesses', business, businessValues, { massAssign: false });

  const parent = await Business.findOne({ _id: business.id }, { details: 1 }, { session: db.session }).lean<Row>();
  const firstDetail = (parent?.details as Row[] | undefined)?.[0];
  const detail = firstDetail ? childRow('business_details', business.id, firstDetail) : null;
  if (detail) {
    detailValues.description = translationJson(detail.description, detailValues.description);
    await eloquentSave(db, 'business_details', detail, detailValues, { massAssign: true });
  } else {
    detailValues.description = translationJson(null, detailValues.description);
    const now = nowDb();
    const detailId = await nextId(`${BUSINESSES}.details`, db.session);
    const child = { id: detailId, ...tableRow('business_details', { ...detailValues, updated_at: now, created_at: now }) };
    await Business.updateOne({ _id: business.id }, { $push: { details: child } } as never, { session: db.session });
  }
}

// ------------------------------------------------------------------------- business images

/** BusinessImage::getImagesOfBusiness() — every image of the user's businesses, newest first. */
export async function findUserBusinessImages(userId: unknown): Promise<Row[]> {
  const ownedBusinesses = await Business.find({ user_id: looseEq(userId) }, { images: 1 }).lean<Row[]>();
  return ownedBusinesses
    .flatMap((business) =>
      ((business.images ?? []) as Row[]).map((image) => childRow('business_iamges', business._id as number, image)),
    )
    .sort((first, second) => Number(second.id) - Number(first.id));
}

/** Business::getUserBusiness() — only the image columns are selected. */
export async function getUserBusinessImageColumns(db: Db, userId: unknown): Promise<Row | null> {
  const business = await Business.findOne(
    { user_id: looseEq(userId), status: 1 },
    { _id: 0, image_1: 1, image_2: 1, image_3: 1, image_4: 1 },
    { sort: { _id: -1 }, session: db.session },
  ).lean<Row>();
  return business
    ? { image_1: business.image_1, image_2: business.image_2, image_3: business.image_3, image_4: business.image_4 }
    : null;
}

/** BusinessImage::create() with business_id NULL — the row has no parent and is kept in `_orphans`. */
export async function insertOrphanBusinessImage(imageUrl: unknown): Promise<void> {
  const now = nowDb();
  const imageId = await nextId(`${BUSINESSES}.images`);
  await OrphanRow.collection.insertOne({
    table: 'business_iamges',
    row: { id: imageId, business_id: null, img: imageUrl, created_at: now, updated_at: now },
  });
}

/** `BusinessImage::find($id)` — embedded in its business, or an orphan (business_id NULL). */
export async function findBusinessImage(db: Db, imageId: unknown): Promise<Row | null> {
  const match = looseEq(imageId);
  const parent = await Business.findOne({ 'images.id': match }, { images: 1 }, { session: db.session }).lean<Row>();
  const image = (parent?.images as Row[] | undefined)?.find((child) => String(child.id) === String(imageId));
  if (parent && image) return childRow('business_iamges', parent._id as number, image);
  const orphan = await OrphanRow.findOne({ table: 'business_iamges', 'row.id': match }, undefined, {
    session: db.session,
  }).lean<Row>();
  return orphan ? (orphan.row as Row) : null;
}

export async function deleteBusinessImageRow(image: Row) {
  if (image.business_id === null || image.business_id === undefined) {
    await OrphanRow.deleteOne({ table: 'business_iamges', 'row.id': image.id });
  } else {
    await Business.updateOne({ _id: image.business_id }, { $pull: { images: { id: image.id } } } as never);
  }
}

export const updateBusinessImageFile = (db: Db, image: Row, imageUrl: unknown) =>
  eloquentSave(db, 'business_iamges', image, { img: imageUrl, updated_at: nowDb() }, { massAssign: true });
