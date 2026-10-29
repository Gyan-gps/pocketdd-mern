// Shared Eloquent/Backpack behaviour for the catalog admin screens
// (business-category, business-sub-category, advertisment, slider, location). Storage is MongoDB:
// filters returned here are Mongo filters written against the row shape (`id` is mapped to `_id` by the engine).
import { nowDb } from '../../core/time.js';
import { TABLE_COLLECTION, col, intId, toRow, type Filter, type Row } from '../../db/mongo.js';

type Kind = 'int' | 'str' | 'dec' | 'date' | 'dt' | 'time' | 'ts' | 'json' | { enum: string[] };
type Spec = Array<[string, Kind, unknown?]>;

const i = (c: string, d?: unknown): [string, Kind, unknown?] => [c, 'int', d];
const s = (c: string): [string, Kind] => [c, 'str'];
const j = (c: string): [string, Kind] => [c, 'json'];
const ts = (c: string): [string, Kind] => [c, 'ts'];
const PAGE_LOCATION = {
  enum: ['home', 'business_categories_search', 'business_page', 'business_details_page', 'event_page', 'notification_page'],
};

/** information_schema.COLUMNS (ORDINAL_POSITION), without `id`; third item = COLUMN_DEFAULT. */
export const SCHEMA: Record<string, Spec> = {
  about_uses: [s('state'), s('city'), s('about_mediator'), s('about_mediator_hi'), s('know_your_city'), s('know_your_city_hi'), j('tourist_places'), i('status', 1), ts('created_at'), ts('updated_at')],
  addresses: [s('state'), s('city'), i('pincode_id'), s('tehsil'), s('tehsil_hi'), j('area'), j('area_hi'), ['price', 'dec'], i('status', 1), ts('created_at'), ts('updated_at')],
  administrators: [i('department_id'), i('designation_id'), s('officer_position'), s('officer_mobile_number'), i('location_id'), i('status', 0), ts('created_at'), ts('updated_at'), s('city'), s('state'), j('officer_rank_name'), i('pincode_id')],
  advertisments: [s('client_name'), s('advt_img'), ['from_date', 'dt'], ['to_date', 'dt'], ['amount', 'dec'], i('lft'), i('rgt'), i('depth'), i('parent_id'), ['page_location', PAGE_LOCATION], s('url'), i('status', 0), ts('created_at'), ts('updated_at'), s('ads_position'), s('ads_location'), j('sub_category_name'), s('fees_type')],
  business_categories: [s('name'), i('location_id'), s('img'), s('slug'), i('lft'), i('rgt'), i('depth'), i('parent_id'), i('status'), ts('created_at'), ts('updated_at'), s('name_hi')],
  business_sub_categories: [s('name'), i('business_category_id'), i('lft'), i('rgt'), i('depth'), i('parent_id'), s('img'), s('slug'), i('status', 0), ts('created_at'), ts('updated_at'), s('name_hi')],
  city_helpline_numbers: [j('city_helpline'), i('location_id'), ts('created_at'), ts('updated_at'), s('city'), i('pincode_id'), s('state')],
  departments: [j('designation_id'), s('name'), i('status', 0), ts('created_at'), ts('updated_at'), s('slug'), s('department_name'), s('department_name_hi'), j('department_mobile_number')],
  designations: [s('name'), i('status', 0), ts('created_at'), ts('updated_at')],
  events: [s('name'), ['date', 'date'], ['charge', 'dec'], s('event_details'), ['event_time', 'time'], s('image'), i('status', 0), ts('created_at'), ts('updated_at'), s('name_hi'), s('short_description'), s('event_description_hi'), s('state'), s('district'), i('pincode_id'), s('tahsil')],
  locations: [s('location_name'), i('status', 0), ts('created_at'), ts('updated_at')],
  pincodes: [s('pin_code'), s('city'), s('state'), ts('created_at'), ts('updated_at'), s('state_hi'), s('city_hi'), s('state_code'), s('district_code')],
  sliders: [s('client_name'), s('slider_img'), ['from_date', 'dt'], ['to_date', 'dt'], ['amount', 'dec'], i('lft'), i('rgt'), i('depth'), i('parent_id'), ['page_location', PAGE_LOCATION], s('url'), i('status', 0), ts('created_at'), ts('updated_at')],
  event_details: [i('event_id'), s('event_details'), ts('created_at'), ts('updated_at')],
  event_locations: [i('event_id'), i('location_id'), ts('created_at'), ts('updated_at')],
};

