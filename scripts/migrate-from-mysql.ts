/**
 * One-shot copy MySQL (Laravel schema) → MongoDB (MONGODB_SCHEMA.md). Drops and rebuilds every target
 * collection, so it can be re-run any time (the parity tests do, to give Laravel and Node the same data).
 *
 *   DB_HOST=127.0.0.1 npx tsx --env-file=.env scripts/migrate-from-mysql.ts
 */
import type { Document } from 'mongodb';
import { all, first, pool } from '../src/db/mysql.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { C, EMBEDDED, col } from './lib/raw-collections.js';
import { type EmbeddedTable, type Row } from '../src/db/mongo.js';
import { ensureIndexes } from '../src/db/indexes.js';
import { env } from '../src/config/env.js';

/** Top-level tables → collection, with the TEXT/LONGTEXT/JSON columns that hold JSON. */
const TABLES: Array<{ table: string; collection: string; json?: string[] }> = [
  { table: 'users', collection: C.users },
  { table: 'personal_access_tokens', collection: C.tokens, json: ['abilities'] },
  { table: 'businesses', collection: C.businesses, json: ['social_media_url'] },
  { table: 'business_categories', collection: C.businessCategories },
  { table: 'business_sub_categories', collection: C.businessSubCategories },
  { table: 'business_users', collection: C.businessUsers },
  { table: 'businesse_requests', collection: C.businessRequests },
  { table: 'locations', collection: C.locations },
  { table: 'pincodes', collection: C.pincodes },
  { table: 'addresses', collection: C.addresses, json: ['area', 'area_hi'] },
  { table: 'advertisments', collection: C.advertisements, json: ['sub_category_name'] },
  { table: 'ad_user_views', collection: C.adUserViews },
  { table: 'events', collection: C.events },
  { table: 'departments', collection: C.departments, json: ['designation_id', 'department_mobile_number'] },
  { table: 'designations', collection: C.designations },
  { table: 'administrators', collection: C.administrators },
  { table: 'city_helpline_numbers', collection: C.cityHelplines, json: ['city_helpline'] },
  { table: 'about_uses', collection: C.aboutUs, json: ['tourist_places'] },
  { table: 'sliders', collection: C.sliders },
  { table: 'user_notifications', collection: C.userNotifications, json: ['data'] },
  { table: 'device_ids', collection: C.deviceIds },
  { table: 'otp_verifications', collection: C.otpVerifications },
  { table: 'api_failures', collection: C.apiFailures },
  { table: 'node_jobs', collection: C.jobs, json: ['args'] },
  { table: 'language_lines', collection: C.languageLines, json: ['text'] },
  { table: 'app_versions', collection: C.appVersions },
];

/** JSON-holding columns of embedded child tables. */
const CHILD_JSON: Partial<Record<EmbeddedTable, string[]>> = {};

/** Decode once; a value that isn't valid JSON (or was double-encoded) is kept as stored. */
function decode(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function decodeJson(row: Row, cols: string[] = []): Row {
  const out = { ...row };
  for (const c of cols) if (c in out) out[c] = decode(out[c]);
  return out;
}

const toDoc = ({ id, ...rest }: Row): Document => ({ _id: Number(id), ...rest });

async function tableExists(table: string) {
  return !!(await first('SELECT 1 AS x FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [table]));
}

async function autoIncrement(table: string): Promise<number> {
  const r = await first(
    'SELECT AUTO_INCREMENT AS ai FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [table],
  );
  const max = await first(`SELECT COALESCE(MAX(id), 0) AS m FROM \`${table}\``);
  // Counter holds the last used id; nextId() returns seq + 1.
  return Math.max(Number(r?.ai ?? 1) - 1, Number(max?.m ?? 0));
}

/**
 * Copy everything. Returns a per-collection report. Caller owns the MySQL pool and Mongo connection.
 * `refresh: true` empties and refills the collections instead of dropping them (keeps indexes; much faster
 * for the parity tests, which re-sync before every Node request).
 */
export async function migrate({ refresh = false } = {}): Promise<string[]> {
  await connectDatabase();
  await col('_orphans').deleteMany({});
  const counters: Document[] = [];
  const report: string[] = [];
  const docsByCollection = new Map<string, Map<number, Document>>();

  for (const t of TABLES) {
    if (!(await tableExists(t.table))) {
      report.push(`${t.table}: missing in MySQL, skipped`);
      continue;
    }
    const rows = await all(`SELECT * FROM \`${t.table}\` ORDER BY id`);
    const docs = new Map(rows.map((r) => [Number(r.id), toDoc(decodeJson(r, t.json))]));
    docsByCollection.set(t.collection, docs);
    counters.push({ _id: t.collection, seq: await autoIncrement(t.table) });
  }

  // Embed child tables, keeping their own id and column order minus the parent id.
  for (const [table, e] of Object.entries(EMBEDDED) as Array<[EmbeddedTable, (typeof EMBEDDED)[EmbeddedTable]]>) {
    const parents = docsByCollection.get(e.parent);
    if (!parents || !(await tableExists(table))) {
      report.push(`${table}: skipped (no parent collection or table)`);
      continue;
    }
    for (const p of parents.values()) p[e.field] ??= [];
    const rows = await all(`SELECT * FROM \`${table}\` ORDER BY id`);
    let orphans = 0;
    for (const r of rows) {
      const { [e.fk]: parentId, ...child } = decodeJson(r, CHILD_JSON[table]);
      const parent = parentId == null ? undefined : parents.get(Number(parentId));
      if (!parent) {
        orphans++;
        await col('_orphans').insertOne({ table, row: r });
        continue;
      }
      (parent[e.field] as Row[]).push({ ...child, id: Number(child.id) });
    }
    counters.push({ _id: `${e.parent}.${e.field}`, seq: await autoIncrement(table) });
    report.push(`${table} → ${e.parent}.${e.field}: ${rows.length - orphans} embedded${orphans ? `, ${orphans} orphans → _orphans` : ''}`);
  }

  const reset = (name: string) => (refresh ? col(name).deleteMany({}) : col(name).drop().catch(() => undefined));
  await Promise.all(
    [...docsByCollection].map(async ([name, docs]) => {
      await reset(name);
      if (docs.size) await col(name).insertMany([...docs.values()]);
    }),
  );
  for (const [name, docs] of docsByCollection) report.push(`${name}: ${docs.size}`);
  await reset(C.counters);
  await col(C.counters).insertMany(counters);
  if (!refresh) await ensureIndexes();

  return report;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/migrate-from-mysql.ts')) {
  try {
    const report = await migrate();
    console.log(`MySQL ${env.db.database} → MongoDB ${env.mongo.db}`);
    console.log(report.join('\n'));
  } finally {
    await pool.end();
    await disconnectDatabase();
  }
}
