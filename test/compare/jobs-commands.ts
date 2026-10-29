// PHP-vs-Node helper for the artisan commands. Laravel works on MySQL, Node on MongoDB; steps (each a separate invocation):
//   snap-before         → resets phase 7 fixtures (MySQL + copy to MongoDB), records other phases' rows that ads:expire would
//                         touch (/tmp/p7-other.json, read from MySQL)
//   snap-after [mongo]  → prints the job-test rows (status / city_hi / timestamps changed?) from MySQL (default) or MongoDB,
//                         and restores the other rows there
//   jobs-p7 [clean]     → prints Laravel `jobs` (PHP queue, MySQL) and Node `jobs` (MongoDB) rows for the job-test ids, then deletes them
import { readFileSync, writeFileSync } from 'node:fs';
import { all, exec, pool } from '../../src/db/mysql.js';
import { C, closeMongo, col, toRows } from '../../src/db/mongo.js';
import { resetMysqlFixtures } from '../support/jobs-fixtures.js';
import { TODAY } from '../../scripts/seed/06-jobs.js';

const cmd = process.argv[2];
const SEEDED = '2025-06-19 10:30:00';
const inside = { $gte: 700, $lte: 799 };
const sorted = async (name: string, filter: object, projection: object) =>
  toRows(await col(name).find(filter, { projection }).sort({ _id: 1 }).toArray());

if (cmd === 'snap-before') {
  await resetMysqlFixtures();
  const ads = await all('SELECT id, updated_at FROM advertisments WHERE status = 1 AND DATE(to_date) < ? AND id NOT BETWEEN 700 AND 799', [TODAY]);
  const evs = await all('SELECT id, updated_at FROM events WHERE status = 1 AND DATE(`date`) < ? AND id NOT BETWEEN 700 AND 799', [TODAY]);
  writeFileSync('/tmp/p7-other.json', JSON.stringify({ ads, evs }));
  console.log(`other ads=${ads.length} events=${evs.length}`);
} else if (cmd === 'snap-after') {
  const map = (rows: any[]) => rows.map((r) => ({ ...r, updated_at: r.updated_at === SEEDED ? 'seeded' : 'touched' }));
  const { ads, evs } = JSON.parse(readFileSync('/tmp/p7-other.json', 'utf8'));
  if (process.argv[3] === 'mongo') {
    console.log(
      JSON.stringify({
        ads: map(await sorted(C.advertisements, { _id: inside }, { status: 1, updated_at: 1 })),
        events: map(await sorted(C.events, { _id: inside }, { status: 1, updated_at: 1 })),
        pincodes: map(await sorted(C.pincodes, { _id: inside }, { city_hi: 1, updated_at: 1 })),
      }),
    );
    for (const r of ads) await col(C.advertisements).updateOne({ _id: r.id }, { $set: { status: 1, updated_at: r.updated_at } });
    for (const r of evs) await col(C.events).updateOne({ _id: r.id }, { $set: { status: 1, updated_at: r.updated_at } });
  } else {
    console.log(
      JSON.stringify({
        ads: map(await all('SELECT id, status, updated_at FROM advertisments WHERE id BETWEEN 700 AND 799 ORDER BY id')),
        events: map(await all('SELECT id, status, updated_at FROM events WHERE id BETWEEN 700 AND 799 ORDER BY id')),
        pincodes: map(await all('SELECT id, city_hi, updated_at FROM pincodes WHERE id BETWEEN 700 AND 799 ORDER BY id')),
      }),
    );
    for (const r of ads) await exec('UPDATE advertisments SET status = 1, updated_at = ? WHERE id = ?', [r.updated_at, r.id]);
    for (const r of evs) await exec('UPDATE events SET status = 1, updated_at = ? WHERE id = ?', [r.updated_at, r.id]);
  }
} else if (cmd === 'jobs-p7') {
  // Laravel payload: displayName + serialized command; we only extract the class and the ids.
  const php = await all("SELECT id, payload FROM jobs WHERE payload LIKE '%Send%Notification%'");
  const phpOut = php.map((j) => {
    const p = JSON.parse(j.payload);
    return { job: p.displayName.replace('App\\Jobs\\', ''), command: p.data.command };
  });
  // args as the JSON text the old node_jobs table held
  const node = (await sorted(C.jobs, { queue: 'p7cmp' }, { job: 1, args: 1 })).map((j) => ({ job: j.job, args: JSON.stringify(j.args) }));
  console.log(JSON.stringify({ php: phpOut, node }));
  if (process.argv[3] === 'clean') {
    await exec("DELETE FROM jobs WHERE payload LIKE '%Send%Notification%'");
    await col(C.jobs).deleteMany({ queue: 'p7cmp' });
  }
}
await pool.end();
await closeMongo();