const NUMERIC = /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/;

/** What MySQL (strict mode) stores for a bound PHP value in a column of this kind; a value MySQL rejects is a 500 (QueryException). */
function coerceValue(table: string, column: string, kind: Kind | undefined, v: unknown): unknown {
  if (v === undefined || v === null || kind === undefined) return v ?? null;
  const bad = () => new Error(`Incorrect value '${String(v)}' for column '${column}' (${table})`);
  if (typeof kind === 'object') {
    const hit = kind.enum.find((e) => e.toLowerCase() === String(v).toLowerCase());
    if (hit === undefined) throw bad();
    return hit;
  }
  switch (kind) {
    case 'int':
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'number') return Math.round(v);
      if (typeof v === 'string' && NUMERIC.test(v)) return Math.round(Number(v));
      throw bad();
    case 'dec':
      if (typeof v === 'number' || (typeof v === 'string' && NUMERIC.test(v))) return Number(v).toFixed(2);
      throw bad();
    case 'date': {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v));
      return m ? `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}` : v;
    }
    case 'dt':
      return castDateTime(v);
    case 'time': {
      const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(v).trim());
      return m ? `${m[1]!.padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}` : v;
    }
    case 'str':
      return typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '') : v;
    default:
      return v;
  }
}

/** Known columns of a partial row, converted to what MySQL would store (throws on a value MySQL rejects). */
export function coerceRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const spec = SCHEMA[table] ?? [];
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, coerceValue(table, k, spec.find(([n]) => n === k)?.[1], v)]));
}

/** A new row (no id) in table column order: given values coerced, the rest at their MySQL default. */
export function newRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const coerced = coerceRow(table, data);
  for (const [c, , def] of SCHEMA[table]!) out[c] = c in coerced ? coerced[c] : (def ?? null);
  return out;
}

/**
 * After an update the engine has written the request values as sent (that is what Eloquent's dirty check
 * compares); store what MySQL would have kept instead ('10' → "10.00", '2026-01-05' → midnight, "5" → 5).
 */
export async function storeCoerced(table: string, id: number, data: Record<string, unknown>): Promise<void> {
  const typed = coerceRow(table, data);
  const set = Object.fromEntries(Object.entries(typed).filter(([k, v]) => v !== data[k]));
  if (Object.keys(set).length) await col(TABLE_COLLECTION[table] ?? table).updateOne({ _id: id } as never, { $set: set });
}

/** Eloquent mass assignment with `$guarded = ['id']`: attributes that are not table columns are silently dropped. */
export async function onlyColumns(table: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cols = new Set((SCHEMA[table] ?? []).map(([c]) => c));
  return Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'id' && cols.has(k)));
}

/** `X::find($id)` on a collection (`WHERE id = ?` also matched a numeric string). */
export async function findById(collection: string, id: unknown, projection?: Record<string, 1>): Promise<Row | null> {
  const n = intId(id);
  if (n === null) return null;
  return toRow(await col(collection).findOne({ _id: n } as never, projection ? { projection } : undefined));
}

/** Integer ids from request/DB values (`WHERE id IN (…)` ignores what is not a number). */
export const intIds = (values: unknown[]): number[] => values.map(intId).filter((n): n is number => n !== null);

/** `col = value` as MySQL compared it: '5' matches 5, strings case-insensitively (the engine's collation). */
export function eqValue(v: unknown) {
  const n = typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
  return { $in: n === null ? [v] : [v, n] };
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
  const groups = await col(collection)
    .aggregate(
      [
        ...(opts.match ? [{ $match: opts.match }] : []),
        { $group: { _id: `$${field}`, first: { $min: '$_id' } } },
        { $sort: opts.order === 'asc' ? { _id: 1, first: 1 } : { first: 1 } },
      ],
      { collation: { locale: 'en', strength: 2 } },
    )
    .toArray();
  return groups.map((g) => ({ [field]: g._id }));
}

