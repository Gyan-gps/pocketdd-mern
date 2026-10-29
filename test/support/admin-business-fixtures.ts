// business admin fixture reset + cleanup (shared by admin-business.test.ts and the Laravel comparison script).
// Fixtures are written to MySQL (what Laravel reads) and copied to MongoDB (what Node reads).
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../src/config/env.js';
import { all, exec } from '../../src/db/mysql.js';
import { seed } from '../../scripts/seed/08-admin-business.js';
import { migrate } from '../../scripts/migrate-from-mysql.js';
import { C, EMBEDDED, TABLE_COLLECTION, col, toRow, type EmbeddedTable, type Row } from '../../src/db/mongo.js';
import { phpJsonEncode } from '../../src/services/firebase.js';

export const TEST_PREFIX = 'Parity Delta';

/** Rows created by the create paths (Laravel or Node) — removed by name/phone markers. */
export async function cleanupCreated() {
  await exec("DELETE FROM business_owners WHERE business_id IN (SELECT id FROM businesses WHERE business_name_en LIKE 'Parity Delta%')");
  await exec("DELETE FROM business_owners WHERE phone = '9000000955'");
  await exec("DELETE FROM users WHERE phone = '9000000955' AND id NOT BETWEEN 900 AND 919");
  await exec("DELETE FROM businesses WHERE business_name_en LIKE 'Parity Delta%'");
  await exec('DELETE FROM business_details WHERE business_id IN (900, 901, 902) AND id NOT BETWEEN 900 AND 919');
  await exec('DELETE FROM business_iamges WHERE business_id IN (900, 901, 902) AND id NOT BETWEEN 900 AND 919');
  await exec('DELETE FROM business_locations WHERE business_id IN (900, 901, 902) AND id NOT BETWEEN 900 AND 919');
  await exec("DELETE FROM business_owners WHERE business_id IN (900, 901, 902) AND id NOT BETWEEN 900 AND 919");
  await exec("DELETE FROM node_jobs WHERE queue = 'admin-business-test'").catch(() => undefined);
  // Laravel's database queue (PHP comparisons): drop the jobs our submissions enqueued.
  await exec("DELETE FROM jobs WHERE payload LIKE '%Business%Notification%' AND (payload LIKE '%i:90_;%' OR payload LIKE '%Parity Delta%')");
}

