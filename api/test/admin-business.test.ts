// business admin: Admin\Business*CrudController screens (business, business-detail, business-image, business-location,
// business-owner, business-request-managment) against an in-process API (queue isolated: jobs are only enqueued
// in `node_jobs` under 'admin-business-test' — no worker runs, fixture users have no fcm_token).
//   docker compose exec -T api npx tsx --test test/admin-business.test.ts
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';

process.env.NODE_QUEUE = 'admin-business-test';
const { app } = await import('../src/app.js');
const { all, exec, first, pool } = await import('../src/db/pool.js');
const { hashCheck } = await import('../src/core/auth/hash.js');
const { nowDb } = await import('../src/core/time.js');
const { ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD } = await import('../scripts/seed/07-admin-auth.js');
const F = await import('./support/admin-business-fixtures.js');
const { businessForm, PNG } = await import('./support/admin-business-forms.js');

let server: Server;
let base = '';
let token = '';
const TODAY = nowDb().slice(0, 10);

type Body = Record<string, unknown> | Array<[string, string | { file: Buffer; name: string; type: string }]>;
async function api(method: string, path: string, body?: Body) {
  let payload: BodyInit | undefined;
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  if (Array.isArray(body)) {
    // multipart like the panel's saveEntry() with files (empty file inputs are dropped by multer, as by PHP).
    const fd = new FormData();
    for (const [k, v] of body) {
      if (typeof v === 'string') fd.append(k, v);
      else if (v.name) fd.append(k, new Blob([new Uint8Array(v.file)], { type: v.type }), v.name);
    }
    payload = fd;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res = await fetch(`${base}/api/admin${path}`, { method, headers, body: payload });
  if (res.status === 401 && !path.startsWith("/auth")) {
    // parallel suites revoke the shared test admin tokens: log in again and retry once
    token = (await (await fetch(`${base}/api/admin/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ADMIN_TEST_EMAIL, password: ADMIN_TEST_PASSWORD }) })).json()).token;
    headers.Authorization = `Bearer ${token}`;
    res = await fetch(`${base}/api/admin${path}`, { method, headers, body: payload });
  }
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* text */
  }
  return { status: res.status, json };
}
const jobs = () => all("SELECT job, args FROM node_jobs WHERE queue = 'admin-business-test' ORDER BY id");

before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const r = await api('POST', '/auth/login', { email: ADMIN_TEST_EMAIL, password: ADMIN_TEST_PASSWORD });
  token = r.json.token;
  await F.resetFixtures();
});
after(async () => {
  await F.resetFixtures();
  await exec("DELETE FROM personal_access_tokens WHERE tokenable_id = 800 AND name = 'admin-panel'");
  server.close();
  await pool.end();
});

describe('business-owner (List + Show)', () => {
  it('orders by name asc, searches name/phone and the related business name', async () => {
    const r = await api('GET', '/business-owner?search=Parity');
    assert.equal(r.status, 200);
    const mine = r.json.data.filter((o: any) => o.id >= 900 && o.id <= 919);
    assert.deepEqual(mine.map((o: any) => o.name), ['Parity Aardvark', 'Parity Owner']);
    const byBiz = await api('GET', '/business-owner?search=Alpha%20Store');
    assert.deepEqual(byBiz.json.data.map((o: any) => [o.id, o.business_name_en]), [[900, 'Parity Alpha Store']]);
    assert.equal((await api('GET', '/business-owner?search=9000000909')).json.data[0].id, 901);
  });
  it('has no create/update routes', async () => {
    assert.equal((await api('POST', '/business-owner', { name: 'x' })).status, 404);
    assert.equal((await api('PUT', '/business-owner/900', { name: 'x' })).status, 404);
    assert.equal((await api('GET', '/business-owner/900')).json.phone, '9000000900');
  });
});

describe('business-image', () => {
  beforeEach(F.resetFixtures);
  it('lists id desc; the search box filters nothing (select2 + image columns)', async () => {
    const all1 = await api('GET', '/business-image');
    const s = await api('GET', '/business-image?search=zzz-nothing');
    assert.equal(s.json.total, all1.json.total);
    const ids = all1.json.data.map((d: any) => d.id);
    assert.deepEqual(ids, [...ids].sort((a: number, b: number) => b - a));
  });
  it('create validation: required (raw key) then the custom mimetypes message', async () => {
    let r = await api('POST', '/business-image', [['business_id', '901']]);
    assert.equal(r.status, 422);
    assert.equal(r.json.message, 'validation.required');
    r = await api('POST', '/business-image', [['business_id', '901'], ['img', { file: Buffer.from('hello'), name: 'a.txt', type: 'text/plain' }]]);
    assert.equal(r.json.message, 'Please upload the image in PNG, JPEG, or JPG format.');
  });
  it('create stores uploads/user_images/<slug>-<rand4>.<ext>; update requires a new file and deletes the old one', async () => {
    const r = await api('POST', '/business-image', [['business_id', '901'], ['img', { file: PNG, name: 'Shop Front.PNG', type: 'image/png' }]]);
    assert.equal(r.status, 201);
    const created = await F.row('business_iamges', 'id = ?', [r.json.id]);
    assert.match(created!.img, /^uploads\/user_images\/shop-front-[A-Za-z0-9]{4}\.png$/);
    assert.ok(F.publicExists(created!.img));
    const noFile = await api('PUT', `/business-image/${r.json.id}`, { business_id: '901' });
    assert.equal(noFile.json.message, 'validation.required');
    const up = await api('PUT', `/business-image/${r.json.id}`, [['business_id', '902'], ['img', { file: PNG, name: 'b.png', type: 'image/png' }]]);
    assert.equal(up.status, 200);
    const updated = await F.row('business_iamges', 'id = ?', [r.json.id]);
    assert.equal(updated!.business_id, 902);
    assert.match(updated!.img, /^uploads\/user_images\/b-[A-Za-z0-9]{4}\.png$/);
    assert.ok(!F.publicExists(created!.img));
    F.removePublic(updated!.img);
  });
  it('form options: create = all businesses id desc; update = businesses without any image row', async () => {
    const c = await api('GET', '/business-image/form-options');
    const ids = c.json.business_id.map((o: any) => Number(o.value));
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
    assert.ok(ids.includes(900));
    const u = await api('GET', '/business-image/form-options?id=900');
    assert.ok(!u.json.business_id.some((o: any) => o.value === '900'));
  });
});

describe('business-location', () => {
  beforeEach(F.resetFixtures);
  it('filters by business_id and serializes relation names', async () => {
    const r = await api('GET', '/business-location?business_id=900');
    assert.deepEqual(r.json.data.map((d: any) => [d.id, d.location_name]), [[900, 'Parity Location']]);
    assert.ok(Array.isArray(r.json.filters.business_id));
  });
  it('store redirects to business-detail/create, update to business', async () => {
    const c = await api('POST', '/business-location', { business_id: '901', location_id: '900', other: 'x' });
    assert.equal(c.status, 201);
    assert.equal(c.json.redirect, 'business-detail/create');
    const u = await api('PUT', `/business-location/${c.json.id}`, { business_id: '902', location_id: '900' });
    assert.equal(u.json.redirect, 'business');
    assert.equal((await F.row('business_locations', 'id = ?', [c.json.id]))!.business_id, 902);
  });
});

describe('business-detail', () => {
  beforeEach(F.resetFixtures);
  const form = (over: Record<string, string> = {}) => ({
    business_id: '901', pincode_id: '900', state: 'Paritystate', district: 'Paritycity', business_mobile_number: '9000000944',
    business_email: 'beta@parity.test', other_partner_name: '', address_line: 'L1', street_address: '', post: '', tahsil: '',
    description: '<p>Hi “there” / é</p>', summaries: '[{"description":"<p>S1 / x</p>"}]', ...over,
  });
  it('validation messages (raw keys)', async () => {
    assert.equal((await api('POST', '/business-detail', form({ business_email: 'nope' }))).json.message, 'validation.email');
    assert.equal((await api('POST', '/business-detail', form({ business_mobile_number: '123' }))).json.message, 'validation.digits');
    assert.equal((await api('POST', '/business-detail', form({ business_id: '' }))).json.message, 'validation.required');
  });
  it('stores translatable description/summaries as {"en": …} and merges on update', async () => {
    const c = await api('POST', '/business-detail', form());
    assert.equal(c.json.redirect, 'business');
    const r = await F.row('business_details', 'id = ?', [c.json.id]);
    assert.equal(r!.description, '{"en":"<p>Hi “there” / é</p>"}');
    assert.equal(r!.summaries, '{"en":"[{\\"description\\":\\"<p>S1 / x</p>\\"}]"}');
    assert.equal(r!.pincode, null);
    assert.equal(r!.pincode_id, 900);
    await exec('UPDATE business_details SET description = ? WHERE id = ?', ['{"en":"old","hi":"पुराना"}', c.json.id]);
    const u = await api('PUT', `/business-detail/${c.json.id}`, form({ description: '<p>Hi2</p>', summaries: '[]', business_mobile_number: '9000000945' }));
    assert.equal(u.json.redirect, 'business');
    const r2 = await F.row('business_details', 'id = ?', [c.json.id]);
    assert.equal(r2!.description, '{"en":"<p>Hi2</p>","hi":"पुराना"}');
    assert.equal(r2!.summaries, '{"en":"[]"}');
  });
  it('list search/filters, including the broken category filter (500 like Laravel)', async () => {
    const r = await api('GET', '/business-detail?search=alpha@parity');
    assert.deepEqual(r.json.data.map((d: any) => d.id), [900]);
    assert.equal((await api('GET', '/business-detail?business_category__id=900')).status, 500);
  });
  it('fetch/pincode (FetchOperation simplePaginate) via POST and the custom GET route', async () => {
    const p = await api('POST', '/business-detail/fetch/pincode', { q: '99900' });
    assert.deepEqual(p.json.data.map((d: any) => d.id), [900, 901]);
    assert.equal(p.json.data[0].created_at, '2025-06-19T05:00:00.000000Z');
    assert.deepEqual(Object.keys(p.json), ['current_page', 'current_page_url', 'data', 'first_page_url', 'from', 'next_page_url', 'path', 'per_page', 'prev_page_url', 'to']);
    assert.equal(p.json.next_page_url, null);
    const g = await api('GET', '/admin/business-detail/fetch/pincode?q=999002');
    assert.deepEqual(g.json.data.map((d: any) => d.id), [901]);
  });
});

describe('business-request-managment (List + Show)', () => {
  beforeEach(F.resetFixtures);
  it('orders id desc, searches business_name, widget counts pending requests', async () => {
    const r = await api('GET', '/business-request-managment?search=Parity%20G');
    assert.deepEqual(r.json.data.map((d: any) => d.id), [900]);
    const w = await api('GET', '/business-request-managment/widget');
    const pending = Number((await first('SELECT COUNT(*) c FROM businesse_requests WHERE is_business_approved = 0'))!.c);
    assert.equal(w.json.value, pending);
    assert.equal(w.json.hint, `${100 - pending} more until next milestone.`);
  });
  it('show resolves category/sub-category names ("-" when missing); no edit route', async () => {
    const s = await api('GET', '/business-request-managment/901');
    assert.equal(s.json.business_category_name, 'Parity Cat');
    assert.equal(s.json.business_sub_category_name, '-');
    assert.equal((await api('PUT', '/business-request-managment/900', {})).status, 404);
  });
});

describe('business list', () => {
  beforeEach(F.resetFixtures);
  it('only approved businesses, ordered by business_name_en asc, smart search', async () => {
    const r = await api('GET', '/business?search=Parity%20');
    const mine = r.json.data.filter((b: any) => b.id >= 900 && b.id <= 919).map((b: any) => b.id);
    assert.deepEqual(mine, [900, 901]); // 902 is not approved; Alpha < Beta
    assert.deepEqual((await api('GET', '/business?search=9000000902')).json.data.map((b: any) => b.id), [900]); // business_contact_2
    assert.deepEqual((await api('GET', '/business?search=PS0125AA901')).json.data.map((b: any) => b.id), [901]);
  });
  it('filters + sorting dropdown', async () => {
    const z = await api('GET', '/business?state=Paritystate&sorting=z_a');
    assert.deepEqual(z.json.data.map((b: any) => b.id), [901, 900]);
    const st = await api('GET', '/business?state=Paritystate&status=0');
    assert.deepEqual(st.json.data.map((b: any) => b.id), [901]);
    const ow = await api('GET', '/business?owner_name_en=Parity%20Owner&district=Paritycity&business_category_id=900&sorting=oldest');
    assert.deepEqual(ow.json.data.map((b: any) => b.id), [901, 900]);
  });
  it('serializes mediator/category names for the list and show views', async () => {
    const r = await api('GET', '/business/900');
    assert.equal(r.json.mediator_name, 'Parity Mediator');
    assert.equal(r.json.business_category_name, 'Parity Cat');
    assert.equal(r.json.pin_code, '999001');
    assert.equal((await api('GET', '/business/901')).json.mediator_found, false);
  });
});

describe('business create (BusinessRequest + store())', () => {
  beforeEach(F.resetFixtures);
  it('validation messages, in rule order', async () => {
    let r = await api('POST', '/business', businessForm({ business_category_id: '' }));
    assert.equal(r.json.message, 'Business Category is required.');
    r = await api('POST', '/business', businessForm({ pan: 'abc' }));
    assert.equal(r.json.message, 'validation.regex');
    r = await api('POST', '/business', businessForm({ aadhaar: '234567890123' })); // 12 digits: regex wants 13
    assert.equal(r.json.message, 'validation.regex');
    r = await api('POST', '/business', businessForm({ aadhaar: '2345678901234' }));
    assert.equal(r.json.message, 'validation.size.string');
    r = await api('POST', '/business', businessForm({ business_fess: '' }));
    assert.equal(r.json.message, 'validation.required_if');
    r = await api('POST', '/business', businessForm({ address_line_1_en: '' }));
    assert.equal(r.json.message, 'Address line must be filled.');
    r = await api('POST', '/business', businessForm({ owner_email: 'parity-x@pocketdd.test' }));
    assert.equal(r.status, 201); // ok
    r = await api('POST', '/business', businessForm({ owner_email: 'parity-x@pocketdd.test', business_name_en: 'Parity Delta Two' }));
    assert.equal(r.json.message, 'This Owner Email is already taken.');
  });
  it('writes the business, receipt, slug, tree columns, owner user + business_owners; notifies when from_date is today', async () => {
    const r = await api('POST', '/business', businessForm({ from_date: TODAY, logo: { file: PNG, name: 'Logo.png', type: 'image/png' } }));
    assert.equal(r.status, 201);
    assert.equal(r.json.redirect, 'business');
    const id = r.json.id;
    const b = (await F.row('businesses', 'id = ?', [id]))!;
    const series = (() => {
      let g = Math.trunc((id - 1) / 999);
      let l = '';
      while (g >= 0) {
        l = String.fromCharCode((g % 26) + 65) + l;
        g = Math.trunc(g / 26) - 1;
      }
      return l.padStart(2, 'A') + String(((id - 1) % 999) + 1).padStart(3, '0');
    })();
    assert.equal(b.receipt_number, `PS01${TODAY.slice(2, 4)}${series}`);
    assert.equal(b.slug, `parity-delta-shop-${id}`);
    assert.deepEqual([b.lft, b.rgt, b.depth, b.is_business_approved, b.status], [id + 1, id + 1, 1, 1, 1]);
    assert.equal(b.business_category_id, 900);
    assert.equal(b.mediator, '900');
    assert.equal(b.social_media_url, '[{"platform":"website","url":"https:\\/\\/parity.test\\/a"}]');
    assert.equal(b.pincode_hi, '999001');
    assert.equal(b.from_date, TODAY);
    assert.match(b.logo, /^uploads\/business_logo\/logo-[A-Za-z0-9]{4}\.png$/);
    assert.equal(b.image_1, null);
    const u = (await F.row('users', 'id = ?', [b.user_id]))!;
    assert.deepEqual([u.name, u.phone, u.status, u.is_business_owner, u.address_line, u.email], ['Parity Newowner', '9000000955', 1, 1, 'Parity Lane 9', null]);
    assert.ok(await hashCheck('', u.password));
    const o = (await F.row('business_owners', 'business_id = ?', [id]))!;
    assert.deepEqual([o.name, o.phone, o.user_id], ['Parity Newowner', '9000000955', b.user_id]);
    assert.deepEqual(await jobs(), [
      {
        job: 'SendBusinessCreatedNotification',
        args: JSON.stringify([id, { state_en: 'Paritystate', dist_en: 'Paritycity', business_name_en: 'Parity Delta Shop', name: null }]),
      },
    ]);
    F.removePublic(b.logo);
  });
  it('year-only from_date gets today\'s -m-d; Advertisement redirects to advertisment/create; no job when not today', async () => {
    const r = await api('POST', '/business', businessForm({ from_date: '2024', business_payment_mode: 'Advertisement', business_fess: '', fees_type: '' }));
    assert.equal(r.json.redirect, `advertisment/create?client_name=${r.json.id}`);
    assert.equal((await F.row('businesses', 'id = ?', [r.json.id]))!.from_date, `2024${TODAY.slice(4)}`);
    assert.deepEqual(await jobs(), []);
  });
  it('unknown state/district → 400 after the row is created (abort(400))', async () => {
    const r = await api('POST', '/business', businessForm({ dist_en: 'Nowhere' }));
    assert.equal(r.status, 400);
    const b = await F.row('businesses', "business_name_en = 'Parity Delta Shop'");
    assert.equal(b!.receipt_number, null);
  });
});

describe('business update (BusinessUpdateRequest + update())', () => {
  beforeEach(F.resetFixtures);
  it('approves a pending business: requests updated, approve + created jobs, owner row, slug/status, files cleared', async () => {
    await exec("UPDATE businesses SET logo = 'uploads/business_logo/p9a-902.png', image_1 = 'uploads/business_images/p9a-902.png' WHERE id = 902");
    F.putPublicFile('uploads/business_logo/p9a-902.png');
    F.putPublicFile('uploads/business_images/p9a-902.png');
    const r = await api('PUT', '/business/902', [
      ['id', '902'],
      ...businessForm({ business_name_en: 'Parity Gamma Pending', from_date: TODAY, image_2: { file: PNG, name: 'My Photo.PNG', type: 'image/png' } }, true),
    ]);
    assert.equal(r.status, 200);
    assert.equal(r.json.redirect, 'business');
    const b = (await F.row('businesses', 'id = 902'))!;
    assert.equal(b.is_business_approved, 1);
    assert.equal(b.status, 1);
    assert.equal(b.slug, 'parity-gamma-pending-902');
    assert.equal(b.logo, null); // Laravel quirk: empty file inputs clear the previous files
    assert.equal(b.image_1, null);
    assert.ok(!F.publicExists('uploads/business_logo/p9a-902.png'));
    assert.match(b.image_2, /^uploads\/business_images\/my-photo-[A-Za-z0-9]{4}\.png$/);
    assert.equal(b.receipt_number, null);
    assert.equal(b.lft, null);
    assert.equal((await F.row('businesse_requests', 'id = 900'))!.is_business_approved, 1);
    const o = (await F.row('business_owners', 'business_id = 902'))!;
    assert.deepEqual([o.name, o.phone, o.user_id], ['Parity Newowner', '9000000955', 900]);
    assert.deepEqual(await jobs(), [
      { job: 'SendBusinessApproveNotification', args: '[902]' },
      {
        job: 'SendBusinessCreatedNotification',
        args: JSON.stringify([902, { state_en: 'Paritystate', dist_en: 'Paritycity', business_name_en: 'Parity Gamma Pending' }, 900]),
      },
    ]);
    F.removePublic(b.image_2);
  });
  it('already approved, from_date not today: no jobs, existing owner updated, update-request messages', async () => {
    const bad = await api('PUT', '/business/900', { ...Object.fromEntries(businessForm({}, true) as any), owner_number_1: '' });
    assert.equal(bad.json.message, 'Owner Number 1 must be unique and required.');
    const dup = await api('PUT', '/business/901', { ...Object.fromEntries(businessForm({}, true) as any), fees_type: '' });
    assert.equal(dup.json.message, 'Fees Type is required');
    const form = Object.fromEntries(businessForm({ business_name_en: 'Parity Alpha Store', status: '0' }, true).filter(([, v]) => typeof v === 'string'));
    const r = await api('PUT', '/business/900', form);
    assert.equal(r.status, 200);
    const b = (await F.row('businesses', 'id = 900'))!;
    assert.equal(b.status, 0);
    assert.equal(b.logo, null); // JSON body: no file inputs → treated like the browser's empty ones
    assert.equal(b.receipt_number, 'PS0125AA900');
    const o = (await F.row('business_owners', 'id = 900'))!;
    assert.deepEqual([o.name, o.phone], ['Parity Newowner', '9000000955']);
    assert.deepEqual(await jobs(), []);
  });
});
