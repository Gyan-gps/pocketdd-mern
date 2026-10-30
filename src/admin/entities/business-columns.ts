// MySQL column layout of the tables behind the Business admin screens, and the Eloquent/MySQL write
// semantics that depended on it (column order of new rows, defaults, type coercion, `$guarded = ['id']`
// mass assignment, dirty-only updates). Documents keep the MySQL row shape, so new rows are built in
// table column order with the MySQL defaults.
import type { ClientSession, Document } from 'mongodb';
import { nowDb } from '../../core/time.js';
import { insertRow, nextId, type Row } from '../../db/mongo.js';
import { CASE_INSENSITIVE, originalIsEquivalent } from '../../db/eloquent.js';
import { Business, BusinessRequest, BusinessSubCategory, EMBEDDED_TABLES, modelFor, type AnyModel } from '../../models/index.js';

type Kind = 'int' | 'str' | 'date' | 'ts';
type Spec = Array<[string, Kind, unknown?]>;

const intColumn = (name: string, fallback?: unknown): [string, Kind, unknown?] => [name, 'int', fallback];
const stringColumn = (name: string, fallback?: unknown): [string, Kind, unknown?] => [name, 'str', fallback];
const timestampColumn = (name: string): [string, Kind] => [name, 'ts'];
const dateColumn = (name: string): [string, Kind] => [name, 'date'];

/** A model, or a collection / old table name resolved through `modelFor()`. */
const resolveModel = (source: AnyModel | string): AnyModel => (typeof source === 'string' ? modelFor(source) : source);

