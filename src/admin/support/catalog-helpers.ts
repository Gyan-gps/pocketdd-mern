// Shared Eloquent/Backpack behaviour for the catalog admin screens
// (business-category, business-sub-category, advertisment, slider, location). Storage is MongoDB:
// filters returned here are Mongo filters written against the row shape (`id` is mapped to `_id` by the engine).
import type { PipelineStage } from 'mongoose';
import { nowDb } from '../../core/time.js';
import { CASE_INSENSITIVE } from '../../db/eloquent.js';
import { intId, toRow, type Filter, type Row } from '../../db/mongo.js';
import { modelFor } from '../../models/index.js';

type Kind = 'int' | 'str' | 'dec' | 'date' | 'dt' | 'time' | 'ts' | 'json' | { enum: string[] };
type Spec = Array<[string, Kind, unknown?]>;

const int = (column: string, columnDefault?: unknown): [string, Kind, unknown?] => [column, 'int', columnDefault];
const str = (column: string): [string, Kind] => [column, 'str'];
const json = (column: string): [string, Kind] => [column, 'json'];
const timestamp = (column: string): [string, Kind] => [column, 'ts'];
const PAGE_LOCATION = {
  enum: ['home', 'business_categories_search', 'business_page', 'business_details_page', 'event_page', 'notification_page'],
};

/** information_schema.COLUMNS (ORDINAL_POSITION), without `id`; third item = COLUMN_DEFAULT. */
export const SCHEMA: Record<string, Spec> = {
  about_uses: [str('state'), str('city'), str('about_mediator'), str('about_mediator_hi'), str('know_your_city'), str('know_your_city_hi'), json('tourist_places'), int('status', 1), timestamp('created_at'), timestamp('updated_at')],
  addresses: [str('state'), str('city'), int('pincode_id'), str('tehsil'), str('tehsil_hi'), json('area'), json('area_hi'), ['price', 'dec'], int('status', 1), timestamp('created_at'), timestamp('updated_at')],
  administrators: [int('department_id'), int('designation_id'), str('officer_position'), str('officer_mobile_number'), int('location_id'), int('status', 0), timestamp('created_at'), timestamp('updated_at'), str('city'), str('state'), json('officer_rank_name'), int('pincode_id')],
  advertisments: [str('client_name'), str('advt_img'), ['from_date', 'dt'], ['to_date', 'dt'], ['amount', 'dec'], int('lft'), int('rgt'), int('depth'), int('parent_id'), ['page_location', PAGE_LOCATION], str('url'), int('status', 0), timestamp('created_at'), timestamp('updated_at'), str('ads_position'), str('ads_location'), json('sub_category_name'), str('fees_type')],
  business_categories: [str('name'), int('location_id'), str('img'), str('slug'), int('lft'), int('rgt'), int('depth'), int('parent_id'), int('status'), timestamp('created_at'), timestamp('updated_at'), str('name_hi')],
  business_sub_categories: [str('name'), int('business_category_id'), int('lft'), int('rgt'), int('depth'), int('parent_id'), str('img'), str('slug'), int('status', 0), timestamp('created_at'), timestamp('updated_at'), str('name_hi')],
  city_helpline_numbers: [json('city_helpline'), int('location_id'), timestamp('created_at'), timestamp('updated_at'), str('city'), int('pincode_id'), str('state')],
  departments: [json('designation_id'), str('name'), int('status', 0), timestamp('created_at'), timestamp('updated_at'), str('slug'), str('department_name'), str('department_name_hi'), json('department_mobile_number')],
  designations: [str('name'), int('status', 0), timestamp('created_at'), timestamp('updated_at')],
  events: [str('name'), ['date', 'date'], ['charge', 'dec'], str('event_details'), ['event_time', 'time'], str('image'), int('status', 0), timestamp('created_at'), timestamp('updated_at'), str('name_hi'), str('short_description'), str('event_description_hi'), str('state'), str('district'), int('pincode_id'), str('tahsil')],
  locations: [str('location_name'), int('status', 0), timestamp('created_at'), timestamp('updated_at')],
  pincodes: [str('pin_code'), str('city'), str('state'), timestamp('created_at'), timestamp('updated_at'), str('state_hi'), str('city_hi'), str('state_code'), str('district_code')],
  sliders: [str('client_name'), str('slider_img'), ['from_date', 'dt'], ['to_date', 'dt'], ['amount', 'dec'], int('lft'), int('rgt'), int('depth'), int('parent_id'), ['page_location', PAGE_LOCATION], str('url'), int('status', 0), timestamp('created_at'), timestamp('updated_at')],
  event_details: [int('event_id'), str('event_details'), timestamp('created_at'), timestamp('updated_at')],
  event_locations: [int('event_id'), int('location_id'), timestamp('created_at'), timestamp('updated_at')],
};

const NUMERIC = /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/;

