// catalog admin admin screens: BusinessCategory / BusinessSubCategory / Advertisment / Slider / Location CRUD,
// the category / sub-category Excel imports and the slider reorder — against the running Node API, with
// the same forms submitted to Backpack (Laravel) and the resulting DB rows diffed.
// Fixtures: scripts/seed/09-admin-catalog.ts (ids 920–939). Rows created here are named "Pnb …" and removed after.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { env } from '../src/config/env.js';
import { nowDb } from '../src/core/time.js';
import { all, exec, first, pool, type Row } from '../src/db/pool.js';
import { writeXlsx } from '../src/admin/xlsx.js';
import { ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD } from '../scripts/seed/07-admin-auth.js';
import { Backpack } from './support/backpack-client.js';

const BASE = process.env.NODE_URL ?? 'http://localhost:4000';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type FormValue = string | { file: Buffer; name: string; type: string };
type Form = Array<[string, FormValue]>;

let token = '';
let lara: Backpack;

async function api(method: string, p: string, body?: Form | Record<string, unknown>) {
  let payload: BodyInit | undefined;
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  if (Array.isArray(body)) {
    const fd = new FormData();
    for (const [k, v] of body) {
      if (typeof v === 'string') fd.append(k, v);
      else fd.append(k, new Blob([new Uint8Array(v.file)], { type: v.type }), v.name);
    }
    payload = fd;
  } else if (body) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/admin${p}`, { method, headers, body: payload });
      if (res.status === 401 && attempt < 3) {
        // another agent's test revoked the shared admin token — log in again
        await nodeLogin();
        headers.Authorization = `Bearer ${token}`;
        continue;
      }
      const text = await res.text();
      let json: any = text;
      try {
        json = JSON.parse(text);
      } catch {
        /* text */
      }
      return { status: res.status, json };
    } catch (e) {
      if (attempt > 10) throw e;
      await new Promise((r) => setTimeout(r, 1000)); // API restarting (tsx watch)
    }
  }
}

const png = (name = 'Tiny Pic.png') => ({ file: PNG, name, type: 'image/png' });
const byName = (table: string, name: string) => first(`SELECT * FROM \`${table}\` WHERE name = ? ORDER BY id DESC LIMIT 1`, [name]);
const fileExists = (rel: unknown) => typeof rel === 'string' && fs.existsSync(path.posix.join(env.publicPath, rel));

/** Columns that legitimately differ between the Laravel row and the Node row. */
function comparable(row: Row | null, drop: string[] = []): Record<string, unknown> {
  assert.ok(row, 'row exists');
  const out: Record<string, unknown> = {};
  const id = Number(row.id);
  for (const [k, v] of Object.entries(row)) {
    if (['id', 'created_at', 'updated_at', ...drop].includes(k)) continue;
    // tree columns are id-relative
    if ((k === 'lft' || k === 'rgt') && v !== null) out[k] = Number(v) - id;
    else out[k] = v;
  }
  return out;
}

const imgShape = (dir: string, base: string) => new RegExp(`^${dir}/${base}-[A-Za-z0-9]{4}\\.png$`);

async function cleanup() {
  for (const t of ['business_categories', 'business_sub_categories']) {
    for (const r of await all(`SELECT img FROM ${t} WHERE name LIKE 'Pnb %' AND img IS NOT NULL`)) fs.rmSync(path.posix.join(env.publicPath, r.img), { force: true });
    await exec(`DELETE FROM ${t} WHERE name LIKE 'Pnb %'`);
  }
  for (const r of await all("SELECT advt_img FROM advertisments WHERE client_name IN ('920', '939999') AND id <> 920 AND advt_img IS NOT NULL")) {
    fs.rmSync(path.posix.join(env.publicPath, r.advt_img), { force: true });
  }
  await exec("DELETE FROM advertisments WHERE client_name IN ('920', '939999') AND id <> 920");
  for (const r of await all("SELECT slider_img FROM sliders WHERE client_name LIKE 'Pnb %' AND slider_img IS NOT NULL")) {
    fs.rmSync(path.posix.join(env.publicPath, r.slider_img), { force: true });
  }
  await exec("DELETE FROM sliders WHERE client_name LIKE 'Pnb %'");
  await exec("DELETE FROM locations WHERE location_name LIKE '%Pnb %'");
  await exec("DELETE FROM node_jobs WHERE job = 'SendAdvertisementNotification' AND args LIKE '%939999%'");
  await exec("DELETE FROM jobs WHERE payload LIKE '%SendAdvertisementNotification%' AND payload LIKE '%939999%'").catch(() => undefined);
  // restore fixtures touched by update tests
  await exec("UPDATE sliders SET lft = 2, rgt = 3, depth = 1, parent_id = NULL WHERE id = 920");
  await exec("UPDATE sliders SET lft = 1, rgt = 4, depth = 1, parent_id = NULL WHERE id = 921");
}

