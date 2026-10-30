// PHP-vs-Node comparison for the business admin write paths: the same browser form is submitted to Backpack
// (http://laravel.test/pocketddadmin/...) and to the Node admin API (in-process, isolated queue); the resulting
// DB rows (+ queued jobs) are normalised (ids, timestamps, random file-name parts) and diffed.
//   docker compose exec -T api npx tsx test/admin-business.ts
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

process.env.NODE_QUEUE = 'admin-business-test';
const { app } = await import('../../src/app.js');
const { all, exec, pool } = await import('../../src/db/mysql.js');
const { closeMongo } = await import('../../scripts/lib/raw-collections.js');
const { hashCheck } = await import('../../src/core/auth/hash.js');
const { nowDb } = await import('../../src/core/time.js');
const { ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD } = await import('../../scripts/seed/07-admin-auth.js');
const F = await import('../support/admin-business-fixtures.js');
const { businessForm, PNG, EMPTY_FILE } = await import('../support/admin-business-forms.js');
const { Backpack } = await import('../support/backpack-client.js');
type FormValue = import('../support/admin-business-forms.js').FormValue;

const TODAY = nowDb().slice(0, 10);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
// Logged in per request: parallel test suites revoke the shared test admin's 'admin-panel' tokens.
const freshToken = async () =>
  (
    await (
      await fetch(`${base}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_TEST_EMAIL, password: ADMIN_TEST_PASSWORD }),
      })
    ).json()
  ).token as string;
const bp = await new Backpack().login();

async function node(method: 'POST' | 'PUT', path: string, fields: Array<[string, FormValue]>) {
  const fd = new FormData();
  for (const [k, v] of fields) {
    if (typeof v === 'string') fd.append(k, v);
    else if (v.name) fd.append(k, new Blob([new Uint8Array(v.file)], { type: v.type }), v.name); // empty inputs: dropped (as multer does)
  }
  const res = await fetch(`${base}/api/admin${path}`, { method, body: fd, headers: { Authorization: `Bearer ${await freshToken()}`, Accept: 'application/json' } });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { console.error('NODE', res.status, text.slice(0, 500)); }
  return { status: res.status, json };
}
async function laravel(method: 'POST' | 'PUT', path: string, fields: Array<[string, FormValue]>) {
  const page = method === 'POST' ? `${path}/create` : `${path}/edit`;
  await bp.get(`/pocketddadmin/${page.replace(/^\//, '')}`);
  const r = await bp.submit(`/pocketddadmin${path}`, fields, method === 'PUT' ? 'PUT' : undefined);
  return { status: r.status, location: r.location };
}

const TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
/** Normalise volatile values. `ids` maps concrete ids to labels. */
function norm(rows: Array<Record<string, unknown>>, ids: Record<string, string>) {
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => {
        if (typeof v === 'string' && TS.test(v)) return [k, v.startsWith('2025-06-1') ? v : 'NOW'];
        if (k === 'password') return [k, 'HASH'];
        if (typeof v === 'string') {
          let s = v.replace(/-[A-Za-z0-9]{4}\.(png|jpg)$/, '-XXXX.$1').replace(/-\d{5,}$/, '-NEW');
          for (const [id, label] of Object.entries(ids)) s = s.replace(new RegExp(`(?<=[-A-Z])${id}$`), label);
          return [k, s];
        }
        if (typeof v === 'number' && v >= 10000 && ['id', 'user_id', 'business_id', 'lft', 'rgt'].includes(k)) return [k, 'NEW'];
        return [k, v];
      }),
    ),
  );
}

async function laravelJobs() {
  const rows = await all("SELECT payload FROM jobs WHERE payload LIKE '%Business%Notification%' ORDER BY id");
  return rows.map((j) => JSON.parse(String(j.payload)).data.command as string);
}
/** PHP-serialized job command → [job, args] in our JSON form (only the shapes these jobs use). */
function phpCommand(cmd: string) {
  const job = /App\\Jobs\\(\w+)/.exec(cmd)![1]!;
  const ints = [...cmd.matchAll(/s:\d+:"(?:\x00\*\x00)?(businessId|excludeUserId)";i:(\d+);/g)].map((m) => [m[1], Number(m[2])] as const);
  const data = /s:16:"notificationData";a:\d+:\{(.*?)\}/.exec(cmd);
  const args: unknown[] = [ints.find(([k]) => k === 'businessId')![1]];
  if (data) {
    const obj: Record<string, unknown> = {};
    for (const m of data[1]!.matchAll(/s:\d+:"(\w+)";(?:s:\d+:"([^"]*)"|N);/g)) obj[m[1]!] = m[2] ?? null;
    args.push(obj);
  }
  const ex = ints.find(([k]) => k === 'excludeUserId');
  if (ex) args.push(ex[1]);
  return { job, args };
}

const normJobs = (j: unknown) => JSON.parse(JSON.stringify(j, (_k, v) => (typeof v === 'number' && v >= 10000 ? 'NEW' : v)));
const results: Array<[string, boolean, string?]> = [];
async function compare(name: string, run: (side: 'php' | 'node') => Promise<unknown>, snap: () => Promise<Record<string, unknown>>) {
  await F.resetFixtures();
  await exec("DELETE FROM jobs WHERE payload LIKE '%Business%Notification%'");
  F.readFrom('mysql');
  const phpResp = await run('php');
  const php = { resp: phpResp, ...(await snap()), jobs: normJobs((await laravelJobs()).map(phpCommand)) };
  await F.resetFixtures();
  await exec("DELETE FROM jobs WHERE payload LIKE '%Business%Notification%'");
  F.readFrom('mongo');
  const nodeResp = await run('node');
  const nodeJobs = await F.nodeJobs();
  const nd = { resp: nodeResp, ...(await snap()), jobs: normJobs(nodeJobs) };
  try {
    assert.deepEqual(nd, php);
    results.push([name, true]);
  } catch (e) {
    results.push([name, false, (e as Error).message.slice(0, 3000)]);
  }
  await F.resetFixtures();
}

// ---------------------------------------------------------------- scenarios
const created = async () => {
  const b = await F.rows('businesses', { business_name_en: { prefix: 'Parity Delta' } });
  const ids: Record<string, string> = {};
  if (b[0]) {
    ids[String(b[0].id)] = 'BID';
    ids[String(Number(b[0].id) + 1)] = 'BID+1';
    ids[String(b[0].user_id)] = 'UID';
  }
  const users = b[0] ? await F.rows('users', { id: b[0].user_id }) : [];
  const pwOk = users[0] ? await hashCheck('', String(users[0].password)) : null;
  for (const r of b) for (const f of ['logo', 'image_1', 'image_2', 'image_3', 'image_4']) F.removePublic(r[f]);
  const out = {
    businesses: norm(b, ids),
    users: norm(users, ids),
    owners: norm(await F.rows('business_owners', { business_id: b[0]?.id ?? 0 }), ids),
    passwordIsHashOfEmpty: pwOk,
  };
  // receipt series depends on the id: compare its id-independent prefix
  for (const r of out.businesses) r.receipt_number = typeof r.receipt_number === 'string' ? r.receipt_number.slice(0, 6) : r.receipt_number;
  return out;
};

await compare(
  'business store (today, Fees, logo upload)',
  async (side) => {
    const form = businessForm({ from_date: TODAY, logo: { file: PNG, name: 'Logo File.png', type: 'image/png' } });
    if (side === 'php') return (await laravel('POST', '/business', form)).location?.replace(/^https?:\/\/[^/]+\/pocketddadmin\//, '');
    return (await node('POST', '/business', form)).json.redirect;
  },
  created,
);
await compare(
  'business store (year-only from_date, Advertisement)',
  async (side) => {
    const form = businessForm({ from_date: '2024', business_payment_mode: 'Advertisement', business_fess: '', fees_type: '' });
    if (side === 'php') return (await laravel('POST', '/business', form)).location?.replace(/^https?:\/\/[^/]+\/pocketddadmin\//, '').replace(/=\d+$/, '=ID');
    return (await node('POST', '/business', form)).json.redirect.replace(/=\d+$/, '=ID');
  },
  created,
);
await compare(
  'business store validation (aadhaar quirk, required_if)',
  async (side) => {
    const form = businessForm({ aadhaar: '234567890123', business_fess: '' });
    if (side === 'php') {
      await laravel('POST', '/business', form);
      return bp.errorsOn('/pocketddadmin/business/create');
    }
    const r = await node('POST', '/business', form);
    return Object.values(r.json.errors).flat();
  },
  async () => ({ count: (await F.rows('businesses', { business_name_en: { prefix: 'Parity Delta' } })).length }),
);

const snapBiz = (id: number) => async () => {
  const ids = { [String(id)]: 'BID' };
  const b = await F.rows('businesses', { id });
  for (const f of ['logo', 'image_1', 'image_2', 'image_3', 'image_4']) if (b[0]?.[f]) F.removePublic(b[0][f]);
  return {
    business: norm(b, ids),
    requests: norm(await F.rows('businesse_requests', { business_id: id }), ids),
    owners: norm(await F.rows('business_owners', { business_id: id }), ids).map((o) => ({ ...o, id: Number(o.id) >= 900 && Number(o.id) <= 919 ? o.id : 'NEW' })),
    logoFileKept: F.publicExists('uploads/business_logo/p9a-cmp.png'),
  };
};
const prepFiles = async (id: number) => {
  await F.update('businesses', id, { logo: 'uploads/business_logo/p9a-cmp.png' });
  F.putPublicFile('uploads/business_logo/p9a-cmp.png');
};
await compare(
  'business update (approve pending 902, from_date today, new image_2, empty logo input)',
  async (side) => {
    await prepFiles(902);
    const form: Array<[string, FormValue]> = [
      ['id', '902'],
      ...businessForm({ business_name_en: 'Parity Gamma Pending', from_date: TODAY, image_2: { file: PNG, name: 'My Photo.PNG', type: 'image/png' } }, true),
    ];
    if (side === 'php') return (await laravel('PUT', '/business/902', form)).location?.replace(/^https?:\/\/[^/]+\/pocketddadmin\//, '');
    return (await node('PUT', '/business/902', form)).json.redirect;
  },
  snapBiz(902),
);
await compare(
  'business update (approved 900, status off, owner updated, Free)',
  async (side) => {
    await prepFiles(900);
    const form: Array<[string, FormValue]> = [
      ['id', '900'],
      ...businessForm({ business_name_en: 'Parity Alpha Store', status: '0', business_payment_mode: 'Free', pan: 'ABCDE1234F', gst: '' }, true),
    ];
    if (side === 'php') return (await laravel('PUT', '/business/900', form)).location?.replace(/^https?:\/\/[^/]+\/pocketddadmin\//, '');
    return (await node('PUT', '/business/900', form)).json.redirect;
  },
  snapBiz(900),
);

const detailForm = (over: Record<string, string> = {}): Array<[string, FormValue]> =>
  Object.entries({
    business_id: '901', pincode_id: '900', state: 'Paritystate', district: 'Paritycity', business_mobile_number: '9000000944',
    business_email: 'beta@parity.test', other_partner_name: '', address_line: 'L1', street_address: '', post: '', tahsil: '',
    description: '<p>Hi “there” / é</p>', summaries: '[{"description":"<p>S1 / x</p>"}]', ...over,
  });
const snapRows = (table: string, where: Record<string, unknown>) => async () => {
  const rows = await F.rows(table, where);
  const ids = Object.fromEntries(rows.filter((r) => Number(r.id) < 900 || Number(r.id) > 919).map((r) => [String(r.id), 'NEW']));
  for (const r of rows) if (r.img && !String(r.img).includes('p9a-')) F.removePublic(r.img);
  return { rows: norm(rows, ids), oldImageKept: F.publicExists('uploads/user_images/p9a-img.png') };
};
const lastId = async (table: string) => Math.max(0, ...(await F.rows(table)).map((r) => Number(r.id)));
const loc = (r: unknown) => (typeof r === 'string' ? r.replace(/^https?:\/\/[^/]+\/pocketddadmin\//, '') : r);

await compare(
  'business-detail store + update (translatable JSON)',
  async (side) => {
    const out: unknown[] = [];
    if (side === 'php') out.push(loc((await laravel('POST', '/business-detail', detailForm())).location));
    else out.push((await node('POST', '/business-detail', detailForm())).json.redirect);
    const id = await lastId('business_details');
    const upd = detailForm({ description: '<p>Hi2</p>', summaries: '[]', other_partner_name: 'P', business_mobile_number: '9000000945' });
    if (side === 'php') out.push(loc((await laravel('PUT', `/business-detail/${id}`, [['id', String(id)], ...upd])).location));
    else out.push((await node('PUT', `/business-detail/${id}`, [['id', String(id)], ...upd])).json.redirect);
    return out;
  },
  snapRows('business_details', { business_id: 901 }),
);
await compare(
  'business-detail validation',
  async (side) => {
    const form = detailForm({ business_mobile_number: '12', business_email: 'x' });
    if (side === 'php') {
      await laravel('POST', '/business-detail', form);
      return bp.errorsOn('/pocketddadmin/business-detail/create');
    }
    return Object.values((await node('POST', '/business-detail', form)).json.errors).flat();
  },
  snapRows('business_details', { business_id: 901 }),
);
await compare(
  'business-image store + update (upload, old file deleted) + update without file',
  async (side) => {
    F.putPublicFile('uploads/user_images/p9a-img.png');
    const out: unknown[] = [];
    const run = (m: 'POST' | 'PUT', p: string, f: Array<[string, FormValue]>) => (side === 'php' ? laravel(m, p, f) : node(m, p, f));
    const r1 = await run('POST', '/business-image', [['business_id', '901'], ['img', { file: PNG, name: 'Shop Front.png', type: 'image/png' }]]);
    out.push(r1.status === 302 || r1.status === 201 ? 'ok' : r1.status);
    const r2 = await run('PUT', '/business-image/900', [['id', '900'], ['business_id', '900'], ['img', EMPTY_FILE]]);
    out.push(side === 'php' ? (await bp.errorsOn('/pocketddadmin/business-image/900/edit')) : Object.values((r2 as any).json?.errors ?? { status: [(r2 as any).status] }).flat());
    const r3 = await run('PUT', '/business-image/900', [['id', '900'], ['business_id', '902'], ['img', { file: PNG, name: 'b.png', type: 'image/png' }]]);
    out.push(r3.status === 302 || r3.status === 200 ? 'ok' : r3.status);
    return out;
  },
  snapRows('business_iamges', { business_id: { $in: [900, 901, 902] } }),
);
await compare(
  'business-location store + update (redirects)',
  async (side) => {
    const out: unknown[] = [];
    if (side === 'php') out.push(loc((await laravel('POST', '/business-location', [['business_id', '901'], ['location_id', '900']])).location));
    else out.push((await node('POST', '/business-location', [['business_id', '901'], ['location_id', '900']])).json.redirect);
    const id = await lastId('business_locations');
    const f: Array<[string, FormValue]> = [['id', String(id)], ['business_id', '902'], ['location_id', '900']];
    if (side === 'php') out.push(loc((await laravel('PUT', `/business-location/${id}`, f)).location));
    else out.push((await node('PUT', `/business-location/${id}`, f)).json.redirect);
    return out;
  },
  snapRows('business_locations', { business_id: { $in: [900, 901, 902] } }),
);

for (const [name, ok, diff] of results) console.log(`${ok ? 'SAME' : 'DIFF'}  ${name}${diff ? `\n${diff}` : ''}`);
server.close();
await pool.end();
await closeMongo();