/** information_schema.COLUMNS (ORDINAL_POSITION), without `id`; third item = COLUMN_DEFAULT. */
export const COLUMNS: Record<string, Spec> = {
  businesses: [
    intColumn('user_id'), intColumn('business_category_id'), intColumn('business_sub_category_id'), stringColumn('name'),
    intColumn('lft'), intColumn('rgt'), intColumn('depth'), intColumn('parent_id'), stringColumn('address'),
    stringColumn('city'), stringColumn('logo'), stringColumn('slug'), intColumn('status', 0), timestampColumn('created_at'),
    timestampColumn('updated_at'), stringColumn('state_en'), stringColumn('dist_en'), stringColumn('business_name_en'),
    stringColumn('business_name_hi'), stringColumn('keywords'), stringColumn('state_hi'), stringColumn('dist_hi'),
    stringColumn('tehsil_en'), stringColumn('area_en'), stringColumn('area_hi'), stringColumn('address_line_1_en'),
    stringColumn('address_line_1_hi'), stringColumn('pincode_hi'), intColumn('to_show'), dateColumn('from_date'),
    dateColumn('exp_date'), stringColumn('business_contact_1'), stringColumn('business_contact_2'),
    stringColumn('business_contact_3'), stringColumn('business_contact_4'), stringColumn('about_en'),
    stringColumn('about_hi'), stringColumn('business_email'), stringColumn('image_1'), stringColumn('image_2'),
    stringColumn('image_3'), stringColumn('image_4'), stringColumn('social_media_url'), stringColumn('owner_name_en'),
    stringColumn('owner_name_hi'), intColumn('pincode_id'), stringColumn('owner_email'), stringColumn('owner_number_1'),
    stringColumn('tehsil_hi'), stringColumn('receipt_number'), intColumn('business_request_id'),
    intColumn('is_business_approved', 0), stringColumn('mediator'), stringColumn('pan'), stringColumn('aadhaar'),
    stringColumn('gst'), stringColumn('valid_till'), stringColumn('business_payment_mode'), stringColumn('business_fess'),
    stringColumn('fees_type'), stringColumn('keywords_hi'),
  ],
  users: [
    stringColumn('name'), stringColumn('email'), stringColumn('phone'), timestampColumn('email_verified_at'),
    stringColumn('password'), intColumn('status'), stringColumn('remember_token'), timestampColumn('created_at'),
    timestampColumn('updated_at'), stringColumn('fcm_token'), stringColumn('user_icon'), intColumn('is_mobile_user'),
    stringColumn('state'), stringColumn('district'), stringColumn('address_line'), stringColumn('street_address'),
    stringColumn('about_us'), stringColumn('tehsil'), stringColumn('pincode'), stringColumn('post_address'),
    intColumn('is_business_owner'),
  ],
  business_owners: [
    intColumn('business_id'), stringColumn('name'), stringColumn('phone'), timestampColumn('created_at'),
    timestampColumn('updated_at'), intColumn('user_id'),
  ],
  business_categories: [
    stringColumn('name'), intColumn('location_id'), stringColumn('img'), stringColumn('slug'), intColumn('lft'),
    intColumn('rgt'), intColumn('depth'), intColumn('parent_id'), intColumn('status'), timestampColumn('created_at'),
    timestampColumn('updated_at'), stringColumn('name_hi'),
  ],
  business_sub_categories: [
    stringColumn('name'), intColumn('business_category_id'), intColumn('lft'), intColumn('rgt'), intColumn('depth'),
    intColumn('parent_id'), stringColumn('img'), stringColumn('slug'), intColumn('status', 0), timestampColumn('created_at'),
    timestampColumn('updated_at'), stringColumn('name_hi'),
  ],
  business_users: [
    intColumn('user_id'), stringColumn('name'), stringColumn('address_line_1'), stringColumn('street_address'),
    stringColumn('post'), stringColumn('tahsil'), stringColumn('pincode'), stringColumn('district'), stringColumn('state'),
    stringColumn('phone'), stringColumn('email'), intColumn('lft'), intColumn('rgt'), intColumn('depth'),
    intColumn('parent_id'), stringColumn('password'), stringColumn('profile_img'), stringColumn('description'),
    intColumn('status', 0), timestampColumn('created_at'), timestampColumn('updated_at'), intColumn('pincode_id'),
    stringColumn('designation'), stringColumn('aadhar_no'), stringColumn('description_hi'),
  ],
  business_users_location: [
    intColumn('business_user_id'), intColumn('temp_location_id'), intColumn('location_id'), stringColumn('language', 'en'),
    timestampColumn('created_at'), timestampColumn('updated_at'),
  ],
  business_details: [
    intColumn('business_id'), stringColumn('street_address'), stringColumn('post'), stringColumn('tahsil'),
    stringColumn('district'), stringColumn('state'), stringColumn('business_email'), stringColumn('business_mobile_number'),
    stringColumn('description'), stringColumn('summaries'), timestampColumn('created_at'), timestampColumn('updated_at'),
    stringColumn('pincode'), stringColumn('other_partner_name'), stringColumn('address_line'), intColumn('pincode_id'),
  ],
  business_iamges: [intColumn('business_id'), stringColumn('img'), timestampColumn('created_at'), timestampColumn('updated_at')],
  business_locations: [
    intColumn('business_id'), intColumn('location_id'), timestampColumn('created_at'), timestampColumn('updated_at'),
  ],
};

const kindOf = (table: string, column: string) => COLUMNS[table]?.find(([name]) => name === column)?.[1];

/** The value MySQL stores for a bound PHP value in a column of this type (what a later SELECT returns). */
export function coerce(kind: Kind | undefined, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (!kind) return value;
  if (kind === 'int') {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string' && /^\s*[+-]?\d+(\.\d+)?\s*$/.test(value)) return Math.round(Number(value));
    return value;
  }
  if (kind === 'str') {
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? '1' : '';
    return value;
  }
  if (kind === 'date' && typeof value === 'string') {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
    return match ? `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}` : value;
  }
  return value;
}

/** Coerce known columns of a partial row. */
export function coerceRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, coerce(kindOf(table, key), value)]));
}

/** `$guarded = ['id']` mass assignment: attributes that are not table columns are dropped. */
export function onlyColumns(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const columns = new Set(COLUMNS[table]!.map(([name]) => name));
  return Object.fromEntries(Object.entries(data).filter(([key]) => columns.has(key)));
}

