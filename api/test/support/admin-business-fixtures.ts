// business admin fixture reset + cleanup (shared by admin-business.test.ts and the Laravel comparison script).
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../src/config/env.js';
import { exec, first } from '../../src/db/pool.js';
import { seed } from '../../scripts/seed/08-admin-business.js';

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
  await exec("DELETE FROM node_jobs WHERE queue = 'admin-business-test'");
  // Laravel's database queue (PHP comparisons): drop the jobs our submissions enqueued.
  await exec("DELETE FROM jobs WHERE payload LIKE '%Business%Notification%' AND (payload LIKE '%i:90_;%' OR payload LIKE '%Parity Delta%')");
}

/** Re-insert every fixture row exactly as seeded (unlisted columns back to their defaults). */
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

export const row = (table: string, where: string, params: unknown[] = []) => first(`SELECT * FROM \`${table}\` WHERE ${where} LIMIT 1`, params);
