// FirebaseService, queued jobs, DB queue, scheduled commands — run directly against the DB with a mocked
// FCM transport (no network, fake tokens only).
//   docker compose exec -T api npx tsx --test test/jobs.test.ts
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { all, exec, first, pool } from '../src/db/pool.js';
import { FirebaseService, setFcmTransport } from '../src/services/firebase.js';
import { dispatchJob, JOBS, workOnce, workUntilEmpty } from '../src/jobs/dispatch.js';
import { logSink } from '../src/jobs/log.js';
import { adsExpire } from '../src/commands/ads-expire.js';
import { notificationsSendScheduled } from '../src/commands/notifications-send-scheduled.js';
import { translateCitiesHindi } from '../src/commands/translate-cities-hindi.js';
import { SCHEDULE } from '../src/commands/index.js';
import { bufferIO } from '../src/commands/io.js';
import { transliterateEnglishToHindi } from '../src/helpers/transliterate.js';
import { TODAY } from '../scripts/seed/06-jobs.js';
import {
  cleanupNotifications,
  maxNotificationId,
  mockFcm,
  resetFixtures,
  writeFakeServiceAccount,
} from './support/jobs-fixtures.js';

const QUEUE = 'phase7-test';
process.env.NODE_QUEUE = QUEUE; // the API's in-process worker only consumes 'default'
const dir = mkdtempSync(path.join(tmpdir(), 'p7-'));
writeFakeServiceAccount(path.join(dir, 'sa.json'));
const useCredentials = () => {
  process.env.FIREBASE_BASE_PATH = dir;
  process.env.FIREBASE_CREDENTIALS = 'sa.json';
};
const noCredentials = () => {
  delete process.env.FIREBASE_CREDENTIALS;
  process.env.FIREBASE_BASE_PATH = dir;
};

let since = 0;
const fcmBodies = (reqs: { url: string; body: string }[]) =>
  reqs.filter((r) => r.url.includes('fcm.googleapis.com')).map((r) => JSON.parse(r.body));
const p7Notifs = () =>
  all('SELECT user_id, title, message, data, is_read FROM user_notifications WHERE id > ? AND user_id BETWEEN 700 AND 799 ORDER BY user_id', [since]);
const usersWithToken = async (exclude?: number) =>
  (await all('SELECT id, fcm_token FROM users WHERE fcm_token IS NOT NULL' + (exclude ? ' AND id != ?' : ''), exclude ? [exclude] : []));

before(async () => {
  await resetFixtures();
  logSink.lines = [];
});
beforeEach(async () => {
  since = await maxNotificationId();
  logSink.lines = [];
  useCredentials();
});
after(async () => {
  await cleanupNotifications(since);
  await exec('DELETE FROM node_jobs WHERE queue = ?', [QUEUE]);
  setFcmTransport(null);
  await pool.end();
});

