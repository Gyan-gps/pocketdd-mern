// Eloquent/MySQL semantics on top of MongoDB: where an old table lives, MySQL value coercion and loose `=`,
// mass-assignment column lists and dirty-checking saves. Used by the business, business-location and profile
// modules and the business admin screens.
import { nowDb } from '../core/time.js';
import { bind } from '../utils/php/values.js';
import { col, EMBEDDED, TABLE_COLLECTION, type ClientSession, type EmbeddedTable, type Filter, type Row } from './mongo.js';
import { TABLE_COLUMNS, TABLE_SCHEMA } from './table-schema.js';

// ---------------------------------------------------------------- DB access (no session, or one transaction)

/** Where an operation runs: `{}` outside a transaction, `{ session }` inside `transaction()` (src/db/mongo.ts). */
export interface Db {
  session?: ClientSession;
}

export const poolDb: Db = {};

/** `SELECT * FROM businesses`: business documents embed their child tables, leave them out. */
export const BUSINESS_CHILDREN = { details: 0, images: 0, locations: 0, owners: 0 } as const;

/** Projection that leaves out the embedded child arrays of `collection` (`SELECT *` shape). */
export function withoutChildren(collection: string): Record<string, 0> {
  const out: Record<string, 0> = {};
  for (const e of Object.values(EMBEDDED)) if (e.parent === collection) out[e.field] = 0;
  return out;
}

export type TableLocation =
  | { collection: string; embedded?: undefined }
  | { collection: string; embedded: (typeof EMBEDDED)[EmbeddedTable] };

/** Collection of an old top-level table name, or where a child table's rows are embedded. */
export function locateTable(table: string): TableLocation {
  const e = EMBEDDED[table as EmbeddedTable];
  if (e) return { collection: e.parent, embedded: e };
  const c = TABLE_COLLECTION[table];
  if (!c) throw new Error(`No collection for table ${table}`);
  return { collection: c };
}

/** Child rows without a parent (fk NULL or unknown) are kept in `_orphans` as `{ table, row }` (migration). */
export const ORPHANS = '_orphans';

/** A value as MySQL stores it in `table.column`: numeric strings → numbers in int columns, numbers → strings in text columns, … */
export function mysqlValue(table: string, column: string, value: unknown): unknown {
  const v = bind(value);
  if (v === null) return null;
  const kind = TABLE_SCHEMA[table]?.[column]?.kind;
  if (!kind || kind === 'json') return v;
  if (typeof v === 'boolean') return kind === 'string' ? (v ? '1' : '0') : v ? 1 : 0;
  if (kind === 'string') return typeof v === 'number' ? String(v) : v;
  const numeric = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)));
  if (!numeric) return v;
  if (kind === 'int') return Math.round(Number(v));
  if (kind === 'float') return Number(v);
  return Number(v).toFixed(Number(kind.slice('decimal:'.length)));
}

/**
 * The row an INSERT of `values` stores: every column in table order (without `id`, and without the parent
 * fk for embedded tables); columns not given get their default or NULL; values coerced like MySQL.
 */
export function tableRow(table: string, values: Record<string, unknown>): Row {
  const schema = TABLE_SCHEMA[table];
  if (!schema) throw new Error(`Unknown table ${table}`);
  const fk = EMBEDDED[table as EmbeddedTable]?.fk;
  const out: Row = {};
  for (const [c, def] of Object.entries(schema)) {
    if (c === 'id' || c === fk) continue;
    if (c in values) out[c] = mysqlValue(table, c, values[c]);
    else out[c] = def.default === undefined ? null : mysqlValue(table, c, def.default);
  }
  return out;
}

/** MySQL `=` type juggling: '5' matches 5 and 5 matches '5' (use the CI collation for strings). */
export function looseEq(value: unknown): unknown {
  const v = bind(value);
  if (typeof v === 'number') return { $in: [v, String(v)] };
  if (typeof v === 'boolean') return { $in: [v, v ? 1 : 0] };
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return { $in: [v, Number(v)] };
  return v;
}

