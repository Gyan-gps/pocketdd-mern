// MySQL column layout of the tables behind the Business admin screens, and the Eloquent/MySQL write
// semantics that depended on it (column order of new rows, defaults, type coercion, `$guarded = ['id']`
// mass assignment, dirty-only updates). Documents keep the MySQL row shape, so new rows are built in
// table column order with the MySQL defaults.
import type { ClientSession, Document } from 'mongodb';
import { nowDb } from '../../core/time.js';
import { C, EMBEDDED, TABLE_COLLECTION, col, insertRow, nextId, type EmbeddedTable, type Row } from '../../db/mongo.js';
import { originalIsEquivalent } from '../../db/eloquent.js';

type Kind = 'int' | 'str' | 'date' | 'ts';
type Spec = Array<[string, Kind, unknown?]>;

const i = (c: string, d?: unknown): [string, Kind, unknown?] => [c, 'int', d];
const s = (c: string, d?: unknown): [string, Kind, unknown?] => [c, 'str', d];
const t = (c: string): [string, Kind] => [c, 'ts'];
const d = (c: string): [string, Kind] => [c, 'date'];

/** information_schema.COLUMNS (ORDINAL_POSITION), without `id`; third item = COLUMN_DEFAULT. */
export const COLUMNS: Record<string, Spec> = {
  businesses: [
    i('user_id'), i('business_category_id'), i('business_sub_category_id'), s('name'), i('lft'), i('rgt'), i('depth'),
    i('parent_id'), s('address'), s('city'), s('logo'), s('slug'), i('status', 0), t('created_at'), t('updated_at'),
    s('state_en'), s('dist_en'), s('business_name_en'), s('business_name_hi'), s('keywords'), s('state_hi'), s('dist_hi'),
    s('tehsil_en'), s('area_en'), s('area_hi'), s('address_line_1_en'), s('address_line_1_hi'), s('pincode_hi'), i('to_show'),
    d('from_date'), d('exp_date'), s('business_contact_1'), s('business_contact_2'), s('business_contact_3'),
    s('business_contact_4'), s('about_en'), s('about_hi'), s('business_email'), s('image_1'), s('image_2'), s('image_3'),
    s('image_4'), s('social_media_url'), s('owner_name_en'), s('owner_name_hi'), i('pincode_id'), s('owner_email'),
    s('owner_number_1'), s('tehsil_hi'), s('receipt_number'), i('business_request_id'), i('is_business_approved', 0),
    s('mediator'), s('pan'), s('aadhaar'), s('gst'), s('valid_till'), s('business_payment_mode'), s('business_fess'),
    s('fees_type'), s('keywords_hi'),
  ],
  users: [
    s('name'), s('email'), s('phone'), t('email_verified_at'), s('password'), i('status'), s('remember_token'), t('created_at'),
    t('updated_at'), s('fcm_token'), s('user_icon'), i('is_mobile_user'), s('state'), s('district'), s('address_line'),
    s('street_address'), s('about_us'), s('tehsil'), s('pincode'), s('post_address'), i('is_business_owner'),
  ],
  business_owners: [i('business_id'), s('name'), s('phone'), t('created_at'), t('updated_at'), i('user_id')],
  business_categories: [
    s('name'), i('location_id'), s('img'), s('slug'), i('lft'), i('rgt'), i('depth'), i('parent_id'), i('status'),
    t('created_at'), t('updated_at'), s('name_hi'),
  ],
  business_sub_categories: [
    s('name'), i('business_category_id'), i('lft'), i('rgt'), i('depth'), i('parent_id'), s('img'), s('slug'), i('status', 0),
    t('created_at'), t('updated_at'), s('name_hi'),
  ],
  business_users: [
    i('user_id'), s('name'), s('address_line_1'), s('street_address'), s('post'), s('tahsil'), s('pincode'), s('district'),
    s('state'), s('phone'), s('email'), i('lft'), i('rgt'), i('depth'), i('parent_id'), s('password'), s('profile_img'),
    s('description'), i('status', 0), t('created_at'), t('updated_at'), i('pincode_id'), s('designation'), s('aadhar_no'),
    s('description_hi'),
  ],
  business_users_location: [
    i('business_user_id'), i('temp_location_id'), i('location_id'), s('language', 'en'), t('created_at'), t('updated_at'),
  ],
  business_details: [
    i('business_id'), s('street_address'), s('post'), s('tahsil'), s('district'), s('state'), s('business_email'),
    s('business_mobile_number'), s('description'), s('summaries'), t('created_at'), t('updated_at'), s('pincode'),
    s('other_partner_name'), s('address_line'), i('pincode_id'),
  ],
  business_iamges: [i('business_id'), s('img'), t('created_at'), t('updated_at')],
  business_locations: [i('business_id'), i('location_id'), t('created_at'), t('updated_at')],
};