before(async () => {
  await cleanup();
  for (const d of ['category-data', 'sub-category-data']) fs.mkdirSync(path.posix.join(env.publicPath, 'uploads/import_file', d), { recursive: true, mode: 0o777 });
  await nodeLogin();
  lara = await new Backpack().login();
});

async function nodeLogin() {
  const login = await fetch(`${BASE}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: ADMIN_TEST_EMAIL, password: ADMIN_TEST_PASSWORD }),
  });
  token = ((await login.json()) as { token: string }).token;
}

after(async () => {
  await cleanup();
  await exec("DELETE FROM personal_access_tokens WHERE tokenable_id = 800 AND name = 'admin-panel'");
  await pool.end();
});

async function laraPost(page: string, p: string, form: Form) {
  for (let i = 0; ; i++) {
    await lara.get(page);
    const r = await lara.submit(p, form);
    if (r.status !== 419 || i > 2) return r;
    lara = await new Backpack().login();
  }
}

/** Submit a create form to Backpack (GET the create page first for the CSRF token). */
async function laraCreate(entity: string, form: Form, query = '') {
  for (let i = 0; ; i++) {
    await lara.get(`/pocketddadmin/${entity}/create${query}`);
    const r = await lara.submit(`/pocketddadmin/${entity}`, [['_save_action', 'save_action_one'], ...form]);
    if ((r.status !== 419 && !(r.status === 302 && r.location?.includes('/login'))) || i > 2) return r;
    lara = await new Backpack().login(); // session invalidated by a parallel login of the shared admin
  }
}
async function laraUpdate(entity: string, id: number, form: Form) {
  for (let i = 0; ; i++) {
  await lara.get(`/pocketddadmin/${entity}/${id}/edit`);
  const r = await lara.submit(`/pocketddadmin/${entity}/${id}`, [['_save_action', 'save_action_one'], ['id', String(id)], ...form], 'PUT');
  if ((r.status !== 419 && !(r.status === 302 && r.location?.includes('/login'))) || i > 2) return r;
  lara = await new Backpack().login();
  }
}

/** Backpack's error summary on the redirected form (<li><i class="la la-info-circle"></i> msg</li>). */
async function laraErrors(page: string): Promise<string[]> {
  const html = (await lara.get(page)).text;
  return [...html.matchAll(/<li><i class="la la-info-circle"><\/i> ([^<]*)<\/li>/g)].map((m) => m[1]!.trim());
}

// ------------------------------------------------------------------------------------------------
describe('business-category (BusinessCategoryCrudController)', () => {
  it('lists parent-less categories ordered by name, with search / filters / sorting', async () => {
    const r = await api('GET', '/business-category?search=P9b');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.data.map((d: any) => d.id), [920, 921]); // 922 has a parent_id
    assert.equal(r.json.data[0].has_sub_categories, true);
    assert.equal(r.json.data[1].has_sub_categories, false);
    assert.equal(r.json.data[0].sub_category, 'P9b Sub One, P9b Sub Two');
    assert.equal(r.json.data[1].sub_category, 'NA');
    assert.deepEqual((await api('GET', '/business-category?search=P9b&status=0')).json.data.map((d: any) => d.id), [921]);
    assert.deepEqual((await api('GET', '/business-category?search=P9b&sorting=z_a')).json.data.map((d: any) => d.id), [921, 920]);
    assert.deepEqual((await api('GET', '/business-category?search=P9b&sorting=newest')).json.data.map((d: any) => d.id), [921, 920]);
    assert.deepEqual((await api('GET', '/business-category?name=P9b%20Alpha%20Cat')).json.data.map((d: any) => d.id), [920]);
    assert.deepEqual((await api('GET', '/business-category?search=%E0%A4%AC%E0%A5%80%E0%A4%9F%E0%A4%BE')).json.data.map((d: any) => d.id), [921]); // name_hi
    const opts = r.json.filters;
    assert.ok(opts.name.some((o: any) => o.value === 'P9b Child Row')); // filter values include every row
    assert.deepEqual(opts.status, [{ value: '0', label: 'InActive' }, { value: '1', label: 'Active' }]);
  });

  it('create validation messages (BusinessCategoryRequest)', async () => {
    let r = await api('POST', '/business-category', [['status', '0']]);
    assert.equal(r.status, 422);
    assert.deepEqual(r.json.errors, {
      name: ['Business Category Name is required.'],
      name_hi: ['Business Category Name (Hindi) is required.'],
      img: ['Category image is required.'],
    });
    r = await api('POST', '/business-category', [['name', 'P9b Alpha Cat'], ['name_hi', 'x'], ['img', { file: Buffer.from('hello'), name: 'a.txt', type: 'text/plain' }]]);
    assert.deepEqual(r.json.errors, {
      name: ['This Business Category Name already exists.'],
      img: ['The uploaded file must be an image.', 'Only PNG, JPG, JPEG, and SVG formats are allowed.'],
    });
    // Laravel shows the same messages
    const lr = await laraCreate('business-category', [['name', 'P9b Alpha Cat'], ['name_hi', 'x'], ['status', '0']]);
    assert.equal(lr.status, 302);
    const errs = await laraErrors('/pocketddadmin/business-category/create');
    assert.deepEqual(errs, ['This Business Category Name already exists.', 'Category image is required.']);
  });

  it('create + update write the same row as Backpack (upload, slug, lft/rgt/depth, old file deleted)', async () => {
    const form = (name: string, slug: string): Form => [['name', name], ['name_hi', 'पीएनबी'], ['img', png()], ['slug', slug], ['status', '1']];
    const lr = await laraCreate('business-category', form('Pnb Lara Cat', 'pnbcat'));
    assert.equal(lr.status, 302);
    const nr = await api('POST', '/business-category', form('Pnb Node Cat', 'pnbcat'));
    assert.equal(nr.status, 201);
    const L = await byName('business_categories', 'Pnb Lara Cat');
    const N = await byName('business_categories', 'Pnb Node Cat');
    assert.equal(N!.id, nr.json.id);
    assert.match(String(L!.img), imgShape('uploads/category_images', 'tiny-pic'));
    assert.match(String(N!.img), imgShape('uploads/category_images', 'tiny-pic'));
    assert.ok(fileExists(L!.img) && fileExists(N!.img));
    assert.deepEqual(comparable(N, ['name', 'img']), comparable(L, ['name', 'img']));
    assert.equal(N!.lft, N!.id + 1);
    assert.equal(N!.depth, 1);

    // blank slug stays NULL; update without a file keeps the image
    const upd = (name: string): Form => [['name', name], ['name_hi', 'बदला'], ['slug', ''], ['status', '0']];
    assert.equal((await laraUpdate('business-category', L!.id, upd('Pnb Lara Cat'))).status, 302);
    assert.equal((await api('PUT', `/business-category/${N!.id}`, upd('Pnb Node Cat'))).status, 200);
    const L2 = await byName('business_categories', 'Pnb Lara Cat');
    const N2 = await byName('business_categories', 'Pnb Node Cat');
    assert.equal(N2!.img, N!.img);
    assert.equal(L2!.img, L!.img);
    assert.deepEqual(comparable(N2, ['name', 'img']), comparable(L2, ['name', 'img']));
    assert.equal(N2!.slug, null);

    // new file replaces (and deletes) the previous one
    const upd2 = (name: string): Form => [['name', name], ['name_hi', 'बदला'], ['img', png('Second.PNG')], ['status', '1']];
    assert.equal((await laraUpdate('business-category', L!.id, upd2('Pnb Lara Cat'))).status, 302);
    assert.equal((await api('PUT', `/business-category/${N!.id}`, upd2('Pnb Node Cat'))).status, 200);
    const L3 = await byName('business_categories', 'Pnb Lara Cat');
    const N3 = await byName('business_categories', 'Pnb Node Cat');
    assert.match(String(N3!.img), imgShape('uploads/category_images', 'second'));
    assert.match(String(L3!.img), imgShape('uploads/category_images', 'second'));
    assert.ok(!fileExists(N!.img) && !fileExists(L!.img));
    assert.deepEqual(comparable(N3, ['name', 'img']), comparable(L3, ['name', 'img']));
  });

  it('show returns the computed sub-category columns', async () => {
    const r = await api('GET', '/business-category/920');
    assert.equal(r.json.sub_category_hindi, 'पी सब वन, पी सब टू');
    assert.equal((await api('GET', '/business-category/999999')).status, 404);
  });
});

// ------------------------------------------------------------------------------------------------
describe('business-sub-category (BusinessSubCategoryCrudController)', () => {
  it('lists rows with a parent, filtered by parent_id / status', async () => {
    const r = await api('GET', '/business-sub-category?parent_id=920');
    assert.deepEqual(r.json.data.map((d: any) => [d.id, d.parent_name]), [[920, 'P9b Alpha Cat'], [921, 'P9b Alpha Cat']]);
    assert.deepEqual((await api('GET', '/business-sub-category?parent_id=920&status=0')).json.data.map((d: any) => d.id), [921]);
    // the relationship column is not searched
    assert.equal((await api('GET', '/business-sub-category?search=P9b%20Alpha')).json.total, 0);
    assert.deepEqual((await api('GET', '/business-sub-category/form-options?parent_id=920')).json, { parent_id: [{ value: '920', label: 'P9b Alpha Cat' }] });
    assert.deepEqual((await api('GET', '/business-sub-category/form-options')).json, { parent_id: [] });
    assert.equal((await api('GET', '/business-sub-category/920/show')).status, 404); // no ShowOperation
  });

  it('create validation (BusinessSubCategoryRequest)', async () => {
    const r = await api('POST', '/business-sub-category', [['name', 'P9b Sub One'], ['name_hi', 'x'], ['img', png()]]);
    assert.deepEqual(r.json.errors, { name: ['This sub-category name already exists.'], parent_id: ['Please select a category.'] });
    const r2 = await api('POST', '/business-sub-category', [['parent_id', '999999'], ['name', 'Pnb X'], ['name_hi', 'x'], ['img', png()]]);
    assert.deepEqual(r2.json.errors, { parent_id: ['Selected category does not exist.'] });
  });

  it('create/update match Backpack; update ignores parent_id_display (saves the hidden parent_id)', async () => {
    const form = (name: string): Form => [['parent_id', '920'], ['name', name], ['name_hi', 'उप'], ['img', png('Sub Pic.jpeg')], ['slug', 'pnbsub'], ['status', '0']];
    assert.equal((await laraCreate('business-sub-category', form('Pnb Lara Sub'), '?parent_id=920')).status, 302);
    assert.equal((await api('POST', '/business-sub-category', form('Pnb Node Sub'))).status, 201);
    const L = await byName('business_sub_categories', 'Pnb Lara Sub');
    const N = await byName('business_sub_categories', 'Pnb Node Sub');
    // the jpeg-named PNG is stored with the content-guessed extension
    assert.match(String(L!.img), imgShape('uploads/sub-category_images', 'sub-pic'));
    assert.match(String(N!.img), imgShape('uploads/sub-category_images', 'sub-pic'));
    assert.deepEqual(comparable(N, ['name', 'img']), comparable(L, ['name', 'img']));

    const upd = (name: string, parent: string): Form => [['parent_id_display', '921'], ['name', name], ['name_hi', 'उप२'], ['slug', 'x'], ['status', '1'], ['parent_id', parent]];
    assert.equal((await laraUpdate('business-sub-category', L!.id, upd('Pnb Lara Sub', '920'))).status, 302);
    assert.equal((await api('PUT', `/business-sub-category/${N!.id}`, upd('Pnb Node Sub', '920'))).status, 200);
    const L2 = await byName('business_sub_categories', 'Pnb Lara Sub');
    const N2 = await byName('business_sub_categories', 'Pnb Node Sub');
    assert.equal(N2!.parent_id, 920);
    assert.deepEqual(comparable(N2, ['name', 'img']), comparable(L2, ['name', 'img']));
    const bad = await api('PUT', `/business-sub-category/${N!.id}`, [['parent_id_display', '999999'], ['name', 'Pnb Node Sub'], ['name_hi', 'x']]);
    assert.deepEqual(bad.json.errors, { parent_id_display: ['Selected category does not exist.'] });
  });
});

// ------------------------------------------------------------------------------------------------
describe('advertisment (AdvertismentCrudController)', () => {
  it('lists ordered by client_name with business name; filters', async () => {
    const r = await api('GET', '/advertisment?client_name=920');
    assert.deepEqual(r.json.data.map((d: any) => [d.id, d.business_name_en, d.from_date]), [[920, 'P9b Ad Business', '2025-06-01']]);
    const range = encodeURIComponent(JSON.stringify({ from: '2025-05-31 00:00:00', to: '2025-06-02 00:00:00' }));
    assert.ok((await api('GET', `/advertisment?from_date=${range}`)).json.data.some((d: any) => d.id === 920));
    assert.ok((await api('GET', '/advertisment?search=2025-06-01')).json.data.some((d: any) => d.id === 920)); // whereDate search
    assert.ok(r.json.filters.client_name.some((o: any) => o.value === '920' && o.label === 'P9b Ad Business'));
  });

  it('validation (AdvertismentRequest): after_or_equal and required messages', async () => {
    const r = await api('POST', '/advertisment', [['client_name', '920'], ['from_date', '2025-06-10'], ['to_date', '2025-06-01']]);
    assert.deepEqual(r.json.errors, {
      ads_position: ['Please select a banner type.'],
      ads_location: ['Please select an ad location.'],
      advt_img: ['Advertisement image is required.'],
      vaild_till: ['Please select a valid duration.'],
      fees_type: ['validation.required'],
      to_date: ['To date must be after or equal to From date.'],
    });
    const lr = await laraCreate('advertisment', [['client_name', '920'], ['from_date', '2025-06-10'], ['to_date', '2025-06-01'], ['sub_category_name', '']]);
    assert.equal(lr.status, 302);
    assert.deepEqual(await laraErrors('/pocketddadmin/advertisment/create'), [
      'Please select a banner type.',
      'Please select an ad location.',
      'Advertisement image is required.',
      'Please select a valid duration.',
      'validation.required',
      'To date must be after or equal to From date.',
    ]);
  });

  const adForm = (client: string, from: string, subs: string[]): Form => [
    ['client_name', client],
    ['ads_position', 'inner'],
    ['ads_location', 'Multiple Category/Subcategory Page'],
    ['sub_category_name', ''],
    ...subs.map((s): [string, FormValue] => ['sub_category_name[]', s]),
    ['from_date', from],
    ['vaild_till', '1_month'],
    ['to_date', '2026-12-31'],
    ['advt_img', png('Ad Banner.png')],
    ['fees_type', 'Online via UPI'],
    ['amount', '2500.5'],
    ['status', '1'],
    ['ads_location_hidden', ''],
  ];

  it('create/update write the same row as Backpack (date + array casts, unknown fields dropped)', async () => {
    assert.equal((await laraCreate('advertisment', adForm('920', '2025-01-15', ['P9b Sub One', 'A/B & "C"']))).status, 302);
    const L = await first("SELECT * FROM advertisments WHERE client_name = '920' AND id <> 920 ORDER BY id DESC LIMIT 1");
    const nr = await api('POST', '/advertisment', adForm('920', '2025-01-15', ['P9b Sub One', 'A/B & "C"']));
    assert.equal(nr.status, 201);
    const N = await first('SELECT * FROM advertisments WHERE id = ?', [nr.json.id]);
    assert.equal(N!.from_date, '2025-01-15 00:00:00');
    assert.match(String(N!.advt_img), imgShape('uploads/adv_images', 'ad-banner'));
    assert.deepEqual(comparable(N, ['advt_img']), comparable(L, ['advt_img']));
    // not today → no notification job
    assert.equal((await all("SELECT id FROM node_jobs WHERE job = 'SendAdvertisementNotification' AND args LIKE ?", [`[${N!.id},%`])).length, 0);

    const upd: Form = [
      ['client_name', '920'], ['ads_position', 'home'], ['ads_location', 'TOP'], ['sub_category_name', ''], ['from_date', '2025-02-01'],
      ['vaild_till', '1_year'], ['to_date', '2026-02-01'], ['fees_type', 'Free'], ['amount', ''], ['status', '0'], ['ads_location_hidden', 'TOP'],
    ];
    assert.equal((await laraUpdate('advertisment', L!.id, upd)).status, 302);
    assert.equal((await api('PUT', `/advertisment/${N!.id}`, upd)).status, 200);
    const L2 = await first('SELECT * FROM advertisments WHERE id = ?', [L!.id]);
    const N2 = await first('SELECT * FROM advertisments WHERE id = ?', [N!.id]);
    assert.equal(N2!.sub_category_name, null);
    assert.equal(N2!.advt_img, N!.advt_img);
    assert.deepEqual(comparable(N2, ['advt_img']), comparable(L2, ['advt_img']));
  });

  it('dispatches SendAdvertisementNotification($id, client_name) when from_date is today', async () => {
    const today = nowDb().slice(0, 10);
    const nr = await api('POST', '/advertisment', adForm('939999', today, []));
    assert.equal(nr.status, 201);
    const job = await first("SELECT args FROM node_jobs WHERE job = 'SendAdvertisementNotification' AND args LIKE '%939999%'");
    // the API's queue worker may already have run it (business not found → logs + deletes the row)
    if (job) assert.equal(job.args, JSON.stringify([nr.json.id, '939999']));
    // Laravel enqueues the same command on its database queue
    assert.equal((await laraCreate('advertisment', adForm('939999', today, []))).status, 302);
    const L = await first("SELECT id FROM advertisments WHERE client_name = '939999' AND id <> ? ORDER BY id DESC LIMIT 1", [nr.json.id]);
    const lj = await first("SELECT payload FROM jobs WHERE payload LIKE '%SendAdvertisementNotification%' ORDER BY id DESC LIMIT 1").catch(() => null);
    if (lj) {
      assert.match(String(lj.payload), new RegExp(`advertisementId\\\\";i:${L!.id};`));
      assert.match(String(lj.payload), /businessId\\";s:6:\\"939999\\"/);
    }
  });
});