/** cviebrock Sluggable with source `slug_or_name` (no such accessor): a blank slug stays NULL, a sent one is kept. */
export function slugOrNull(data: Record<string, unknown>): Record<string, unknown> {
  if (!('slug' in data)) return data;
  const s = data.slug;
  return { ...data, slug: s === undefined || s === null || String(s).trim() === '' ? null : s };
}

/** `X::find($id)->update(['lft' => $id + 1, 'rgt' => $id + 1, 'depth' => 1])` after the trait store(). */
export async function setTreeColumns(table: string, id: number): Promise<void> {
  const c = col(TABLE_COLLECTION[table] ?? table);
  const row = await c.findOne({ _id: id } as never);
  if (!row) return;
  const lft = id + 1;
  const dirty = Number(row.lft) !== lft || row.lft === null || Number(row.rgt) !== lft || row.rgt === null || Number(row.depth) !== 1 || row.depth === null;
  if (!dirty) return;
  const now = nowDb();
  await c.updateOne({ _id: id } as never, { $set: { lft, rgt: lft, depth: 1, ...(row.updated_at === now ? {} : { updated_at: now }) } });
}

/**
 * Eloquent `date`/`datetime` cast on write (fromDateTime): a `Y-m-d` string becomes midnight
 * (`Y-m-d 00:00:00`); other parseable strings are re-formatted as `Y-m-d H:i:s`.
 */
export function castDateTime(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return v ?? null;
  const s = String(v);
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (ymd) return `${ymd[1]}-${ymd[2]!.padStart(2, '0')}-${ymd[3]!.padStart(2, '0')} 00:00:00`;
  const full = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (full) return `${full[1]}-${full[2]}-${full[3]} ${full[4]}:${full[5]}:${full[6] ?? '00'}`;
  return s;
}

/** Datatables date column / Backpack date field value: the date part of the stored datetime. */
export const ymd = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v).slice(0, 10));

/** Backpack `orWhereDate(col, Carbon::parse($term))` when the search term passes the `date` rule. */
export function dateSearch(columns: string[]) {
  return (term: string): Filter<Row> | null => {
    const t = Date.parse(term);
    if (Number.isNaN(t)) return null;
    const d = new Date(t);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { $or: columns.map((c) => ({ [c]: { $regex: `^${day}` } })) } as Filter<Row>;
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
  const bound = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v} 00:00:00` : v);
  const { from, to } = dates;
  return [
    from === null || from === undefined ? NEVER : ({ [column]: { $gte: bound(from) } } as Filter<Row>),
    to === null || to === undefined ? NEVER : ({ [column]: { $lte: bound(to) } } as Filter<Row>),
  ];
}

/** `->pluck($value, $key)->toArray()` as `[{value: key, label: value}]` (later duplicate keys win, PHP-array order). */
export function pluckOptions(rows: Array<Record<string, unknown>>, valueCol: string, keyCol: string) {
  const map = new Map<string, string>();
  for (const r of rows) map.set(String(r[keyCol] ?? ''), String(r[valueCol] ?? ''));
  return [...map].map(([value, label]) => ({ value, label }));
}

export const STATUS_FILTER = [
  { value: '0', label: 'InActive' },
  { value: '1', label: 'Active' },
];

/** `has('x')` filter with a value: `where x = value`. */
export function eqFilter(input: Record<string, unknown>, key: string, column = key): Array<Filter<Row>> {
  const v = input[key];
  return v === null || v === undefined || v === '' ? [] : [{ [column]: eqValue(v) } as Filter<Row>];
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
  const o = order ?? [];
  return o.some(([c]) => c === 'id') ? o : [...o, ['id', 'desc']];
};

/** Today in the app timezone (`Carbon::today()->toDateString()`). */
export const todayIst = () => nowDb().slice(0, 10);