/** A new row (no id) in table column order: given values coerced, the rest at their MySQL default. */
export function newRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [column, kind, fallback] of COLUMNS[table]!) {
    row[column] = column in data ? coerce(kind, data[column]) : (fallback ?? null);
  }
  return row;
}

/** Collection of an old table name (a name without a model is taken as a collection name). */
function collectionOfTable(table: string): string {
  try {
    return modelFor(table).collection.collectionName;
  } catch {
    return table;
  }
}

/** Only the table's columns of a document row (drops embedded arrays such as `details`, `owners`, `locations`). */
export function tableRow(table: string, row: Row): Row {
  const parentCollection = collectionOfTable(table);
  const embeddedFields = new Set(
    Object.values(EMBEDDED_TABLES)
      .filter((embedded) => embedded.parentModel.collection.collectionName === parentCollection)
      .map((embedded) => embedded.field),
  );
  return Object.fromEntries(Object.entries(row).filter(([key]) => !embeddedFields.has(key) && key !== 'geo'));
}

/** Eloquent `create()` into a top-level collection (timestamps set). Returns the new id. */
export async function modelCreate(table: string, data: Record<string, unknown>, session?: ClientSession): Promise<number> {
  const now = nowDb();
  const row = newRow(table, { ...onlyColumns(table, data), updated_at: now, created_at: now });
  return insertRow(modelFor(table).collection.collectionName, row, session);
}

/** Push a new embedded child row (`table` is the old child table; `data` holds the parent fk). */
export async function childCreate(table: string, data: Record<string, unknown>): Promise<number> {
  const embedded = EMBEDDED_TABLES[table]!;
  const { [embedded.foreignKey]: parentId, ...rest } = newRow(table, data);
  const id = await nextId(`${embedded.parentModel.collection.collectionName}.${embedded.field}`);
  await embedded.parentModel.updateOne({ _id: parentId } as never, { $push: { [embedded.field]: { id, ...rest } } } as never);
  return id;
}

/**
 * `$model->update($attrs)` / `save()` for a loaded row (top-level table or embedded child table): only dirty
 * attributes are written, updated_at touched when something changed. Mutates `row` like Eloquent.
 */
export async function modelSave(table: string, row: Row, attrs: Record<string, unknown>, opts: { massAssign: boolean }) {
  let entries = Object.entries(attrs);
  if (opts.massAssign) entries = Object.entries(onlyColumns(table, attrs)).filter(([key]) => key !== 'id');
  const dirty: Array<[string, unknown]> = [];
  for (const [key, attribute] of entries) {
    const value = attribute === undefined ? null : attribute;
    if (!originalIsEquivalent(row, key, value)) dirty.push([key, value]);
  }
  if (dirty.length && !dirty.some(([key]) => key === 'updated_at')) {
    const now = nowDb();
    if (!originalIsEquivalent(row, 'updated_at', now)) dirty.push(['updated_at', now]);
  }
  if (dirty.length) await setColumns(table, row.id, Object.fromEntries(dirty));
  for (const [key, value] of entries) row[key] = value === undefined ? null : value;
  for (const [key, value] of dirty) row[key] = value;
}

/** `UPDATE <table> SET … WHERE id = ?` (values coerced like MySQL). */
export async function setColumns(table: string, id: unknown, values: Record<string, unknown>) {
  const set = coerceRow(table, values);
  const embedded = EMBEDDED_TABLES[table];
  if (embedded) {
    await embedded.parentModel.updateOne(
      { [`${embedded.field}.id`]: id } as never,
      { $set: Object.fromEntries(Object.entries(set).map(([key, value]) => [`${embedded.field}.$.${key}`, value])) } as never,
    );
    return;
  }
  await modelFor(table).updateOne({ _id: id } as never, { $set: set });
}