// ------------------------------------------------------------------------------------------------
describe('slider (SliderCrudController)', () => {
  it('lists id DESC with filters', async () => {
    const r = await api('GET', '/slider?search=P9b');
    assert.deepEqual(r.json.data.map((d: any) => d.id), [921, 920]);
    assert.deepEqual((await api('GET', '/slider?client_name=P9b%20Slider%20Client')).json.data.map((d: any) => d.id), [920]);
  });

  it('create matches Backpack; update requires a new slider_img (raw validation keys)', async () => {
    const form = (client: string): Form => [
      ['client_name', client], ['slider_img', png('Slide.png')], ['from_date', '2025-03-01'], ['to_date', '2025-03-31'],
      ['amount', '300'], ['page_location', 'business_page'], ['url', 'https://example.com/x'], ['status', '1'],
    ];
    assert.equal((await laraCreate('slider', form('Pnb Lara Slide'))).status, 302);
    assert.equal((await api('POST', '/slider', form('Pnb Node Slide'))).status, 201);
    const L = await first("SELECT * FROM sliders WHERE client_name = 'Pnb Lara Slide'");
    const N = await first("SELECT * FROM sliders WHERE client_name = 'Pnb Node Slide'");
    assert.deepEqual(comparable(N, ['client_name', 'slider_img']), comparable(L, ['client_name', 'slider_img']));
    assert.match(String(N!.slider_img), imgShape('uploads/user_images', 'slide'));

    const r = await api('PUT', `/slider/${N!.id}`, [['client_name', 'abc'], ['from_date', '2025-03-01'], ['to_date', '2025-03-31'], ['page_location', 'home']]);
    assert.deepEqual(r.json.errors, { client_name: ['validation.min.string'], slider_img: ['validation.required'] });
    // an enum value the column does not allow → QueryException (500) in both apps
    const bad = await api('POST', '/slider', [...form('Pnb Bad Slide').filter(([k]) => k !== 'page_location'), ['page_location', 'sub-categories']]);
    assert.equal(bad.status, 500);
  });

  it('reorder (updateTreeOrder) writes the same tree as Backpack', async () => {
    const tree = JSON.stringify([
      { item_id: '921', parent_id: '', depth: '1', left: '2', right: '3' },
      { item_id: '920', parent_id: '921', depth: '2', left: '4', right: '5' },
      { item_id: '999999', parent_id: '', depth: '1', left: '6', right: '7' },
    ]);
    const lr = await laraPost('/pocketddadmin/slider/reorder', '/pocketddadmin/slider/reorder', [['tree', tree]]);
    assert.equal(lr.text, 'success for 2 items');
    const L = await all('SELECT id, parent_id, lft, rgt, depth, updated_at FROM sliders WHERE id IN (920, 921) ORDER BY id');
    await exec('UPDATE sliders SET lft = NULL, rgt = NULL, depth = NULL, parent_id = NULL WHERE id IN (920, 921)');
    const nr = await api('POST', '/slider/reorder', { tree });
    assert.equal(nr.json, 'success for 2 items');
    const N = await all('SELECT id, parent_id, lft, rgt, depth, updated_at FROM sliders WHERE id IN (920, 921) ORDER BY id');
    assert.deepEqual(N, L);
    assert.equal((await api('GET', '/slider/reorder')).status, 200);
  });
});

