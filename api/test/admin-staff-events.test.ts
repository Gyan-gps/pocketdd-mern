// staff & events admin admin screens (Staff / Events) against the running API + fixtures (scripts/seed/staff-events.ts, ids 940–959).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { env } from '../src/config/env.js';
import { all, exec, first, pool } from '../src/db/pool.js';
import { ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD } from '../scripts/seed/07-admin-auth.js';

const BASE = process.env.NODE_URL ?? 'http://localhost:4000';
let token = '';
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8ffff3f0005fe02fea73581840000000049454e44ae426082',
  'hex',
);

async function api(method: string, p: string, body?: Record<string, unknown> | FormData) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${BASE}/api/admin${p}`, {
    method,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* text */
  }
  return { status: res.status, json };
}
const form = (o: Record<string, string>, file?: [string, string]) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  if (file) f.append(file[0], new Blob([PNG], { type: 'image/png' }), file[1]);
  return f;
};

async function cleanup() {
  await exec("DELETE FROM users WHERE phone IN ('9400000955','9400000956')");
  await exec("DELETE FROM business_users WHERE phone IN ('9400000955','9400000956')");
  await exec("DELETE FROM events WHERE name LIKE 'Zz P9c New%'");
  await exec("DELETE FROM node_jobs WHERE job = 'SendEventNotification' AND args LIKE '%Zz P9c New%'");
  await exec('DELETE FROM business_users_location WHERE business_user_id = 941');
  await exec('DELETE FROM event_locations WHERE event_id = 941');
  await exec('DELETE FROM event_details WHERE event_id = 941');
}

before(async () => {
  await cleanup();
  const r = await fetch(`${BASE}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: ADMIN_TEST_EMAIL, password: ADMIN_TEST_PASSWORD }),
  });
  token = ((await r.json()) as { token: string }).token;
});
after(async () => {
  await cleanup();
  await pool.end();
});