/** Case-insensitive string comparison (MySQL utf8mb4_unicode_ci). */
export const CI = { locale: 'en', strength: 2 } as const;

/** `->where($col, $value)`: a null value becomes `IS NULL`. Mongo filter (`id` → `_id`). */
export function whereEq(column: string, value: unknown): Filter<Row> {
  const field = column === 'id' ? '_id' : column;
  return value === null || value === undefined ? { [field]: null } : { [field]: looseEq(value) };
}

/** Schema::getColumnListing() — used for Eloquent mass-assignment (`$guarded = ['id']`). */
export async function tableColumns(_db: Db, table: string): Promise<string[]> {
  return [...(TABLE_COLUMNS[table] ?? [])];
}

const isNumericLike = (v: unknown) =>
  (typeof v === 'number' && Number.isFinite(v)) ||
  (typeof v === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(v));

/** Model::originalIsEquivalent() for plain (uncast) attributes; dates compare as stored strings. */
export function originalIsEquivalent(row: Row, key: string, value: unknown): boolean {
  if (!(key in row)) return false;
  const original = row[key];
  if (value === original) return true;
  if (value === null || value === undefined) return false;
  return isNumericLike(value) && isNumericLike(original) && String(value) === String(original);
}

/**
 * `UPDATE <table> SET … WHERE id = row.id`. For an embedded child table `row` must carry the parent fk
 * (childRow() shape); a NULL fk means the row is in `_orphans`.
 */
export async function updateRowById(db: Db, table: string, row: Row, sets: Array<[string, unknown]>): Promise<void> {
  const loc = locateTable(table);
  const session = db.session;
  if (!loc.embedded) {
    if (!sets.length) return;
    const $set = Object.fromEntries(sets.map(([k, v]) => [k, mysqlValue(table, k, v)]));
    await col(loc.collection).updateOne({ _id: row.id }, { $set }, { session });
    return;
  }
  const { field, fk } = loc.embedded;
  const parentId = row[fk];
  const childSets = sets.filter(([k]) => k !== fk);
  if (!childSets.length) return;
  if (parentId === null || parentId === undefined) {
    const $set = Object.fromEntries(childSets.map(([k, v]) => [`row.${k}`, mysqlValue(table, k, v)]));
    await col(ORPHANS).updateOne({ table, 'row.id': row.id }, { $set }, { session });
    return;
  }
  const $set = Object.fromEntries(childSets.map(([k, v]) => [`${field}.$.${k}`, mysqlValue(table, k, v)]));
  await col(loc.collection).updateOne({ _id: parentId, [`${field}.id`]: row.id }, { $set }, { session });
}

/**
 * `$model->update($attrs)` / `$model->save()` for a model loaded as `row`:
 * unknown columns are silently dropped when `massAssign` (guarded = ['id']), only dirty attributes
 * are written and `updated_at` is touched (unless set dirty explicitly). Mutates `row` like Eloquent.
 * Rows of embedded child tables must be in childRow() shape (they carry the parent fk).
 */
export async function eloquentSave(
  db: Db,
  table: string,
  row: Row,
  attrs: Record<string, unknown>,
  opts: { massAssign: boolean },
): Promise<void> {
  let entries = Object.entries(attrs);
  if (opts.massAssign) {
    const cols = new Set(await tableColumns(db, table));
    entries = entries.filter(([k]) => k !== 'id' && cols.has(k));
  }
  const dirty: Array<[string, unknown]> = [];
  for (const [k, v] of entries) {
    const value = v === undefined ? null : v;
    if (!originalIsEquivalent(row, k, value)) dirty.push([k, value]);
  }
  if (!dirty.length) {
    for (const [k, v] of entries) row[k] = v === undefined ? null : v;
    return;
  }
  if (!dirty.some(([k]) => k === 'updated_at')) {
    const now = nowDb();
    if (!originalIsEquivalent(row, 'updated_at', now)) dirty.push(['updated_at', now]);
  }
  await updateRowById(db, table, row, dirty);
  for (const [k, v] of entries) row[k] = v === undefined ? null : v;
  for (const [k, v] of dirty) row[k] = v;
}