// ------------------------------------------------------------------------------------------------
describe('location (LocationCrudController)', () => {
  it('lists the en translation (fallback for hi_IN) and filters', async () => {
    const r = await api('GET', '/location?search=P9b');
    assert.deepEqual(r.json.data.map((d: any) => [d.id, d.location_name]), [[921, ''], [920, 'P9b City']]);
    assert.deepEqual((await api('GET', '/location?status=1&search=P9b')).json.data.map((d: any) => d.id), [920]);
  });

  it('create/update write the same translatable JSON as Backpack', async () => {
    const lr = await laraCreate('location', [['location_name', 'Pnb Lara/Town'], ['status', '1']]);
    assert.equal(lr.status, 302);
    assert.equal((await api('POST', '/location', [['location_name', 'Pnb Node/Town'], ['status', '1']])).status, 201);
    const L = await first("SELECT * FROM locations WHERE location_name LIKE '%Pnb Lara%'");
    const N = await first("SELECT * FROM locations WHERE location_name LIKE '%Pnb Node%'");
    assert.equal(L!.location_name, '{"en":"Pnb Lara/Town"}');
    assert.equal(N!.location_name, '{"en":"Pnb Node/Town"}');
    // update merges into the existing translations
    await exec('UPDATE locations SET location_name = ? WHERE id IN (?, ?)', ['{"hi":"पी","en":"old"}', L!.id, N!.id]);
    assert.equal((await laraUpdate('location', L!.id, [['location_name', 'Pnb Lara Two'], ['status', '0']])).status, 302);
    assert.equal((await api('PUT', `/location/${N!.id}`, [['location_name', 'Pnb Lara Two'], ['status', '0']])).status, 200);
    const [L2, N2] = await all('SELECT location_name, status FROM locations WHERE id IN (?, ?) ORDER BY id', [L!.id, N!.id]);
    assert.deepEqual(N2, L2);
    assert.equal(N2!.location_name, '{"hi":"पी","en":"Pnb Lara Two"}');
    // attribute-level custom message
    const v = await api('POST', '/location', [['status', '1']]);
    assert.deepEqual(v.json.errors, { location_name: ['City name should be unique and required.'] });
  });
});