const kindOf = (table: string, c: string) => COLUMNS[table]?.find(([n]) => n === c)?.[1];

/** The value MySQL stores for a bound PHP value in a column of this type (what a later SELECT returns). */
export function coerce(kind: Kind | undefined, v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (!kind) return v;
  if (kind === 'int') {
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string' && /^\s*[+-]?\d+(\.\d+)?\s*$/.test(v)) return Math.round(Number(v));
    return v;
  }
  if (kind === 'str') {
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '';
    return v;
  }
  if (kind === 'date' && typeof v === 'string') {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
    return m ? `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}` : v;
  }
  return v;
}

/** Coerce known columns of a partial row. */
export function coerceRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, coerce(kindOf(table, k), v)]));
}

/** `$guarded = ['id']` mass assignment: attributes that are not table columns are dropped. */
export function onlyColumns(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const cols = new Set(COLUMNS[table]!.map(([c]) => c));
  return Object.fromEntries(Object.entries(data).filter(([k]) => cols.has(k)));
}

/** A new row (no id) in table column order: given values coerced, the rest at their MySQL default. */
export function newRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [c, kind, def] of COLUMNS[table]!) out[c] = c in data ? coerce(kind, data[c]) : (def ?? null);
  return out;
}

/** Only the table's columns of a document row (drops embedded arrays such as `details`, `owners`, `locations`). */
export function tableRow(table: string, row: Row): Row {
  const embeddedFields = new Set(
    Object.values(EMBEDDED)
      .filter((e) => e.parent === (TABLE_COLLECTION[table] ?? table))
      .map((e) => e.field as string),
  );
  return Object.fromEntries(Object.entries(row).filter(([k]) => !embeddedFields.has(k) && k !== 'geo'));
}

/** Eloquent `create()` into a top-level collection (timestamps set). Returns the new id. */
export async function modelCreate(table: string, data: Record<string, unknown>, session?: ClientSession): Promise<number> {
  const now = nowDb();
  const row = newRow(table, { ...onlyColumns(table, data), updated_at: now, created_at: now });
  return insertRow(TABLE_COLLECTION[table]!, row, session);
}

/** Push a new embedded child row (`table` is the old child table; `data` holds the parent fk). */
export async function childCreate(table: EmbeddedTable, data: Record<string, unknown>): Promise<number> {
  const e = EMBEDDED[table];
  const { [e.fk]: parentId, ...rest } = newRow(table, data);
  const id = await nextId(`${e.parent}.${e.field}`);
  await col(e.parent).updateOne({ _id: parentId } as never, { $push: { [e.field]: { id, ...rest } } } as never);
  return id;
}

/**
 * `$model->update($attrs)` / `save()` for a loaded row (top-level table or embedded child table): only dirty
 * attributes are written, updated_at touched when something changed. Mutates `row` like Eloquent.
 */
export async function modelSave(table: string, row: Row, attrs: Record<string, unknown>, opts: { massAssign: boolean }) {
  let entries = Object.entries(attrs);
  if (opts.massAssign) entries = Object.entries(onlyColumns(table, attrs)).filter(([k]) => k !== 'id');
  const dirty: Array<[string, unknown]> = [];
  for (const [k, v] of entries) {
    const value = v === undefined ? null : v;
    if (!originalIsEquivalent(row, k, value)) dirty.push([k, value]);
  }
  if (dirty.length && !dirty.some(([k]) => k === 'updated_at')) {
    const now = nowDb();
    if (!originalIsEquivalent(row, 'updated_at', now)) dirty.push(['updated_at', now]);
  }
  if (dirty.length) await setColumns(table, row.id, Object.fromEntries(dirty));
  for (const [k, v] of entries) row[k] = v === undefined ? null : v;
  for (const [k, v] of dirty) row[k] = v;
}