/** `WHERE id = ?` with a request/varchar value: MySQL compares it as a number ('7abc' → 7, null → no row). */
export function sqlId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = parseFloat(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** `SELECT <field> FROM <table> WHERE id = ?` (null when there is no row). */
export async function fieldById(source: AnyModel | string, id: unknown, field: string): Promise<{ value: unknown } | null> {
  const rowId = sqlId(id);
  if (rowId === null) return null;
  const row = await resolveModel(source).findOne({ _id: rowId } as never, { [field]: 1 }).lean<Row>();
  return row ? { value: row[field] ?? null } : null;
}

/** Rows → select options `{ value: String(id-ish), label }` (null labels render as ''). */
export const toOptions = (rows: Document[], value: string, label: string) =>
  rows.map((row) => ({
    value: String(row[value]),
    label: row[label] === null || row[label] === undefined ? '' : String(row[label]),
  }));

/** `Model::where(...)->pluck(label, id)` without ORDER BY → primary-key order. */
export async function idOptions(source: AnyModel | string, filter: Document, label: string, sort: Document = { _id: 1 }) {
  const rows = await resolveModel(source).find(filter, { [label]: 1 }, { sort, collation: CASE_INSENSITIVE }).lean<Row[]>();
  return toOptions(rows, '_id', label);
}

/** `status = '1'`-style loose equality on an int column. */
export const looseInt = (value: unknown) => {
  const numeric = typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : null;
  return numeric === null ? value : { $in: [value, numeric] };
};

/** Business delete with the old `ON DELETE CASCADE` on businesse_requests (embedded children go with the document). */
export async function deleteBusinesses(filter: Document) {
  const ids = (await Business.find(filter, { _id: 1 }).lean<Row[]>()).map((business) => business._id);
  if (!ids.length) return;
  await BusinessRequest.deleteMany({ business_id: { $in: ids } });
  await Business.deleteMany({ _id: { $in: ids } } as never);
}

/** Sub-category delete cascade: its businesses. */
export async function cascadeSubCategories(ids: number[]) {
  if (ids.length) await deleteBusinesses({ business_sub_category_id: { $in: ids } });
}

/** Category delete cascade: its sub-categories (and their businesses) and its businesses. */
export async function cascadeCategory(id: number) {
  const subCategoryIds = (await BusinessSubCategory.find({ parent_id: id }, { _id: 1 }).lean<Row[]>()).map(
    (subCategory) => subCategory._id as number,
  );
  await cascadeSubCategories(subCategoryIds);
  await BusinessSubCategory.deleteMany({ _id: { $in: subCategoryIds } } as never);
  await deleteBusinesses({ business_category_id: id });
}

/** `X::find($id)->update(['lft' => $id + 1, 'rgt' => $id + 1, 'depth' => 1])` after the trait store(). */
export async function setTreeColumns(table: string, id: number) {
  const row = await modelFor(table).findOne({ _id: id } as never).lean<Row>();
  if (row) await modelSave(table, { ...row, id }, { lft: id + 1, rgt: id + 1, depth: 1 }, { massAssign: false });
}

/** `has('x')` list filter with a value: `where x = value` (case-insensitive via the list collation, '1' = 1). */
export function eqFilter(input: Record<string, unknown>, key: string, column = key): Document[] {
  const value = input[key];
  return value === null || value === undefined || value === '' ? [] : [{ [column]: looseInt(value) }];
}

/** `SELECT <field> FROM <table> [WHERE …] ORDER BY <sort>` with MySQL string ordering (PK breaks ties). */
export const selectSorted = (source: AnyModel | string, fields: string[], filter: Document = {}, sort: Document = { _id: 1 }) =>
  resolveModel(source)
    .find(filter, Object.fromEntries(fields.map((field) => [field, 1])), {
      sort: '_id' in sort ? sort : { ...sort, _id: 1 },
      collation: { ...CASE_INSENSITIVE, numericOrdering: true },
    })
    .lean<Row[]>()
    .then((rows) => rows.map((row) => toRowFields(row)));

const toRowFields = (document: Document): Row => {
  const { _id, ...rest } = document;
  return { id: _id, ...rest };
};