/** Re-insert every fixture row exactly as seeded (unlisted columns back to their defaults), then sync MongoDB. */
export async function resetFixtures() {
  await exec('SET FOREIGN_KEY_CHECKS = 0');
  for (const [table, rows] of seed) {
    for (const row of rows) {
      await exec(`DELETE FROM \`${table}\` WHERE id = ?`, [row.id]);
      const cols = Object.keys(row);
      await exec(
        `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => row[c]),
      );
    }
  }
  await exec('SET FOREIGN_KEY_CHECKS = 1');
  // Rows created by tests must never land inside the fixture id range (MySQL keeps max(10000, MAX(id)+1)).
  for (const t of ['businesses', 'business_details', 'business_iamges', 'business_locations', 'business_owners', 'users', 'businesse_requests']) {
    await exec(`ALTER TABLE \`${t}\` AUTO_INCREMENT = 10000`);
  }
  await cleanupCreated();
  // Rebuilds every collection (Node's queued jobs included) from MySQL.
  await migrate({ refresh: true });
}

export const publicFile = (rel: string) => path.posix.join(env.publicPath, rel);
export function putPublicFile(rel: string, content = 'x') {
  fs.mkdirSync(path.posix.dirname(publicFile(rel)), { recursive: true });
  fs.writeFileSync(publicFile(rel), content);
}
export const publicExists = (rel: string) => fs.existsSync(publicFile(rel));
export function removePublic(rel: unknown) {
  if (typeof rel === 'string' && rel) fs.rmSync(publicFile(rel), { force: true });
}

/** Where rows are read from: MySQL (Laravel's writes) or MongoDB (Node's writes). */
let store: 'mysql' | 'mongo' = 'mongo';
export const readFrom = (s: 'mysql' | 'mongo') => void (store = s);

/** column → value, `{ $in: [...] }`, or `{ prefix }` (LIKE 'prefix%'). */
type Where = Record<string, unknown>;

/** JSON columns are native in MongoDB: re-encoded to the stored text so rows compare with MySQL's. */
const JSON_COLUMNS: Record<string, string[]> = { businesses: ['social_media_url'] };

const isIn = (v: unknown): v is { $in: unknown[] } => !!v && typeof v === 'object' && '$in' in v;
const isPrefix = (v: unknown): v is { prefix: string } => !!v && typeof v === 'object' && 'prefix' in v;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `SELECT * FROM <table> WHERE … ORDER BY id` in the current store, MySQL-shaped. */
export async function rows(table: string, where: Where = {}): Promise<Row[]> {
  if (store === 'mysql') {
    const conds: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(where)) {
      if (isIn(v)) {
        conds.push(`\`${k}\` IN (?)`);
        params.push(v.$in);
      } else if (isPrefix(v)) {
        conds.push(`\`${k}\` LIKE ?`);
        params.push(`${v.prefix}%`);
      } else {
        conds.push(`\`${k}\` = ?`);
        params.push(v);
      }
    }
    return all(`SELECT * FROM \`${table}\`${conds.length ? ` WHERE ${conds.join(' AND ')}` : ''} ORDER BY id`, params);
  }
  const filter = Object.fromEntries(
    Object.entries(where).map(([k, v]) => [k === 'id' ? '_id' : k, isPrefix(v) ? { $regex: `^${escapeRegex(v.prefix)}`, $options: 'i' } : v]),
  );
  const e = EMBEDDED[table as EmbeddedTable];
  if (e) {
    const docs = await col(e.parent)
      .aggregate([
        { $unwind: `$${e.field}` },
        { $replaceRoot: { newRoot: { $mergeObjects: [{ _id: `$${e.field}.id`, [e.fk]: '$_id' }, `$${e.field}`] } } },
        { $unset: 'id' },
        { $match: filter },
        { $sort: { _id: 1 } },
      ])
      .toArray();
    return docs.map((d) => toRow(d)!);
  }
  const name = TABLE_COLLECTION[table]!;
  const children = new Set(Object.values(EMBEDDED).filter((x) => x.parent === name).map((x) => x.field as string));
  const docs = await col(name).find(filter).sort({ _id: 1 }).toArray();
  return docs.map((d) => {
    const r = Object.fromEntries(Object.entries(toRow(d)!).filter(([k]) => !children.has(k) && k !== 'geo'));
    for (const c of JSON_COLUMNS[table] ?? []) if (r[c] !== null && r[c] !== undefined) r[c] = phpJsonEncode(r[c]);
    return r;
  });
}

export const row = async (table: string, where: Where = {}) => (await rows(table, where))[0] ?? null;

/** `UPDATE <table> SET … WHERE id = ?` in both stores (fixture tweaks before a request). */
export async function update(table: string, id: number, set: Record<string, unknown>) {
  const keys = Object.keys(set);
  await exec(`UPDATE \`${table}\` SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => set[k]), id]);
  const e = EMBEDDED[table as EmbeddedTable];
  if (e) {
    await col(e.parent).updateOne({ [`${e.field}.id`]: id }, { $set: Object.fromEntries(keys.map((k) => [`${e.field}.$.${k}`, set[k]])) });
  } else await col(TABLE_COLLECTION[table]!).updateOne({ _id: id as never }, { $set: set });
}

/** Jobs Node queued for these tests (MongoDB `jobs`, args native). */
export const nodeJobs = async () =>
  (await col(C.jobs).find({ queue: 'admin-business-test' }).sort({ _id: 1 }).toArray()).map((j) => ({ job: j.job as string, args: j.args }));