describe('business-user (Staff Management)', () => {
  it('lists name asc, searches text columns, filters + sorting', async () => {
    const r = await api('GET', '/business-user?search=Zz%20Parity');
    assert.deepEqual(r.json.data.map((d: any) => d.id), [940, 941]);
    assert.deepEqual((await api('GET', '/business-user?search=staff-a@p9c')).json.data.map((d: any) => d.id), [940]);
    assert.deepEqual((await api('GET', '/business-user?search=Zz%20Parity&status=0')).json.data.map((d: any) => d.id), [941]);
    assert.deepEqual((await api('GET', '/business-user?search=Zz%20Parity&sorting=z_a')).json.data.map((d: any) => d.id), [941, 940]);
    assert.ok(r.json.filters.state.some((o: any) => o.value === 'Ninefour State'));
  });
  it('create validation: custom messages + unique', async () => {
    const r = await api('POST', '/business-user', { name: '', phone: '9400000941', aadhar_no: '940094009400', status: '0' });
    assert.equal(r.status, 422);
    assert.deepEqual(r.json.errors, {
      name: ['Name is required'],
      phone: ['Phone number must be unique'],
      tahsil: ['Tahsil is required'],
      pincode_id: ['Pincode is required'],
      district: ['District is required'],
      state: ['State is required'],
      designation: ['Designation is required'],
      aadhar_no: ['Aadhar Number must be unique'],
    });
  });
  it('update validation: digits has no custom message (raw key)', async () => {
    const r = await api('PUT', '/business-user/940', { id: '940', name: 'X', phone: '12ab', status: '0' });
    assert.equal(r.json.errors.phone[0], 'validation.digits');
  });
  it('creates staff + login user, upload stored under uploads/user_images', async () => {
    const r = await api(
      'POST',
      '/business-user',
      form(
        { name: 'Zz P9c', phone: '9400000955', email: '', designation: 'staff', state: 'Ninefour State', district: 'Ninefour City', pincode_id: '940', tahsil: 'Ninefour Tehsil', status: '1' },
        ['profile_img', 'My Photo.png'],
      ),
    );
    assert.equal(r.status, 201);
    const bu = (await first('SELECT * FROM business_users WHERE id = ?', [r.json.id]))!;
    assert.match(String(bu.profile_img), /^uploads\/user_images\/my-photo-[A-Za-z0-9]{4}\.png$/);
    assert.ok(fs.existsSync(path.posix.join(env.publicPath, String(bu.profile_img))));
    assert.equal(bu.pincode, null); // pincode merged into the request but not a Backpack field
    assert.equal(bu.lft, r.json.id + 1);
    assert.equal(bu.depth, 1);
    const u = (await first('SELECT * FROM users WHERE id = ?', [bu.user_id]))!;
    assert.equal(u.pincode, '940');
    assert.equal(u.password, bu.password);
    assert.equal(u.user_icon, bu.profile_img); // uploader strips its path on retrieval → no double prefix
    fs.unlinkSync(path.posix.join(env.publicPath, String(bu.profile_img)));
  });
  it('update: users row only gets $fillable columns (phone/status ignored)', async () => {
    const r = await api('POST', '/business-user', { name: 'Zz P9c B', phone: '9400000956', designation: 'staff', state: 'S', district: 'D', pincode_id: '940', tahsil: 'T', status: '1' });
    const id = r.json.id;
    const up = await api('PUT', `/business-user/${id}`, { id: String(id), name: 'Zz P9c C', phone: '9400000956', designation: 'manager', state: 'S', district: 'D', tahsil: 'T', status: '0', address_line_1: 'L1' });
    assert.equal(up.status, 200);
    const bu = (await first('SELECT * FROM business_users WHERE id = ?', [id]))!;
    const u = (await first('SELECT * FROM users WHERE id = ?', [bu.user_id]))!;
    assert.equal(bu.status, 0);
    assert.equal(u.status, 1);
    assert.equal(u.name, 'Zz P9c C');
    assert.equal(u.address_line, 'L1');
    assert.equal(u.user_icon, 'uploads/user_images/');
  });
  it('update of a staff row without user → 500 after saving the row', async () => {
    const r = await api('PUT', '/business-user/941', { id: '941', name: 'Zz Parity Staff B', phone: '9400000941', designation: 'manager', state: 'Ninefour State', district: 'Ninefour Town', tahsil: 'T', status: '0' });
    assert.equal(r.status, 500);
    assert.equal((await first('SELECT tahsil FROM business_users WHERE id = 941'))!.tahsil, 'T');
    await exec('UPDATE business_users SET tahsil = NULL WHERE id = 941');
  });
  it('fetch/pincode custom route is broken in Laravel (500)', async () => {
    const r = await api('GET', '/admin/business-user/fetch/pincode');
    assert.equal(r.status, 500);
    assert.equal(r.json.exception, 'BadMethodCallException');
  });
  it('has no delete', async () => assert.equal((await api('DELETE', '/business-user/941')).status, 404));
});

