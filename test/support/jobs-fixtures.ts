// Job test helpers: fixture reset, fake service account, mock FCM transport. Also usable as a CLI
// for the PHP-vs-Node comparison:  npx tsx test/jobs-fixtures.ts reset|dump|sa <path>|node-job <Name> <json args>
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { all, exec, pool } from '../../src/db/mysql.js';
import { seed } from '../../scripts/seed/06-jobs.js';
import { migrate } from '../../scripts/migrate-from-mysql.js';
import { C, closeMongo, col, TABLE_COLLECTION } from '../../scripts/lib/raw-collections.js';
import { toDoc, toRows } from '../../src/db/mongo.js';
import { type HttpRequest, setFcmTransport, clearFcmTokenCache, phpJsonEncode } from '../../src/services/firebase.service.js';

export const JOB_TEST_USERS = [700, 701, 702, 703];

/** Re-apply the job-test seed rows to MongoDB (upsert by id): for tests that only talk to Node. */
export async function resetFixtures() {
  for (const [table, rows] of seed) {
    for (const row of rows) {
      const doc = toDoc(row);
      await col(TABLE_COLLECTION[table] ?? table).replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
  }
}

/** Seed MySQL (what Laravel reads) and copy it to MongoDB (what Node reads): for the PHP-vs-Node comparison. */
export async function resetMysqlFixtures() {
  for (const [table, rows] of seed) {
    for (const row of rows) {
      const keys = Object.keys(row);
      await exec(
        `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (?) ON DUPLICATE KEY UPDATE ${keys
          .map((k) => `\`${k}\` = VALUES(\`${k}\`)`)
          .join(', ')}`,
        [keys.map((k) => row[k])],
      );
    }
  }
  await migrate({ refresh: true });
}

export async function maxNotificationId(): Promise<number> {
  const [last] = await col(C.userNotifications).find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).limit(1).toArray();
  return Number(last?._id ?? 0);
}

/** Remove notifications created after `since` (jobs notify every user with a token, incl. other phases'). */
export async function cleanupNotifications(since: number, store: 'mongo' | 'mysql' = 'mongo') {
  if (store === 'mysql') await exec('DELETE FROM user_notifications WHERE id > ?', [since]);
  else await col(C.userNotifications).deleteMany({ _id: { $gt: since } as never });
}

/** Phase-7 users' notifications, comparable across PHP/Node runs (timestamps → presence only). `data` is re-encoded to the raw JSON text. */
export async function dumpNotifications(since: number, store: 'mongo' | 'mysql' = 'mongo') {
  if (store === 'mysql') {
    const rows = await all(
      'SELECT user_id, title, message, data, is_read, created_at IS NOT NULL AS has_created, updated_at IS NOT NULL AS has_updated FROM user_notifications WHERE id > ? AND user_id IN (?) ORDER BY id',
      [since, JOB_TEST_USERS],
    );
    return rows.map((r) => ({ ...r }));
  }
  const docs = await col(C.userNotifications)
    .find({ _id: { $gt: since } as never, user_id: { $in: JOB_TEST_USERS } })
    .sort({ _id: 1 })
    .toArray();
  return toRows(docs).map((r) => ({
    user_id: r.user_id,
    title: r.title,
    message: r.message,
    data: r.data === null || r.data === undefined ? null : phpJsonEncode(r.data),
    is_read: r.is_read,
    has_created: r.created_at != null ? 1 : 0,
    has_updated: r.updated_at != null ? 1 : 0,
  }));
}

/** Writes a fake (but valid RSA) service account JSON. */
export function writeFakeServiceAccount(file: string) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(
    file,
    JSON.stringify({
      type: 'service_account',
      project_id: 'phase7-fake-project',
      client_email: 'phase7@phase7-fake-project.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    }),
  );
}

/** Installs a transport that records requests and answers like Google (never touches the network). */
export function mockFcm(opts: { fcmStatus?: number; tokenStatus?: number } = {}) {
  const requests: HttpRequest[] = [];
  clearFcmTokenCache();
  setFcmTransport(async (req) => {
    requests.push(req);
    if (req.url === 'https://oauth2.googleapis.com/token') {
      return opts.tokenStatus && opts.tokenStatus >= 300
        ? { status: opts.tokenStatus, body: '{"error":"invalid_grant"}' }
        : { status: 200, body: '{"access_token":"fake-access-token","expires_in":3599}' };
    }
    const status = opts.fcmStatus ?? 200;
    return status < 300
      ? { status, body: '{"name":"projects/phase7-fake-project/messages/1"}' }
      : { status, body: '{"error":{"code":400,"message":"bad token"}}' };
  });
  return requests;
}

// ---- CLI for the PHP comparison ----
if (process.argv[1]?.endsWith('jobs-fixtures.ts')) {
  const [cmd, a, b] = process.argv.slice(2);
  // reset: seed MySQL (Laravel) + copy to MongoDB (Node). dump <since> [mysql]: read the PHP (mysql) or Node (default) side.
  if (cmd === 'reset') {
    await resetMysqlFixtures();
    console.log(await maxNotificationId());
  } else if (cmd === 'dump') {
    const store = b === 'mysql' ? 'mysql' : 'mongo';
    console.log(JSON.stringify(await dumpNotifications(Number(a), store)));
    await cleanupNotifications(Number(a), store);
  } else if (cmd === 'sa') {
    writeFakeServiceAccount(a!);
  } else if (cmd === 'node-job') {
    const { JOBS } = await import('../../src/jobs/queue.js');
    const { logSink } = await import('../../src/core/logging/log.js');
    logSink.lines = []; // keep stdout to the comparable output
    const reqs = mockFcm();
    try {
      await JOBS[a!]!(...(JSON.parse(b!) as unknown[]));
    } catch (e) {
      console.log('THROWN', (e as Error).message);
    }
    // only requests for job-test tokens (other fixtures' users may also hold tokens)
    console.log(JSON.stringify(reqs.filter((r) => r.url.includes('fcm') && r.body.includes('phase7-fake')).map((r) => r.body)));
  }
  await pool.end();
  await closeMongo();
}
