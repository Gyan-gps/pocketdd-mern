// Queries used by the admin panel lookup endpoints (routes/api.php "ADMIN PANEL Routes").
import type { AnyModel } from '../models/index.js';
import { CASE_INSENSITIVE } from '../db/eloquent.js';
import { toRow, toRows, type Row } from '../db/mongo.js';
import { Address } from '../models/address.model.js';
import { BusinessCategory } from '../models/business-category.model.js';
import { BusinessSubCategory } from '../models/business-sub-category.model.js';
import { Pincode } from '../models/pincode.model.js';

/** MySQL `col = '<route param>'`: a numeric string also matched the integer. */
export const looseValues = (value: unknown) => {
  const numeric =
    typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : null;
  return numeric === null ? [value] : [value, numeric];
};

export async function findSubCategoriesOfCategory(categoryId: string) {
  return toRows(await BusinessSubCategory.find({ parent_id: { $in: looseValues(categoryId) } }, null, { sort: { _id: 1 } }).lean());
}

export function findPincodeCitiesOfState(state: string) {
  return Pincode.find({ state: { $in: looseValues(state) } }, { city: 1 }, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean<
    Row[]
  >();
}

export async function findPincodes(filter: Row) {
  return toRows(await Pincode.find(filter, null, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean());
}

/** `->pluck('pincode_id')` over a whole table (the result is unused by the callers, but the query runs). */
export function pluckPincodeIds(model: AnyModel) {
  return model.find({}, { _id: 0, pincode_id: 1 }).lean<Row[]>();
}

export function findAddressPincodeIds() {
  return Address.find({}, { pincode_id: 1 }).lean<Row[]>();
}

export const addressFilter = (state: string, city: string, pincode: string): Row => ({
  state: { $in: looseValues(state) },
  city: { $in: looseValues(city) },
  pincode_id: { $in: looseValues(pincode) },
});

/** `select … from <table> where … limit 1` (case-insensitive, PK order). */
export const firstWhere = async (model: AnyModel, filter: Row, fields?: string[]) =>
  toRow(
    await model
      .findOne(filter, fields ? Object.fromEntries([['_id', 0], ...fields.map((field) => [field, 1])]) : null, {
        collation: CASE_INSENSITIVE,
        sort: { _id: 1 },
      })
      .lean(),
  );

export const firstAddress = (state: string, city: string, pincode: string, fields?: string[]) =>
  firstWhere(Address, addressFilter(state, city, pincode), fields);

export const firstPincode = (filter: Row, fields?: string[]) => firstWhere(Pincode, filter, fields);

export const firstBusinessCategory = (filter: Row, fields?: string[]) => firstWhere(BusinessCategory, filter, fields);

export async function findAddresses(state: string, city: string, pincode: string) {
  return toRows(await Address.find(addressFilter(state, city, pincode), null, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean());
}