describe('event', () => {
  it('lists name asc; date search via orWhereDate; date_range filter', async () => {
    assert.deepEqual((await api('GET', '/event?search=Zz%20Parity')).json.data.map((d: any) => d.id), [940, 941]);
    assert.deepEqual((await api('GET', '/event?search=2025-07-01')).json.data.map((d: any) => d.id), [940]);
    const dr = encodeURIComponent(JSON.stringify({ from: '2025-07-02', to: '2025-07-02 23:59:59' }));
    assert.deepEqual((await api('GET', `/event?date=${dr}&search=Zz`)).json.data.map((d: any) => d.id), [941]);
  });
  it('create validation messages', async () => {
    const r = await api('POST', '/event', { status: '0' });
    assert.deepEqual(Object.keys(r.json.errors), ['name', 'date', 'short_description', 'event_description_hi', 'image', 'state', 'district', 'pincode_id']);
    assert.equal(r.json.errors.pincode_id[0], 'City pincode  is not selected.');
    assert.equal(r.json.errors.event_description_hi[0], 'घटना विवरण आवश्यक है');
  });
  it('update requires tahsil', async () => {
    const r = await api('PUT', '/event/940', { status: '0' });
    assert.equal(r.json.errors.tahsil[0], 'Tahsil is not selected.');
  });
  it('creates with upload and enqueues SendEventNotification with the PHP args', async () => {
    const r = await api(
      'POST',
      '/event',
      form(
        { name: 'Zz P9c New', date: '2025-08-01', event_time: '11:45', state: 'Ninefour State', district: 'Ninefour City', pincode_id: '940', tahsil: 'Ninefour Tehsil', charge: '', short_description: 'D', event_description_hi: 'वि', status: '1' },
        ['image', 'Ev.png'],
      ),
    );
    assert.equal(r.status, 201);
    const ev = (await first('SELECT * FROM events WHERE id = ?', [r.json.id]))!;
    assert.match(String(ev.image), /^uploads\/event_images\/ev-[A-Za-z0-9]{4}\.png$/);
    assert.equal(ev.charge, null);
    assert.equal(ev.tahsil, 'Ninefour Tehsil');
    const jobs = await all("SELECT args FROM node_jobs WHERE job = 'SendEventNotification' AND args LIKE '%Zz P9c New%'");
    // the API's worker may already have run it (fixture users have no fcm_token)
    if (jobs.length) assert.deepEqual(JSON.parse(String(jobs[0]!.args)), [r.json.id, 'Ninefour State', 'Ninefour City', 'Zz P9c New', 'D']);
    // update with a new image deletes the old file; *_hidden fields are dropped
    const old = path.posix.join(env.publicPath, String(ev.image));
    const up = await api(
      'PUT',
      `/event/${r.json.id}`,
      form({ name: 'Zz P9c New', date: '2025-08-01', state: 'S', district: 'D', tahsil: 'T', short_description: 'D', event_description_hi: 'वि', status: '1', state_hidden: 'x' }, ['image', 'Two.png']),
    );
    assert.equal(up.status, 200);
    assert.ok(!fs.existsSync(old));
    const ev2 = (await first('SELECT * FROM events WHERE id = ?', [r.json.id]))!;
    assert.match(String(ev2.image), /^uploads\/event_images\/two-/);
    fs.unlinkSync(path.posix.join(env.publicPath, String(ev2.image)));
  });
  it('show data: name_hi (name), d-m-Y, pin_code; missing pincode flagged', async () => {
    const r = await api('GET', '/event/940');
    assert.equal(r.json.show_date, '01-07-2025');
    assert.equal(r.json.pincode_pin_code, '940001');
    assert.equal((await api('GET', '/event/941')).json.show_error, 'Attempt to read property "pin_code" on null');
  });
});

describe('relation screens', () => {
  it('business-user-location: no search, id desc, create redirects to staff', async () => {
    const l = await api('GET', '/business-user-location?search=zzzz');
    assert.equal(l.json.data[0].id, Math.max(...l.json.data.map((d: any) => d.id)));
    const r = await api('POST', '/business-user-location', { business_user_id: '941', location_id: '940' });
    assert.equal(r.json.redirect, 'business-user');
    const row = (await first('SELECT * FROM business_users_location WHERE id = ?', [r.json.id]))!;
    assert.equal(row.language, 'en');
    assert.equal((await api('GET', `/business-user-location/${r.json.id}`)).json.location_label, 'Ninefour Zone');
  });
  it('event-location / event-detail create', async () => {
    assert.equal((await api('POST', '/event-location', { event_id: '941', location_id: '940' })).status, 201);
    const d = await api('POST', '/event-detail', { event_id: '941', event_details: '<p>x</p>' });
    assert.equal((await first('SELECT event_details FROM event_details WHERE id = ?', [d.json.id]))!.event_details, '<p>x</p>');
    const opts = await api('GET', '/event-detail/form-options');
    assert.ok(!opts.json.event_id.some((o: any) => o.value === '941')); // only status = 1 events
  });
});
