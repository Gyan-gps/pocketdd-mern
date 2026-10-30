// MongoDB access. See MONGODB_SCHEMA.md for the collections.
// Documents keep the MySQL row shape (same field names, order and value types: dates are the stored
// IST strings, DECIMAL columns are strings like "10.00") with the integer id stored as `_id`.
// `toRow()` turns a document back into the row the old SQL returned, so JSON responses stay identical.
import type { ClientSession, Db, Document, Filter } from 'mongodb';
import { connectDatabase, mongoose } from '../config/database.js';
import { Counter, EMBEDDED_TABLES, modelFor } from '../models/index.js';
import { CASE_INSENSITIVE, locateTable } from './eloquent.js';

export type Row = Record<string, any>;

/** The connected database (health checks, admin commands). */
export function db(): Db {
  void connectDatabase();
  return mongoose.connection.db!;
}

/** Old child tables now embedded as arrays (see EMBEDDED_TABLES in models/index.ts). */
export type EmbeddedTable =
  | 'business_details'
  | 'business_iamges'
  | 'business_locations'
  | 'business_owners'
  | 'business_users_location'
  | 'advertisment_subcategory'
  | 'event_details'
  | 'event_locations';

/**
 * `SELECT COUNT(*) FROM <table> WHERE <column> = ? [AND <idCol> <> ?]` with MySQL semantics:
 * case-insensitive, and '5' equals 5. Works for embedded child tables too.
 */
export async function countWhere(table: string, column: string, value: unknown, except?: { column: string; value: unknown }) {
  const loose = (input: unknown) => {
    const numeric =
      typeof input === 'string' && input.trim() !== '' && !Number.isNaN(Number(input)) ? Number(input) : null;
    return numeric === null ? [input] : [input, numeric];
  };
  const { collection, embedded } = locateTable(table);
  const field = (columnName: string) => {
    if (!embedded) return columnName === 'id' ? '_id' : columnName;
    if (columnName === embedded.fk) return '_id';
    return `${embedded.field}.${columnName}`;
  };
  const filter: Document = { [field(column)]: { $in: loose(value) } };
  if (except) filter[field(except.column)] = { $nin: loose(except.value) };
  if (embedded) {
    // Count matching children, not parents.
    const [result] = await modelFor(collection)
      .aggregate([{ $unwind: `$${embedded.field}` }, { $match: filter }, { $count: 'c' }])
      .option({ collation: CASE_INSENSITIVE });
    return Number(result?.c ?? 0);
  }
  return modelFor(collection).countDocuments(filter, { collation: CASE_INSENSITIVE });
}

/** Document → MySQL-shaped row: `_id` becomes `id` in the same (first) position. */
export function toRow<T = Row>(doc: Document | null | undefined): T | null {
  if (!doc) return null;
  const out: Row = {};
  for (const [key, value] of Object.entries(doc)) out[key === '_id' ? 'id' : key] = value;
  return out as T;
}

export const toRows = <T = Row>(docs: Document[]): T[] => docs.map((doc) => toRow<T>(doc)!);

/** Row → document: `id` becomes `_id`. */
export function toDoc(row: Row): Document {
  const out: Document = {};
  for (const [key, value] of Object.entries(row)) out[key === 'id' ? '_id' : key] = value;
  return out;
}

/** Embedded child + its parent id, shaped like the old child-table row (`id`, `<fk>`, …rest). */
export function childRow(table: EmbeddedTable, parentId: number, child: Row): Row {
  const { id, ...rest } = child;
  return { id, [EMBEDDED_TABLES[table]!.foreignKey]: parentId, ...rest };
}

/** AUTO_INCREMENT replacement. Keys: collection name, or `<collection>.<field>` for embedded children. */
export async function nextId(key: string, session?: ClientSession): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session },
  ).lean<{ _id: string; seq: number }>();
  return counter!.seq;
}

/** Insert a MySQL-shaped row (without id) and return the new integer id (`insertId`). */
export async function insertRow(collection: string, row: Row, session?: ClientSession): Promise<number> {
  const id = await nextId(collection, session);
  const { id: _ignored, ...rest } = row;
  // Lean insertMany writes the document as given: same field order, no schema defaults or casting.
  await modelFor(collection).insertMany([{ _id: id, ...rest }], { lean: true, session });
  return id;
}

/** SQL LIKE '%term%' (case-insensitive like MySQL's default collation). */
export const like = (term: string) => ({ $regex: escapeRegex(term), $options: 'i' });
export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Numeric id from a route/query param, or null when it isn't one (no match, like `WHERE id = 'abc'`). */
export function intId(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

/** Laravel DB::transaction(). Atlas runs a replica set, so multi-document transactions work. */
export async function transaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let out!: T;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out;
  } finally {
    await session.endSession();
  }
}

export type { Filter, ClientSession };
