// MongoDB access. See MONGODB_SCHEMA.md for the collections.
// Documents keep the MySQL row shape (same field names, order and value types: dates are the stored
// IST strings, DECIMAL columns are strings like "10.00") with the integer id stored as `_id`.
// `toRow()` turns a document back into the row the old SQL returned, so JSON responses stay identical.
import { MongoClient, type ClientSession, type Collection, type Db, type Document, type Filter } from 'mongodb';
import { env } from '../config/env.js';

export type Row = Record<string, any>;

let client: MongoClient | null = null;
let database: Db | null = null;

/** The client connects on its first operation; routers may take collection handles at import time. */
export function db(): Db {
  if (database) return database;
  if (!env.mongo.uri) throw new Error('MONGODB_URI is not set');
  client = new MongoClient(env.mongo.uri, { maxPoolSize: 10 });
  database = client.db(env.mongo.db);
  return database;
}

/** Connect eagerly at startup so a bad MONGODB_URI fails fast. */
export async function connectMongo(): Promise<Db> {
  const d = db();
  await client!.connect();
  return d;
}

export async function closeMongo() {
  await client?.close();
  client = null;
  database = null;
}

export const col = <T extends Document = Row>(name: string): Collection<T> => db().collection<T>(name);

/** Collection names (old MySQL table → collection). */
export const C = {
  users: 'users',
  tokens: 'personal_access_tokens',
  businesses: 'businesses', // + details[], images[], locations[], owners[]
  businessCategories: 'business_categories',
  businessSubCategories: 'business_sub_categories',
  businessUsers: 'business_users', // + locations[] (was business_users_location)
  businessRequests: 'business_requests', // was businesse_requests
  locations: 'locations',
  pincodes: 'pincodes',
  addresses: 'addresses',
  advertisements: 'advertisements', // was advertisments; + subcategories[] (was advertisment_subcategory)
  adUserViews: 'ad_user_views',
  events: 'events', // + details[] (was event_details), locations[] (was event_locations)
  departments: 'departments',
  designations: 'designations',
  administrators: 'administrators',
  cityHelplines: 'city_helpline_numbers',
  aboutUs: 'about_uses',
  sliders: 'sliders',
  userNotifications: 'user_notifications',
  deviceIds: 'device_ids',
  otpVerifications: 'otp_verifications',
  apiFailures: 'api_failures',
  jobs: 'jobs', // was node_jobs
  languageLines: 'language_lines',
  appVersions: 'app_versions',
  counters: 'counters',
} as const;

/** Embedded child arrays: old table → where its rows live now. `fk` is the old parent-id column. */
export const EMBEDDED = {
  business_details: { parent: C.businesses, field: 'details', fk: 'business_id' },
  business_iamges: { parent: C.businesses, field: 'images', fk: 'business_id' },
  business_locations: { parent: C.businesses, field: 'locations', fk: 'business_id' },
  business_owners: { parent: C.businesses, field: 'owners', fk: 'business_id' },
  business_users_location: { parent: C.businessUsers, field: 'locations', fk: 'business_user_id' },
  advertisment_subcategory: { parent: C.advertisements, field: 'subcategories', fk: 'advertisment_id' },
  event_details: { parent: C.events, field: 'details', fk: 'event_id' },
  event_locations: { parent: C.events, field: 'locations', fk: 'event_id' },
} as const;
export type EmbeddedTable = keyof typeof EMBEDDED;

/** Old MySQL table name → collection (for `exists:`/`unique:` rules and other table-name strings). */
export const TABLE_COLLECTION: Record<string, string> = {
  ...Object.fromEntries(Object.values(C).map((c) => [c, c])),
  businesse_requests: C.businessRequests,
  advertisments: C.advertisements,
  node_jobs: C.jobs,
};

/**
 * `SELECT COUNT(*) FROM <table> WHERE <column> = ? [AND <idCol> <> ?]` with MySQL semantics:
 * case-insensitive, and '5' equals 5. Works for embedded child tables too.
 */
export async function countWhere(table: string, column: string, value: unknown, except?: { column: string; value: unknown }) {
  const loose = (v: unknown) => {
    const n = typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
    return n === null ? [v] : [v, n];
  };
  const embedded = EMBEDDED[table as EmbeddedTable];
  const field = (c: string) => {
    if (!embedded) return c === 'id' ? '_id' : c;
    if (c === embedded.fk) return '_id';
    return `${embedded.field}.${c}`;
  };
  const filter: Document = { [field(column)]: { $in: loose(value) } };
  if (except) filter[field(except.column)] = { $nin: loose(except.value) };
  const name = embedded ? embedded.parent : TABLE_COLLECTION[table];
  if (!name) throw new Error(`No collection for table ${table}`);
  if (embedded) {
    // Count matching children, not parents.
    const [r] = await col(name)
      .aggregate(
        [
          { $unwind: `$${embedded.field}` },
          { $match: filter },
          { $count: 'c' },
        ],
        { collation: { locale: 'en', strength: 2 } },
      )
      .toArray();
    return Number(r?.c ?? 0);
  }
  return col(name).countDocuments(filter, { collation: { locale: 'en', strength: 2 } });
}

/** Document → MySQL-shaped row: `_id` becomes `id` in the same (first) position. */
export function toRow<T = Row>(doc: Document | null | undefined): T | null {
  if (!doc) return null;
  const out: Row = {};
  for (const [k, v] of Object.entries(doc)) out[k === '_id' ? 'id' : k] = v;
  return out as T;
}

export const toRows = <T = Row>(docs: Document[]): T[] => docs.map((d) => toRow<T>(d)!);

/** Row → document: `id` becomes `_id`. */
export function toDoc(row: Row): Document {
  const out: Document = {};
  for (const [k, v] of Object.entries(row)) out[k === 'id' ? '_id' : k] = v;
  return out;
}

/** Embedded child + its parent id, shaped like the old child-table row (`id`, `<fk>`, …rest). */
export function childRow(table: EmbeddedTable, parentId: number, child: Row): Row {
  const { id, ...rest } = child;
  return { id, [EMBEDDED[table].fk]: parentId, ...rest };
}

/** AUTO_INCREMENT replacement. Keys: collection name, or `<collection>.<field>` for embedded children. */
export async function nextId(key: string, session?: ClientSession): Promise<number> {
  const r = await col<{ _id: string; seq: number }>(C.counters).findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session },
  );
  return r!.seq;
}

/** Insert a MySQL-shaped row (without id) and return the new integer id (`insertId`). */
export async function insertRow(collection: string, row: Row, session?: ClientSession): Promise<number> {
  const id = await nextId(collection, session);
  const { id: _ignored, ...rest } = row;
  await col(collection).insertOne({ _id: id, ...rest } as Document, { session });
  return id;
}

/** SQL LIKE '%term%' (case-insensitive like MySQL's default collation). */
export const like = (term: string) => ({ $regex: escapeRegex(term), $options: 'i' });
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Numeric id from a route/query param, or null when it isn't one (no match, like `WHERE id = 'abc'`). */
export function intId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

/** Laravel DB::transaction(). Atlas runs a replica set, so multi-document transactions work. */
export async function transaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = client!.startSession();
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