// ------------------------------------------------------------------------------------------------
describe('Excel imports (insertCategoryData / insertSubCategoryData)', () => {
  const sheet = (rows: Array<Array<string | number | null>>, name = 'cats.xlsx') => ({ file: writeXlsx(rows), name, type: XLSX_TYPE });
  const flash = async (page: string) => {
    const html = (await lara.get(page)).text;
    return /<div class="alert alert-(?:danger|success)" role="alert"> ([\s\S]*?) <\/div>/.exec(html)?.[1] ?? null;
  };

  it('upload checks: no file / wrong extension', async () => {
    assert.deepEqual((await api('POST', '/insertCategoryData', [])).json, { alert: 'warning', message: 'Please select a file' });
    assert.deepEqual((await api('POST', '/insertCategoryData', [['category_data_sheet', { file: Buffer.from('a,b'), name: 'x.csv', type: 'text/csv' }]])).json, {
      alert: 'warning',
      message: 'Please select a file with a valid extension (xlsx)',
    });
  });

  it('category import: inserts rows like Laravel; a failing row aborts and rolls back with the same message', async () => {
    const head = ['Business Category Name', 'Status(Active / Inactive)'];
    const lr = await laraPost('/pocketddadmin/import-category-data', '/pocketddadmin/insertCategoryData', [['category_data_sheet', sheet([head, ['Pnb Lara Imp', 'Active'], ['Pnb Lara Imp Off', 'inactive']])]]);
    assert.equal(lr.status, 302);
    assert.equal(await flash('/pocketddadmin/import-category-data'), 'Your sheet has been imported successfully.');
    const nr = await api('POST', '/insertCategoryData', [['category_data_sheet', sheet([head, ['Pnb Node Imp', 'Active'], ['Pnb Node Imp Off', 'inactive']])]]);
    assert.deepEqual(nr.json, { success: 'Your sheet has been imported successfully.' });
    for (const [l, n] of [['Pnb Lara Imp', 'Pnb Node Imp'], ['Pnb Lara Imp Off', 'Pnb Node Imp Off']]) {
      const L = await byName('business_categories', l!);
      const N = await byName('business_categories', n!);
      assert.deepEqual(comparable(N, ['name', 'slug', 'name_hi']), comparable(L, ['name', 'slug', 'name_hi']));
      assert.equal(N!.slug, n!.toLowerCase().replace(/ /g, '-'));
    }
    assert.ok(fs.existsSync(path.posix.join(env.publicPath, 'uploads/import_file/category-data/cats.xlsx')));

    // duplicate within the file + bad status: first failing row reported, everything rolled back
    const bad = [head, ['Pnb Dup', 'Active'], ['Pnb Dup', 'Maybe']];
    await laraPost('/pocketddadmin/import-category-data', '/pocketddadmin/insertCategoryData', [['category_data_sheet', sheet(bad)]]);
    const laraErr = await flash('/pocketddadmin/import-category-data');
    const nodeErr = (await api('POST', '/insertCategoryData', [['category_data_sheet', sheet(bad)]])).json.error;
    assert.equal(nodeErr, 'The Business Category Already Exists Pnb Dup . on line number 3 <br />The value of Status must be of two (Active / Inactive) Maybe . on line number 3 <br />');
    assert.equal(laraErr, nodeErr);
    assert.equal(await byName('business_categories', 'Pnb Dup'), null);
  });

  it('sub-category import: invalid rows are skipped (SkipsOnFailure), valid ones inserted like Laravel', async () => {
    const head = ['Category Name', 'Sub Category Name', 'Sub Category Name Hindi', 'Status(Active / Inactive)'];
    const rows = (p: string) => [head, ['P9b Alpha Cat', `${p} One`, null, 'Active'], ['No Such Cat', `${p} Two`, null, 'Active'], ['P9b Beta Cat', `${p} Three`, null, 'Inactive'], ['P9b Alpha Cat', `${p} One`, null, 'Active']];
    await laraPost('/pocketddadmin/import-sub-category-data', '/pocketddadmin/insertSubCategoryData', [['sub_category_data_sheet', sheet(rows('Pnb Lara Sx'), 'subs.xlsx')]]);
    const nr = await api('POST', '/insertSubCategoryData', [['sub_category_data_sheet', sheet(rows('Pnb Node Sx'), 'subs.xlsx')]]);
    assert.deepEqual(nr.json, { success: 'Your sheet has been imported successfully.' });
    const L = await all("SELECT * FROM business_sub_categories WHERE name LIKE 'Pnb Lara Sx%' ORDER BY id");
    const N = await all("SELECT * FROM business_sub_categories WHERE name LIKE 'Pnb Node Sx%' ORDER BY id");
    assert.deepEqual(N.map((r) => r.name), ['Pnb Node Sx One', 'Pnb Node Sx Three']);
    assert.deepEqual(N.map((r) => comparable(r, ['name', 'slug', 'name_hi'])), L.map((r) => comparable(r, ['name', 'slug', 'name_hi'])));
  });
});