describe('FirebaseService', () => {
  it('missing FIREBASE_CREDENTIALS → ErrorException from the constructor (base_path is a directory)', () => {
    noCredentials();
    assert.throws(() => new FirebaseService(), /file_get_contents\(\): Read of 8192 bytes failed with errno=21 Is a directory/);
    process.env.FIREBASE_CREDENTIALS = 'missing.json';
    assert.throws(() => new FirebaseService(), /Failed to open stream: No such file or directory/);
  });

  it('token request + sendToDevice payload match the PHP bytes', async () => {
    const reqs = mockFcm();
    const fb = new FirebaseService();
    const res = await fb.sendToDevice('tok', 'Tïtle/x', 'Body', {}, 'http://localhost/a.png');
    assert.deepEqual(res, {
      success: true,
      message: 'Notification sent successfully',
      response: { name: 'projects/phase7-fake-project/messages/1' },
    });
    assert.equal(reqs.length, 2);
    const tokenReq = reqs[0]!;
    assert.equal(tokenReq.url, 'https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(tokenReq.body);
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [h, c] = form.get('assertion')!.split('.');
    assert.equal(Buffer.from(h!, 'base64url').toString(), '{"alg":"RS256","typ":"JWT"}');
    const claims = Buffer.from(c!, 'base64url').toString();
    assert.match(claims, /^\{"iss":"phase7@phase7-fake-project.iam.gserviceaccount.com","scope":"https:\\\/\\\/www.googleapis.com\\\/auth\\\/firebase.messaging","aud":"https:\\\/\\\/oauth2.googleapis.com\\\/token","iat":\d+,"exp":\d+\}$/);
    const fcm = reqs[1]!;
    assert.equal(fcm.url, 'https://fcm.googleapis.com/v1/projects/phase7-fake-project/messages:send');
    assert.deepEqual(fcm.headers, { Authorization: 'Bearer fake-access-token', 'Content-Type': 'application/json' });
    // json_encode: escaped slashes, \u-escaped non-ASCII, empty data → []
    assert.equal(
      fcm.body,
      '{"message":{"token":"tok","notification":{"title":"T\\u00eftle\\/x","body":"Body","image":"http:\\/\\/localhost\\/a.png"},"data":[]}}',
    );
    // token cached (Cache::remember 3300s)
    await fb.sendToDevice('tok2', 't', 'b');
    assert.equal(reqs.length, 3);
  });

  it('failure shapes: FCM error, token error, transport exception', async () => {
    mockFcm({ fcmStatus: 400 });
    let fb = new FirebaseService();
    assert.deepEqual(await fb.sendToMultipleDevices(['a', 'b'], 't', 'b', { k: 'v' }), {
      success: 0,
      failed: 2,
      responses: [
        { success: false, message: 'Failed to send notification', error: { error: { code: 400, message: 'bad token' } }, status: 400 },
        { success: false, message: 'Failed to send notification', error: { error: { code: 400, message: 'bad token' } }, status: 400 },
      ],
    });
    mockFcm({ tokenStatus: 401 });
    fb = new FirebaseService();
    assert.deepEqual(await fb.sendToDevice('a', 't', 'b'), {
      success: false,
      message: 'Failed to get access token: {"error":"invalid_grant"}',
    });
    mockFcm();
    setFcmTransport(async () => {
      throw new Error('cURL error 6: Could not resolve host');
    });
    assert.deepEqual(await new FirebaseService().subscribeToTopic(['a'], 'news'), {
      success: false,
      message: 'cURL error 6: Could not resolve host',
    });
  });
});

describe('jobs', () => {
  beforeEach(resetFixtures);

  it('SendBusinessApproveNotification: push to owner + double-encoded data row', async () => {
    const reqs = mockFcm();
    await JOBS.SendBusinessApproveNotification!(700);
    assert.deepEqual(fcmBodies(reqs), [
      {
        message: {
          token: 'phase7-fake-token-a',
          notification: { title: 'Business Approved 🎉', body: 'Congratulations! Your business "Phase7 Sweets" has been approved successfully.' },
          data: { business_id: '700', type: 'business_approved' },
        },
      },
    ]);
    assert.deepEqual(await p7Notifs(), [
      {
        user_id: 700,
        title: 'Business Approved 🎉',
        message: 'Congratulations! Your business "Phase7 Sweets" has been approved successfully.',
        data: '"{\\"business_id\\":700,\\"type\\":\\"business_approved\\"}"',
        is_read: 0,
      },
    ]);
  });

  it('SendBusinessApproveNotification: owner without token → no push, still a row; unknown business → nothing', async () => {
    noCredentials(); // would throw if FirebaseService were constructed
    await JOBS.SendBusinessApproveNotification!(701);
    await JOBS.SendBusinessApproveNotification!(799);
    assert.deepEqual((await p7Notifs()).map((r) => r.user_id), [702]);
  });

  it('SendBusinessCreatedNotification: every token holder except the owner; raw id kept in data', async () => {
    const reqs = mockFcm();
    await JOBS.SendBusinessCreatedNotification!('700', { state_en: null }, 700);
    const expected = await usersWithToken(700);
    const bodies = fcmBodies(reqs);
    assert.deepEqual(bodies.map((b) => b.message.token), expected.map((u) => u.fcm_token));
    assert.deepEqual(bodies[0].message.notification, {
      title: '🎉 New Business Added',
      body: 'Phase7 Sweets has joined PocketDD. Explore the business now!',
      image: 'http://localhost/uploads/business_logo/p7.png',
    });
    assert.deepEqual(bodies[0].message.data, { business_id: '700', type: 'business_created' });
    const rows = await p7Notifs();
    assert.deepEqual(rows.map((r) => r.user_id), [701, 703]);
    assert.equal(rows[0]!.data, '{"business_id":"700","type":"business_created"}');
    assert.ok(logSink.lines!.some((l) => l.message === 'Business notifications saved.'));
  });

  it('SendBusinessCreatedNotification: absolute logo URL passes through; exclude null → owner included', async () => {
    const reqs = mockFcm();
    await JOBS.SendBusinessCreatedNotification!(701, {});
    assert.equal(fcmBodies(reqs)[0].message.notification.image, 'https://cdn.example.test/p7.png');
    assert.deepEqual((await p7Notifs()).map((r) => r.user_id), [700, 701, 703]);
    assert.equal((await p7Notifs())[0]!.data, '{"business_id":701,"type":"business_created"}');
  });

  it('SendAdvertisementNotification: payload, image url, rows', async () => {
    const reqs = mockFcm();
    await JOBS.SendAdvertisementNotification!(700, '700');
    const b = fcmBodies(reqs).find((x) => x.message.token === 'phase7-fake-token-b');
    assert.deepEqual(b, {
      message: {
        token: 'phase7-fake-token-b',
        notification: {
          title: '📢 New Advertisement',
          body: 'Phase7 Sweets has published a new advertisement. Check it out now!',
          image: 'http://localhost/uploads/adv_images/p7ad.png',
        },
        data: { advertisement_id: '700', business_id: '700', type: 'advertisement_created' },
      },
    });
    const rows = await p7Notifs();
    assert.deepEqual(rows.map((r) => r.user_id), [700, 701, 703]);
    assert.equal(rows[0]!.data, '{"advertisement_id":700,"business_id":700,"type":"advertisement_created"}');
  });

  it('SendAdvertisementNotification: missing business → warning only', async () => {
    mockFcm();
    await JOBS.SendAdvertisementNotification!(700, '799');
    assert.deepEqual(await p7Notifs(), []);
    assert.deepEqual(logSink.lines![0], {
      level: 'WARNING',
      message: 'Advertisement or Business not found.',
      context: { advertisement_id: 700, business_id: '799' },
    });
  });

  it('SendEventNotification: message joins description; data is {"event_id":<raw>}', async () => {
    const reqs = mockFcm();
    await JOBS.SendEventNotification!(700, 's', 'd', 'Phase7 Mela', 'Fun fair');
    const n = fcmBodies(reqs)[0].message;
    assert.deepEqual(n.notification, {
      title: '🎉 New Event',
      body: 'Phase7 Mela - Fun fair',
      image: 'http://localhost/uploads/event_images/p7ev.png',
    });
    assert.deepEqual(n.data, { event_id: '700', type: 'event_created' });
    const rows = await p7Notifs();
    assert.equal(rows[0]!.message, 'Phase7 Mela - Fun fair');
    assert.equal(rows[0]!.data, '{"event_id":700}');
    await JOBS.SendEventNotification!(701, 's', 'd', 'Only Name', '0'); // '0' is empty() in PHP
    assert.ok((await p7Notifs()).some((r) => r.message === 'Only Name'));
  });

  it('no credentials → job throws before any insert (as on the local Laravel)', async () => {
    noCredentials();
    await assert.rejects(JOBS.SendEventNotification!(700, null, null, 'x', null), /Is a directory/);
    await assert.rejects(JOBS.SendAdvertisementNotification!(700, 700), /Is a directory/);
    await assert.rejects(JOBS.SendBusinessCreatedNotification!(700, {}, null), /Is a directory/);
    assert.deepEqual(await p7Notifs(), []);
    assert.equal(logSink.lines!.filter((l) => l.level === 'ERROR').length, 3);
    assert.equal(logSink.lines!.filter((l) => l.level === 'ERROR')[1]!.message, 'Job SendBusinessCreatedNotification Failed.');
  });
});

describe('queue', () => {
  beforeEach(async () => {
    await resetFixtures();
    await exec('DELETE FROM node_jobs WHERE queue = ?', [QUEUE]);
  });

  it('dispatch → worker runs it and deletes the row', async () => {
    mockFcm();
    const id = await dispatchJob('SendBusinessApproveNotification', 700);
    const row = await first('SELECT queue, job, args, attempts, reserved_at, failed_at FROM node_jobs WHERE id = ?', [id]);
    assert.deepEqual({ ...row }, { queue: QUEUE, job: 'SendBusinessApproveNotification', args: '[700]', attempts: 0, reserved_at: null, failed_at: null });
    assert.equal(await workUntilEmpty(), 1);
    assert.equal(await first('SELECT id FROM node_jobs WHERE id = ?', [id]), null);
    assert.equal((await p7Notifs()).length, 1);
  });

  it('exception → failed (tries=1) with exception text, not retried', async () => {
    noCredentials();
    const id = await dispatchJob('SendEventNotification', 700, null, null, 'x', null);
    assert.equal(await workOnce(), true);
    const row = await first('SELECT attempts, failed_at, exception, reserved_at FROM node_jobs WHERE id = ?', [id]);
    assert.equal(row!.attempts, 1);
    assert.ok(row!.failed_at);
    assert.match(row!.exception, /^ErrorException: file_get_contents\(\): Read of 8192 bytes failed/);
    assert.equal(await workOnce(), false);
  });

  it('stale reservation (> retry_after) → MaxAttemptsExceededException', async () => {
    const id = await dispatchJob('SendBusinessApproveNotification', 700);
    await exec('UPDATE node_jobs SET attempts = 1, reserved_at = UNIX_TIMESTAMP() - 91 WHERE id = ?', [id]);
    assert.equal(await workOnce(), true);
    const row = await first('SELECT attempts, exception FROM node_jobs WHERE id = ?', [id]);
    assert.equal(row!.attempts, 2);
    assert.match(row!.exception, /^Illuminate\\Queue\\MaxAttemptsExceededException: App\\Jobs\\SendBusinessApproveNotification has been attempted too many times\./);
  });

  it('unknown job name is rejected at dispatch', async () => {
    await assert.rejects(dispatchJob('Nope'), /Unknown job Nope/);
  });
});

describe('commands', () => {
  beforeEach(resetFixtures);

  it('schedule matches `php artisan schedule:list` (translate:cities-hindi not scheduled)', () => {
    assert.deepEqual(SCHEDULE, [
      { command: 'ads:expire', at: '00:00' },
      { command: 'notifications:send-scheduled', at: '10:00' },
    ]);
  });

  it('ads:expire deactivates ads with to_date < today and events with date < today', async () => {
    // other phases' rows that the global UPDATE will touch — restored afterwards
    const otherAds = await all("SELECT id, updated_at FROM advertisments WHERE status = 1 AND DATE(to_date) < ? AND id NOT BETWEEN 700 AND 799", [TODAY]);
    const otherEvents = await all('SELECT id, updated_at FROM events WHERE status = 1 AND DATE(`date`) < ? AND id NOT BETWEEN 700 AND 799', [TODAY]);
    const io = bufferIO();
    try {
      assert.equal(await adsExpire(io), 0);
    } finally {
      for (const r of otherAds) await exec('UPDATE advertisments SET status = 1, updated_at = ? WHERE id = ?', [r.updated_at, r.id]);
      for (const r of otherEvents) await exec('UPDATE events SET status = 1, updated_at = ? WHERE id = ?', [r.updated_at, r.id]);
    }
    const ads = await all('SELECT id, status, updated_at FROM advertisments WHERE id BETWEEN 700 AND 799 ORDER BY id');
    assert.deepEqual(ads.map((a) => [a.id, a.status]), [[700, 0], [701, 1], [702, 0], [703, 1]]);
    assert.notEqual(ads[0]!.updated_at, '2025-06-19 10:30:00'); // Eloquent update() touches updated_at
    assert.equal(ads[1]!.updated_at, '2025-06-19 10:30:00');
    const evs = await all('SELECT id, status FROM events WHERE id BETWEEN 700 AND 799 ORDER BY id');
    assert.deepEqual(evs.map((a) => [a.id, a.status]), [[700, 0], [701, 1]]);
    assert.deepEqual(io.lines, [
      `info: Expired ads deactivated: ${1 + otherAds.length}`,
      `info: Expired events deactivated: ${1 + otherEvents.length}`,
    ]);
    assert.deepEqual(logSink.lines![0], {
      level: 'INFO',
      message: 'Expire Advertisements & Events Cron Executed',
      context: { date: TODAY, expired_ads: 1 + otherAds.length, expired_events: 1 + otherEvents.length },
    });
  });

  it('notifications:send-scheduled enqueues ad + business jobs with the PHP args', async () => {
    await exec('DELETE FROM node_jobs WHERE queue = ?', [QUEUE]);
    const io = bufferIO();
    assert.equal(await notificationsSendScheduled(io), 0);
    const jobs = await all('SELECT job, args FROM node_jobs WHERE queue = ? ORDER BY id', [QUEUE]);
    assert.ok(jobs.some((j) => j.job === 'SendAdvertisementNotification' && j.args === '[700,"700"]'));
    assert.ok(
      jobs.some(
        (j) => j.job === 'SendBusinessCreatedNotification' && j.args === '[700,{"state_en":null,"dist_en":null,"business_name_en":"Phase7 Sweets"},700]',
      ),
    );
    assert.ok(!jobs.some((j) => j.args.startsWith('[701') || j.args.startsWith('[702')));
    const ads = jobs.filter((j) => j.job === 'SendAdvertisementNotification').length;
    const biz = jobs.length - ads;
    assert.deepEqual(io.lines, [
      `info: Found ${ads} advertisements to notify.`,
      `info: Found ${biz} businesses to notify.`,
      `info: Starting scheduled notification dispatch for: ${TODAY}`,
      `info: Successfully dispatched ${ads} advertisement notifications.`,
      `info: Successfully dispatched ${biz} business notifications.`,
    ]);
    await exec('DELETE FROM node_jobs WHERE queue = ?', [QUEUE]);
  });

  it('translate:cities-hindi updates city_hi for every row of each distinct city', async () => {
    const io = bufferIO();
    assert.equal(await translateCitiesHindi(io, { sleepMs: 0, where: "city LIKE 'Phaseseven%'" }), 0);
    const nagar = await transliterateEnglishToHindi('Phaseseven Nagar');
    const pur = await transliterateEnglishToHindi('Phaseseven Pur');
    const rows = await all('SELECT id, city_hi FROM pincodes WHERE id BETWEEN 700 AND 799 ORDER BY id');
    assert.deepEqual(rows.map((r) => [r.id, r.city_hi]), [[700, nagar], [701, nagar], [702, pur]]);
    assert.deepEqual(io.lines, [
      `info: Phaseseven Nagar => ${nagar}`,
      `info: Phaseseven Pur => ${pur}`,
      'info: Completed. Total translated cities: 2',
    ]);
  });
});