/** `UPDATE <table> SET … WHERE id = ?` (values coerced like MySQL). */
export async function setColumns(table: string, id: unknown, values: Record<string, unknown>) {
  const set = coerceRow(table, values);
  const e = EMBEDDED[table as EmbeddedTable];
  if (e) {
    await col(e.parent).updateOne(
      { [`${e.field}.id`]: id } as never,
      { $set: Object.fromEntries(Object.entries(set).map(([k, v]) => [`${e.field}.$.${k}`, v])) } as never,
    );
    return;
  }
  await col(TABLE_COLLECTION[table]!).updateOne({ _id: id } as never, { $set: set });
}

/** `WHERE id = ?` with a request/varchar value: MySQL compares it as a number ('7abc' → 7, null → no row). */
export function sqlId(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
}

/** `SELECT <field> FROM <collection> WHERE id = ?` (null when there is no row). */
export async function fieldById(collection: string, id: unknown, field: string): Promise<{ v: unknown } | null> {
  const n = sqlId(id);
  if (n === null) return null;
  const doc = await col(collection).findOne({ _id: n } as never, { projection: { [field]: 1 } });
  return doc ? { v: doc[field] ?? null } : null;
}

/** Rows → select options `{ value: String(id-ish), label }` (null labels render as ''). */
export const toOptions = (rows: Document[], value: string, label: string) =>
  rows.map((r) => ({ value: String(r[value]), label: r[label] === null || r[label] === undefined ? '' : String(r[label]) }));

/** `Model::where(...)->pluck(label, id)` without ORDER BY → primary-key order. */
export async function idOptions(collection: string, filter: Document, label: string, sort: Document = { _id: 1 }) {
  const rows = await col(collection)
    .find(filter, { projection: { [label]: 1 }, sort, collation: { locale: 'en', strength: 2 } })
    .toArray();
  return toOptions(rows, '_id', label);
}

/** `status = '1'`-style loose equality on an int column. */
export const looseInt = (v: unknown) => {
  const n = typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
  return n === null ? v : { $in: [v, n] };
};

export { C };

/** Business delete with the old `ON DELETE CASCADE` on businesse_requests (embedded children go with the document). */
export async function deleteBusinesses(filter: Document) {
  const ids = (await col(C.businesses).find(filter, { projection: { _id: 1 } }).toArray()).map((b) => b._id);
  if (!ids.length) return;
  await col(C.businessRequests).deleteMany({ business_id: { $in: ids } });
  await col(C.businesses).deleteMany({ _id: { $in: ids } } as never);
}

/** Sub-category delete cascade: its businesses. */
export async function cascadeSubCategories(ids: number[]) {
  if (ids.length) await deleteBusinesses({ business_sub_category_id: { $in: ids } });
}

/** Category delete cascade: its sub-categories (and their businesses) and its businesses. */
export async function cascadeCategory(id: number) {
  const subs = (await col(C.businessSubCategories).find({ parent_id: id }, { projection: { _id: 1 } }).toArray()).map((r) => r._id as unknown as number);
  await cascadeSubCategories(subs);
  await col(C.businessSubCategories).deleteMany({ _id: { $in: subs } } as never);
  await deleteBusinesses({ business_category_id: id });
}

/** `X::find($id)->update(['lft' => $id + 1, 'rgt' => $id + 1, 'depth' => 1])` after the trait store(). */
export async function setTreeColumns(table: string, id: number) {
  const row = await col(TABLE_COLLECTION[table]!).findOne({ _id: id } as never);
  if (row) await modelSave(table, { ...row, id }, { lft: id + 1, rgt: id + 1, depth: 1 }, { massAssign: false });
}

/** `has('x')` list filter with a value: `where x = value` (case-insensitive via the list collation, '1' = 1). */
export function eqFilter(input: Record<string, unknown>, key: string, column = key): Document[] {
  const v = input[key];
  return v === null || v === undefined || v === '' ? [] : [{ [column]: looseInt(v) }];
}

/** `SELECT <field> FROM <collection> [WHERE …] ORDER BY <sort>` with MySQL string ordering (PK breaks ties). */
export const selectSorted = (collection: string, fields: string[], filter: Document = {}, sort: Document = { _id: 1 }) =>
  col(collection)
    .find(filter, {
      projection: Object.fromEntries(fields.map((f) => [f, 1])),
      sort: '_id' in sort ? sort : { ...sort, _id: 1 },
      collation: { locale: 'en', strength: 2, numericOrdering: true },
    })
    .toArray()
    .then((rows) => rows.map((r) => toRowFields(r)));

const toRowFields = (doc: Document): Row => {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
};
