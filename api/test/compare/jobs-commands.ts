// PHP-vs-Node helper for the artisan commands. Steps (each a separate invocation):
//   snap-before  → resets phase 7 fixtures, records other phases' rows that ads:expire would touch (/tmp/p7-other.json)
//   snap-after   → prints the job-test rows (status / city_hi / timestamps changed?) and restores the other rows
//   jobs-p7      → prints Laravel `jobs` (PHP queue) or `node_jobs` rows for the job-test ids, then deletes them
import { readFileSync, writeFileSync } from 'node:fs';
import { all, exec, pool } from '../../src/db/pool.js';
import { resetFixtures } from '../support/jobs-fixtures.js';
import { TODAY } from '../../scripts/seed/06-jobs.js';

const cmd = process.argv[2];
const SEEDED = '2025-06-19 10:30:00';
if (cmd === 'snap-before') {
  await resetFixtures();
  const ads = await all('SELECT id, updated_at FROM advertisments WHERE status = 1 AND DATE(to_date) < ? AND id NOT BETWEEN 700 AND 799', [TODAY]);
  const evs = await all('SELECT id, updated_at FROM events WHERE status = 1 AND DATE(`date`) < ? AND id NOT BETWEEN 700 AND 799', [TODAY]);
  writeFileSync('/tmp/p7-other.json', JSON.stringify({ ads, evs }));
  console.log(`other ads=${ads.length} events=${evs.length}`);
} else if (cmd === 'snap-after') {
  const map = (rows: any[]) => rows.map((r) => ({ ...r, updated_at: r.updated_at === SEEDED ? 'seeded' : 'touched' }));
  console.log(
    JSON.stringify({
      ads: map(await all('SELECT id, status, updated_at FROM advertisments WHERE id BETWEEN 700 AND 799 ORDER BY id')),
      events: map(await all('SELECT id, status, updated_at FROM events WHERE id BETWEEN 700 AND 799 ORDER BY id')),
      pincodes: map(await all('SELECT id, city_hi, updated_at FROM pincodes WHERE id BETWEEN 700 AND 799 ORDER BY id')),
    }),
  );
  const { ads, evs } = JSON.parse(readFileSync('/tmp/p7-other.json', 'utf8'));
  for (const r of ads) await exec('UPDATE advertisments SET status = 1, updated_at = ? WHERE id = ?', [r.updated_at, r.id]);
  for (const r of evs) await exec('UPDATE events SET status = 1, updated_at = ? WHERE id = ?', [r.updated_at, r.id]);
} else if (cmd === 'jobs-p7') {
  // Laravel payload: displayName + serialized command; we only extract the class and the ids.
  const php = await all("SELECT id, payload FROM jobs WHERE payload LIKE '%Send%Notification%'");
  const phpOut = php.map((j) => {
    const p = JSON.parse(j.payload);
    return { job: p.displayName.replace('App\\Jobs\\', ''), command: p.data.command };
  });
  const node = await all("SELECT job, args FROM node_jobs WHERE queue = 'p7cmp'");
  console.log(JSON.stringify({ php: phpOut, node }));
  if (process.argv[3] === 'clean') {
    await exec("DELETE FROM jobs WHERE payload LIKE '%Send%Notification%'");
    await exec("DELETE FROM node_jobs WHERE queue = 'p7cmp'");
  }
}
await pool.end();
