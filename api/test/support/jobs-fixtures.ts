// Job test helpers: fixture reset, fake service account, mock FCM transport. Also usable as a CLI
// for the PHP-vs-Node comparison:  npx tsx test/jobs-fixtures.ts reset|dump|sa <path>|node-job <Name> <json args>
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { all, exec, first, pool } from '../../src/db/pool.js';
import { seed } from '../../scripts/seed/06-jobs.js';
import { type HttpRequest, setFcmTransport, clearFcmTokenCache } from '../../src/services/firebase.js';

export const JOB_TEST_USERS = [700, 701, 702, 703];

/** Re-apply the job-test seed rows (upsert by id). */
export async function resetFixtures() {
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
}

export async function maxNotificationId(): Promise<number> {
  return Number((await first('SELECT COALESCE(MAX(id), 0) m FROM user_notifications'))!.m);
}

/** Remove notifications created after `since` (jobs notify every user with a token, incl. other phases'). */
export async function cleanupNotifications(since: number) {
  await exec('DELETE FROM user_notifications WHERE id > ?', [since]);
}

/** Phase-7 users' notifications, comparable across PHP/Node runs (timestamps → presence only). */
export async function dumpNotifications(since: number) {
  const rows = await all(
    'SELECT user_id, title, message, data, is_read, created_at IS NOT NULL AS has_created, updated_at IS NOT NULL AS has_updated FROM user_notifications WHERE id > ? AND user_id IN (?) ORDER BY id',
    [since, JOB_TEST_USERS],
  );
  return rows.map((r) => ({ ...r }));
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
  if (cmd === 'reset') {
    await resetFixtures();
    console.log(await maxNotificationId());
  } else if (cmd === 'dump') {
    console.log(JSON.stringify(await dumpNotifications(Number(a))));
    await cleanupNotifications(Number(a));
  } else if (cmd === 'sa') {
    writeFakeServiceAccount(a!);
  } else if (cmd === 'node-job') {
    const { JOBS } = await import('../../src/jobs/dispatch.js');
    const { logSink } = await import('../../src/jobs/log.js');
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
}