/** What MySQL (strict mode) stores for a bound PHP value in a column of this kind; a value MySQL rejects is a 500 (QueryException). */
function coerceValue(table: string, column: string, kind: Kind | undefined, value: unknown): unknown {
  if (value === undefined || value === null || kind === undefined) return value ?? null;
  const rejected = () => new Error(`Incorrect value '${String(value)}' for column '${column}' (${table})`);
  if (typeof kind === 'object') {
    const option = kind.enum.find((candidate) => candidate.toLowerCase() === String(value).toLowerCase());
    if (option === undefined) throw rejected();
    return option;
  }
  switch (kind) {
    case 'int':
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (typeof value === 'number') return Math.round(value);
      if (typeof value === 'string' && NUMERIC.test(value)) return Math.round(Number(value));
      throw rejected();
    case 'dec':
      if (typeof value === 'number' || (typeof value === 'string' && NUMERIC.test(value))) return Number(value).toFixed(2);
      throw rejected();
    case 'date': {
      const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value));
      return match ? `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}` : value;
    }
    case 'dt':
      return castDateTime(value);
    case 'time': {
      const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value).trim());
      return match ? `${match[1]!.padStart(2, '0')}:${match[2]}:${match[3] ?? '00'}` : value;
    }
    case 'str':
      return typeof value === 'number' ? String(value) : typeof value === 'boolean' ? (value ? '1' : '') : value;
    default:
      return value;
  }
}

/** Known columns of a partial row, converted to what MySQL would store (throws on a value MySQL rejects). */
export function coerceRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const spec = SCHEMA[table] ?? [];
  return Object.fromEntries(
    Object.entries(data).map(([column, value]) => [column, coerceValue(table, column, spec.find(([name]) => name === column)?.[1], value)]),
  );
}

/** A new row (no id) in table column order: given values coerced, the rest at their MySQL default. */
export function newRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const coerced = coerceRow(table, data);
  for (const [column, , columnDefault] of SCHEMA[table]!) out[column] = column in coerced ? coerced[column] : (columnDefault ?? null);
  return out;
}

/**
 * After an update the engine has written the request values as sent (that is what Eloquent's dirty check
 * compares); store what MySQL would have kept instead ('10' → "10.00", '2026-01-05' → midnight, "5" → 5).
 */
export async function storeCoerced(table: string, id: number, data: Record<string, unknown>): Promise<void> {
  const typed = coerceRow(table, data);
  const set = Object.fromEntries(Object.entries(typed).filter(([column, value]) => value !== data[column]));
  if (Object.keys(set).length) await modelFor(table).updateOne({ _id: id }, { $set: set });
}

/** Eloquent mass assignment with `$guarded = ['id']`: attributes that are not table columns are silently dropped. */
export async function onlyColumns(table: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const columns = new Set((SCHEMA[table] ?? []).map(([column]) => column));
  return Object.fromEntries(Object.entries(data).filter(([column]) => column !== 'id' && columns.has(column)));
}

/** `X::find($id)` on a collection (`WHERE id = ?` also matched a numeric string). */
export async function findById(collection: string, id: unknown, projection?: Record<string, 1>): Promise<Row | null> {
  const numericId = intId(id);
  if (numericId === null) return null;
  return toRow(await modelFor(collection).findOne({ _id: numericId }, projection).lean<Row>());
}

/** Integer ids from request/DB values (`WHERE id IN (…)` ignores what is not a number). */
export const intIds = (values: unknown[]): number[] => values.map(intId).filter((id): id is number => id !== null);

/** `col = value` as MySQL compared it: '5' matches 5, strings case-insensitively (the engine's collation). */
export function eqValue(value: unknown) {
  const numeric = typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : null;
  return { $in: numeric === null ? [value] : [value, numeric] };
}

/** A condition no row satisfies (`col >= NULL`). */
export const NEVER: Filter<Row> = { id: { $in: [] } };

/**
 * `SELECT <field> FROM <collection> [WHERE …] GROUP BY <field>`: one `{ [field]: value }` row per group.
 * Order: `first` = first appearance (unindexed GROUP BY / DISTINCT), `asc` = ORDER BY field ASC.
 */
export async function groupValues(
  collection: string,
  field: string,
  opts: { match?: Filter<Row>; order?: 'first' | 'asc' } = {},
): Promise<Row[]> {
  const pipeline = [
    ...(opts.match ? [{ $match: opts.match }] : []),
    { $group: { _id: `$${field}`, first: { $min: '$_id' } } },
    { $sort: opts.order === 'asc' ? { _id: 1, first: 1 } : { first: 1 } },
  ] as PipelineStage[];
  const groups = await modelFor(collection).aggregate(pipeline, { collation: CASE_INSENSITIVE });
  return groups.map((group) => ({ [field]: group._id }));
}

/** cviebrock Sluggable with source `slug_or_name` (no such accessor): a blank slug stays NULL, a sent one is kept. */
export function slugOrNull(data: Record<string, unknown>): Record<string, unknown> {
  if (!('slug' in data)) return data;
  const slug = data.slug;
  return { ...data, slug: slug === undefined || slug === null || String(slug).trim() === '' ? null : slug };
}

