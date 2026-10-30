// Queries used by the home endpoints (Api\ApiController).
import type { PipelineStage } from 'mongoose';
import { CASE_INSENSITIVE } from '../db/eloquent.js';
import { intId, like, toRow, toRows, type Row } from '../db/mongo.js';
import { AboutUs } from '../models/about-us.model.js';
import { Advertisement } from '../models/advertisement.model.js';
import { Business } from '../models/business.model.js';
import { BusinessCategory } from '../models/business-category.model.js';
import { BusinessSubCategory } from '../models/business-sub-category.model.js';
import { BusinessUser } from '../models/business-user.model.js';
import { Location } from '../models/location.model.js';
import { PersonalAccessToken } from '../models/personal-access-token.model.js';
import { Pincode } from '../models/pincode.model.js';
import { User } from '../models/user.model.js';
import type { AnyModel } from '../models/index.js';

type Doc = { _id: number; [key: string]: any };

/** `findOne` in PK order, as a MySQL-shaped row. */
async function findRow(model: AnyModel, filter: Row, collation = true): Promise<Row | null> {
  return toRow(
    await model.findOne(filter, undefined, { sort: { _id: 1 }, ...(collation ? { collation: CASE_INSENSITIVE } : {}) }).lean<Row>(),
  );
}

// ---------------------------------------------------------------------------------------------
// Tokens / users
// ---------------------------------------------------------------------------------------------

export const findTokenByHash = (hashedToken: string) => findRow(PersonalAccessToken, { token: hashedToken }, false);
export const findTokenById = (tokenId: number) => findRow(PersonalAccessToken, { _id: tokenId }, false);
export const findUserById = (userId: number) => findRow(User, { _id: userId }, false);
export const findBusinessUserByUserId = (userId: unknown) => findRow(BusinessUser, { user_id: userId }, false);
export const findLocationById = (locationId: unknown) => findRow(Location, { _id: locationId }, false);

// ---------------------------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------------------------

/** `Business::find($id)` */
export async function findBusiness(id: unknown): Promise<Row | null> {
  const businessId = id === null || id === undefined ? null : intId(id);
  return businessId === null ? null : findRow(Business, { _id: businessId }, false);
}

export const findBusinessBySlug = (slug: unknown) => findRow(Business, { slug });
export const findBusinessByUserId = (userId: unknown) => findRow(Business, { user_id: userId }, false);

/** Id-only lookup of a user's business. */
export const findBusinessIdOfUser = (userId: unknown) => Business.findOne({ user_id: userId }, { _id: 1 }).lean<Doc>();

export const findBusinessIdInCategory = (categoryId: unknown) =>
  Business.findOne({ business_category_id: categoryId }, { _id: 1 }).lean<Doc>();

export async function searchBusinesses(filter: Row): Promise<Row[]> {
  return toRows(await Business.find(filter, undefined, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean<Doc[]>());
}

export const findBusinessSubCategoryIds = (businessIds: number[]) =>
  Business.find({ _id: { $in: businessIds } }, { business_sub_category_id: 1 }).lean<Doc[]>();

export const findListedBusinesses = (filter: Row, orderByField: string) =>
  Business.find(filter, undefined, { collation: CASE_INSENSITIVE, sort: { [orderByField]: 1, _id: 1 } }).lean<Doc[]>();

/** Number of businesses per sub-category, as `{ _id: subCategoryId, n }` groups. */
export const countBusinessesBySubCategory = (match: Row) =>
  Business.aggregate<{ _id: unknown; n: number }>([
    { $match: match },
    { $group: { _id: '$business_sub_category_id', n: { $sum: 1 } } },
  ] as PipelineStage[]).option({ collation: CASE_INSENSITIVE });

// ---------------------------------------------------------------------------------------------
// Categories / sub-categories
// ---------------------------------------------------------------------------------------------

export const findActiveCategories = (nameField: string) =>
  BusinessCategory.find(
    { status: 1 },
    { [nameField]: 1, slug: 1, img: 1 },
    { collation: CASE_INSENSITIVE, sort: { [nameField]: 1, _id: 1 } },
  ).lean<Doc[]>();

export const findCategoryBySlug = (slug: unknown) => findRow(BusinessCategory, { slug });
export const findCategoryById = (categoryId: unknown) => findRow(BusinessCategory, { _id: categoryId }, false);

export async function searchCategories(search: string, hindiSearch: string): Promise<Row[]> {
  return toRows(
    await BusinessCategory.find(
      { $or: [{ name: like(search) }, { name_hi: like(hindiSearch) }, { name_hi: like(search) }] },
      undefined,
      { sort: { _id: 1 } },
    ).lean<Doc[]>(),
  );
}

/** Number of active sub-categories per category, as `{ _id: categoryId, n }` groups. */
export const countActiveSubCategoriesByCategory = (categoryIds: number[]) =>
  BusinessSubCategory.aggregate<{ _id: unknown; n: number }>([
    { $match: { status: 1, parent_id: { $in: categoryIds } } },
    { $group: { _id: '$parent_id', n: { $sum: 1 } } },
  ]);

export const findSubCategoryIdInCategory = (categoryId: unknown) =>
  BusinessSubCategory.findOne({ parent_id: categoryId }, { _id: 1 }).lean<Doc>();

export async function searchSubCategories(search: string): Promise<Row[]> {
  return toRows(await BusinessSubCategory.find({ name: like(search) }, undefined, { sort: { _id: 1 } }).lean<Doc[]>());
}

export const findActiveSubCategories = (categoryId: unknown, nameField: string) =>
  BusinessSubCategory.find(
    { parent_id: categoryId, status: 1 },
    { [nameField]: 1, slug: 1, status: 1, img: 1 },
    { collation: CASE_INSENSITIVE, sort: { [nameField]: 1, _id: 1 } },
  ).lean<Doc[]>();

export const findSubCategoryBySlug = (slug: unknown) => findRow(BusinessSubCategory, { slug });
export const findSubCategoryByHindiName = (nameHi: unknown) => findRow(BusinessSubCategory, { name_hi: nameHi });

// ---------------------------------------------------------------------------------------------
// Advertisements
// ---------------------------------------------------------------------------------------------

export const findActiveAdsWithClient = (adsPosition: string, adsLocation: string) =>
  Advertisement.find(
    { ads_position: adsPosition, ads_location: adsLocation, status: 1 },
    { _id: 0, advt_img: 1, client_name: 1 },
    { collation: CASE_INSENSITIVE, sort: { _id: 1 } },
  ).lean<Doc[]>();

export const findInnerAdImages = (adsLocation: string) =>
  Advertisement.find(
    { ads_position: 'inner', ads_location: adsLocation, status: 1 },
    { _id: 0, advt_img: 1 },
    { collation: CASE_INSENSITIVE, sort: { _id: 1 } },
  ).lean<Doc[]>();

/** Active inner ads shown on (same / multiple) category pages. */
export const findCategoryPageAds = () =>
  Advertisement.find(
    {
      ads_position: 'inner',
      status: 1,
      ads_location: { $in: ['Same Category/Subcategory Page', 'Multiple Category/Subcategory Page'] },
    },
    undefined,
    { collation: CASE_INSENSITIVE, sort: { _id: 1 } },
  ).lean<Doc[]>();

// ---------------------------------------------------------------------------------------------
// Pincodes / about us
// ---------------------------------------------------------------------------------------------

export const findPincode = (filter: Row) => findRow(Pincode, filter);
export const findAboutUs = (state: unknown, city: unknown) => findRow(AboutUs, { state, city });