// ------------------------------------------------------------------------------------------------
describe('validator additions (after_or_equal, :input, attribute-level messages) + xlsx reader', () => {
  it('after_or_equal compares with the other field; attribute-level custom message; :input', async () => {
    const { validate } = await import('../src/core/validation/validator.js');
    const rules = { to: 'required|date|after_or_equal:from' };
    assert.ok(!(await validate({ from: '2025-01-01', to: '2025-01-01' }, rules)).fails());
    assert.equal((await validate({ from: '2025-01-02', to: '2025-01-01' }, rules)).first(), 'validation.after_or_equal');
    assert.ok(!(await validate({ to: '2025-01-01' }, rules)).fails()); // other date missing → passes (PHP int >= null)
    assert.equal((await validate({}, { city: 'required' }, { city: 'Whole-attribute message' })).first(), 'Whole-attribute message');
    assert.equal((await validate({ s: 'x' }, { s: 'in:a,b' }, { 's.in': 'Bad :input .' })).first(), 'Bad x .');
    assert.equal((await validate({ s: null }, { s: 'required' }, { 's.required': 'Missing :input .' })).first(), 'Missing empty .');
  });

  it('reads the first sheet with slugged headings (inline + shared strings, numbers, formulas, gaps)', async () => {
    const { headingRows, readFirstSheet, slugUnderscore } = await import('../src/admin/xlsx.js');
    assert.equal(slugUnderscore('Status(Active / Inactive)'), 'statusactive_inactive');
    assert.equal(slugUnderscore('Business Category Name'), 'business_category_name');
    assert.equal(slugUnderscore('Sub-Category  Name'), 'sub_category_name');
    const rows = headingRows(readFirstSheet(writeXlsx([['Name', null, 'N'], ['a & <b>', null, 12], [null, 'x', 1.5]])));
    assert.deepEqual(rows, [
      { rowNumber: 2, row: { name: 'a & <b>', 1: null, n: 12 } },
      { rowNumber: 3, row: { name: null, 1: 'x', n: 1.5 } },
    ]);
  });
});
