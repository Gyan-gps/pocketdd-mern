// Eloquent/MySQL semantics on top of MongoDB: where an old table lives, MySQL value coercion and loose `=`,
// mass-assignment column lists and dirty-checking saves. Used by the business, business-location and profile
// modules and the business admin screens.
import { nowDb } from '../core/time.js';
import { bind } from '../utils/php/values.js';
import { EMBEDDED_TABLES, MODEL_BY_COLLECTION, MODEL_BY_TABLE, modelFor, OrphanRow } from '../models/index.js';
import type { ClientSession, Filter, Row } from './mongo.js';
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
  for (const embedded of Object.values(EMBEDDED_LOCATIONS)) if (embedded.parent === collection) out[embedded.field] = 0;
  return out;
}

/** Where an old child table's rows live: `parent` collection, array `field`, old parent-id column `fk`. */
export interface EmbeddedLocation {
  parent: string;
  field: string;
  fk: string;
}

const EMBEDDED_LOCATIONS: Record<string, EmbeddedLocation> = Object.fromEntries(
  Object.values(EMBEDDED_TABLES).map((child) => [
    child.table,
    { parent: child.parentModel.collection.collectionName, field: child.field, fk: child.foreignKey },
  ]),
);

export type TableLocation =
  | { collection: string; embedded?: undefined }
  | { collection: string; embedded: EmbeddedLocation };

/** Collection of an old top-level table name, or where a child table's rows are embedded. */
export function locateTable(table: string): TableLocation {
  const embedded = EMBEDDED_LOCATIONS[table];
  if (embedded) return { collection: embedded.parent, embedded };
  const model = MODEL_BY_COLLECTION[table] ?? MODEL_BY_TABLE[table];
  if (!model) throw new Error(`No collection for table ${table}`);
  return { collection: model.collection.collectionName };
}

/** Child rows without a parent (fk NULL or unknown) are kept in `_orphans` as `{ table, row }` (migration). */
export const ORPHANS = '_orphans';

/** A value as MySQL stores it in `table.column`: numeric strings → numbers in int columns, numbers → strings in text columns, … */
export function mysqlValue(table: string, column: string, value: unknown): unknown {
  const bound = bind(value);
  if (bound === null) return null;
  const kind = TABLE_SCHEMA[table]?.[column]?.kind;
  if (!kind || kind === 'json') return bound;
  if (typeof bound === 'boolean') return kind === 'string' ? (bound ? '1' : '0') : bound ? 1 : 0;
  if (kind === 'string') return typeof bound === 'number' ? String(bound) : bound;
  const numeric = typeof bound === 'number' || (typeof bound === 'string' && bound.trim() !== '' && !Number.isNaN(Number(bound)));
  if (!numeric) return bound;
  if (kind === 'int') return Math.round(Number(bound));
  if (kind === 'float') return Number(bound);
  return Number(bound).toFixed(Number(kind.slice('decimal:'.length)));
}

/**
 * The row an INSERT of `values` stores: every column in table order (without `id`, and without the parent
 * fk for embedded tables); columns not given get their default or NULL; values coerced like MySQL.
 */
export function tableRow(table: string, values: Record<string, unknown>): Row {
  const schema = TABLE_SCHEMA[table];
  if (!schema) throw new Error(`Unknown table ${table}`);
  const fk = EMBEDDED_LOCATIONS[table]?.fk;
  const out: Row = {};
  for (const [column, def] of Object.entries(schema)) {
    if (column === 'id' || column === fk) continue;
    if (column in values) out[column] = mysqlValue(table, column, values[column]);
    else out[column] = def.default === undefined ? null : mysqlValue(table, column, def.default);
  }
  return out;
}

/** MySQL `=` type juggling: '5' matches 5 and 5 matches '5' (use the CASE_INSENSITIVE collation for strings). */
export function looseEq(value: unknown): unknown {
  const bound = bind(value);
  if (typeof bound === 'number') return { $in: [bound, String(bound)] };
  if (typeof bound === 'boolean') return { $in: [bound, bound ? 1 : 0] };
  if (typeof bound === 'string' && bound.trim() !== '' && !Number.isNaN(Number(bound))) return { $in: [bound, Number(bound)] };
  return bound;
}

/** Case-insensitive string comparison (MySQL utf8mb4_unicode_ci). */
export const CASE_INSENSITIVE = { locale: 'en', strength: 2 } as const;

/** `->where($col, $value)`: a null value becomes `IS NULL`. Mongo filter (`id` → `_id`). */
export function whereEq(column: string, value: unknown): Filter<Row> {
  const field = column === 'id' ? '_id' : column;
  return value === null || value === undefined ? { [field]: null } : { [field]: looseEq(value) };
}

/** Schema::getColumnListing() — used for Eloquent mass-assignment (`$guarded = ['id']`). */
export async function tableColumns(_db: Db, table: string): Promise<string[]> {
  return [...(TABLE_COLUMNS[table] ?? [])];
}

const isNumericLike = (value: unknown) =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(value));

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
    await modelFor(loc.collection).updateOne({ _id: row.id }, { $set }, { session });
    return;
  }
  const { field, fk } = loc.embedded;
  const parentId = row[fk];
  const childSets = sets.filter(([k]) => k !== fk);
  if (!childSets.length) return;
  if (parentId === null || parentId === undefined) {
    const $set = Object.fromEntries(childSets.map(([k, v]) => [`row.${k}`, mysqlValue(table, k, v)]));
    await OrphanRow.updateOne({ table, 'row.id': row.id }, { $set }, { session });
    return;
  }
  const $set = Object.fromEntries(childSets.map(([k, v]) => [`${field}.$.${k}`, mysqlValue(table, k, v)]));
  await modelFor(loc.collection).updateOne({ _id: parentId, [`${field}.id`]: row.id }, { $set }, { session });
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
    entries = entries.filter(([column]) => column !== 'id' && cols.has(column));
  }
  const dirty: Array<[string, unknown]> = [];
  for (const [column, newValue] of entries) {
    const value = newValue === undefined ? null : newValue;
    if (!originalIsEquivalent(row, column, value)) dirty.push([column, value]);
  }
  if (!dirty.length) {
    for (const [column, newValue] of entries) row[column] = newValue === undefined ? null : newValue;
    return;
  }
  if (!dirty.some(([column]) => column === 'updated_at')) {
    const now = nowDb();
    if (!originalIsEquivalent(row, 'updated_at', now)) dirty.push(['updated_at', now]);
  }
  await updateRowById(db, table, row, dirty);
  for (const [column, newValue] of entries) row[column] = newValue === undefined ? null : newValue;
  for (const [column, newValue] of dirty) row[column] = newValue;
}