/** `X::find($id)->update(['lft' => $id + 1, 'rgt' => $id + 1, 'depth' => 1])` after the trait store(). */
export async function setTreeColumns(table: string, id: number): Promise<void> {
  const model = modelFor(table);
  const row = await model.findOne({ _id: id }).lean<Row>();
  if (!row) return;
  const lft = id + 1;
  const dirty = Number(row.lft) !== lft || row.lft === null || Number(row.rgt) !== lft || row.rgt === null || Number(row.depth) !== 1 || row.depth === null;
  if (!dirty) return;
  const now = nowDb();
  await model.updateOne({ _id: id }, { $set: { lft, rgt: lft, depth: 1, ...(row.updated_at === now ? {} : { updated_at: now }) } });
}

/**
 * Eloquent `date`/`datetime` cast on write (fromDateTime): a `Y-m-d` string becomes midnight
 * (`Y-m-d 00:00:00`); other parseable strings are re-formatted as `Y-m-d H:i:s`.
 */
export function castDateTime(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return value ?? null;
  const text = String(value);
  const dateOnly = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]!.padStart(2, '0')}-${dateOnly[3]!.padStart(2, '0')} 00:00:00`;
  const full = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (full) return `${full[1]}-${full[2]}-${full[3]} ${full[4]}:${full[5]}:${full[6] ?? '00'}`;
  return text;
}

/** Datatables date column / Backpack date field value: the date part of the stored datetime. */
export const ymd = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value).slice(0, 10);

/** Backpack `orWhereDate(col, Carbon::parse($term))` when the search term passes the `date` rule. */
export function dateSearch(columns: string[]) {
  return (term: string): Filter<Row> | null => {
    const parsed = Date.parse(term);
    if (Number.isNaN(parsed)) return null;
    const date = new Date(parsed);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { $or: columns.map((column) => ({ [column]: { $regex: `^${day}` } })) } as Filter<Row>;
  };
}

/** Backpack date_range filter value `{"from": …, "to": …}` → `where col >= from and col <= to`. */
export function dateRange(column: string, value: unknown): Array<Filter<Row>> {
  let dates: { from?: unknown; to?: unknown } | null = null;
  try {
    dates = JSON.parse(String(value));
  } catch {
    dates = null;
  }
  // json_decode failure → `$dates->from` on null: PHP warning → 500 in Laravel; treated as no filter here.
  if (!dates || typeof dates !== 'object') return [];
  // A bare Y-m-d bound is midnight for a DATETIME column; `col >= NULL` matches nothing.
  const bound = (date: unknown) => (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date} 00:00:00` : date);
  const { from, to } = dates;
  return [
    from === null || from === undefined ? NEVER : ({ [column]: { $gte: bound(from) } } as Filter<Row>),
    to === null || to === undefined ? NEVER : ({ [column]: { $lte: bound(to) } } as Filter<Row>),
  ];
}

/** `->pluck($value, $key)->toArray()` as `[{value: key, label: value}]` (later duplicate keys win, PHP-array order). */
export function pluckOptions(rows: Array<Record<string, unknown>>, valueCol: string, keyCol: string) {
  const options = new Map<string, string>();
  for (const row of rows) options.set(String(row[keyCol] ?? ''), String(row[valueCol] ?? ''));
  return [...options].map(([value, label]) => ({ value, label }));
}

export const STATUS_FILTER = [
  { value: '0', label: 'InActive' },
  { value: '1', label: 'Active' },
];

/** `has('x')` filter with a value: `where x = value`. */
export function eqFilter(input: Record<string, unknown>, key: string, column = key): Array<Filter<Row>> {
  const value = input[key];
  return value === null || value === undefined || value === '' ? [] : [{ [column]: eqValue(value) } as Filter<Row>];
}

/** The `sorting` dropdown filter shared by the category/sub-category/advertisement lists. */
export function sortingFilter(input: Record<string, unknown>, fallback: Array<[string, 'asc' | 'desc']> | undefined) {
  if (!('sorting' in input)) return fallback;
  switch (input.sorting) {
    case 'a_z':
      return [['name', 'asc']] as Array<[string, 'asc' | 'desc']>;
    case 'z_a':
      return [['name', 'desc']] as Array<[string, 'asc' | 'desc']>;
    case 'newest':
      return [['created_at', 'desc']] as Array<[string, 'asc' | 'desc']>;
    case 'oldest':
      return [['created_at', 'asc']] as Array<[string, 'asc' | 'desc']>;
    default:
      return [] as Array<[string, 'asc' | 'desc']>;
  }
}

/** Backpack appends `ORDER BY <key> DESC` unless the primary key is already ordered. */
export const withKeyDesc = (order: Array<[string, 'asc' | 'desc']> | undefined): Array<[string, 'asc' | 'desc']> => {
  const clauses = order ?? [];
  return clauses.some(([column]) => column === 'id') ? clauses : [...clauses, ['id', 'desc']];
};

/** Today in the app timezone (`Carbon::today()->toDateString()`). */
export const todayIst = () => nowDb().slice(0, 10);
