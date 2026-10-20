// directory admin admin screens against the running server + fixtures (scripts/seed/directory.ts, ids 960–999).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { env } from '../src/config/env.js';
import { all, exec, first, pool } from '../src/db/pool.js';
import { krutidevToUnicode } from '../src/helpers/adminHindi.js';
import { phpJsonEncode } from '../src/helpers/phpJson.js';
import { writeXlsx } from '../src/admin/xlsx.js';
import { ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD } from '../scripts/seed/07-admin-auth.js';

const BASE = process.env.NODE_URL ?? 'http://localhost:4000';
let token = '';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function api(method: string, p: string, body?: unknown) {
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  let b: BodyInit | undefined;
  if (body instanceof FormData) b = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    b = JSON.stringify(body);
  }
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(`${BASE}/api/admin${p}`, { method, headers, body: b });
      const text = await res.text();
      let json: any = text;
      try {
        json = JSON.parse(text);
      } catch {
        /* text */
      }
      return { status: res.status, json };
    } catch (e) {
      if (i > 5) throw e;
      await new Promise((r) => setTimeout(r, 2000)); // API restarting (tsx watch)
    }
  }
}

const cleanup = async () => {
  await exec("DELETE FROM administrators WHERE state = 'P9D New'");
  await exec("DELETE FROM designations WHERE name LIKE '%P9D New%'");
  await exec("DELETE FROM city_helpline_numbers WHERE state = 'P9D New'");
  await exec("DELETE FROM addresses WHERE state = 'P9D New'");
  await exec("DELETE FROM about_uses WHERE state = 'P9D New'");
  await exec("DELETE FROM pincodes WHERE state IN ('P9D New', 'P9D Import') OR pin_code IN ('996100', '996101', '996102')");
};

before(async () => {
  await cleanup();
  const r = await api('POST', '/auth/login', { email: ADMIN_TEST_EMAIL, password: ADMIN_TEST_PASSWORD });
  token = r.json.token;
});
after(async () => {
  await cleanup();
  await exec("DELETE FROM personal_access_tokens WHERE tokenable_id = 800 AND name = 'admin-panel'");
  await pool.end();
});

describe('helpers', () => {
  it('phpJsonEncode = json_encode default flags', () => {
    assert.equal(phpJsonEncode([{ a: 'x/y', b: 'पु' }]), '[{"a":"x\\/y","b":"\\u092a\\u0941"}]');
  });
  it('krutidevToUnicode', () => {
    assert.equal(krutidevToUnicode('dey'), 'कमल');
  });
});

describe('designation', () => {
  it('lists id desc, shows the en translation (plain strings → empty), LIKE on raw JSON', async () => {
    const r = await api('GET', '/designation?search=P9D');
    assert.deepEqual(r.json.data.map((d: any) => [d.id, d.name]), [[961, ''], [960, 'P9D Officer']]);
  });
  it('validation: raw keys (no custom messages)', async () => {
    assert.equal((await api('POST', '/designation', {})).json.message, 'validation.required');
    assert.equal((await api('POST', '/designation', { name: 'abc' })).json.message, 'validation.min.string');
  });
  it('create stores {"en":…} and drops the non-column officer_mobile_number', async () => {
    const r = await api('POST', '/designation', { name: 'P9D New Desk', officer_mobile_number: '9876543210', status: '1' });
    assert.equal(r.status, 201);
    const row = await first('SELECT * FROM designations WHERE id = ?', [r.json.id]);
    assert.equal(row!.name, '{"en":"P9D New Desk"}');
    assert.equal(row!.status, 1);
  });
  it('update keeps other locales', async () => {
    await api('PUT', '/designation/960', { name: 'P9D Officer Two', status: '1' });
    assert.equal((await first('SELECT name FROM designations WHERE id = 960'))!.name, '{"en":"P9D Officer Two","hi":"अधिकारी"}');
    await exec('UPDATE designations SET name = ? WHERE id = 960', ['{"en":"P9D Officer","hi":"अधिकारी"}']);
  });
});

describe('administrator (Officers Contact)', () => {
  it('list: department / officer count / pincode columns, search on department name, filters', async () => {
    const r = await api('GET', '/administrator?search=P9D%20Dept');
    assert.deepEqual(r.json.data.map((d: any) => [d.id, d.department_name, d.officer_count, d.pincode]), [
      [962, 'P9D Dept', 2, '996004'],
      [960, 'P9D Dept', 2, '996001'],
    ]);
    const f = await api('GET', '/administrator?state=P9D%20State&status=0');
    assert.deepEqual(f.json.data.map((d: any) => [d.id, d.officer_count, d.pincode]), [[961, 0, '-']]);
    assert.ok(f.json.filters.status.length === 2);
  });
  it('validation messages, plain attributes before wildcard rows', async () => {
    const r = await api('POST', '/administrator', { officer_rank_name: [{ officer_rank: '' }] });
    assert.equal(r.status, 422);
    assert.deepEqual(Object.values(r.json.errors).flat(), [
      'Department is not selected! / विभाग चयनित नहीं किया गया है!',
      'Officer rank (English) is not entered! / अधिकारी रैंक (अंग्रेज़ी) दर्ज नहीं की गई है!',
      'Officer rank (Hindi) is not entered! / अधिकारी रैंक (हिंदी) दर्ज नहीं की गई है!',
      'Number of officers is not entered! / अधिकारियों की संख्या दर्ज नहीं की गई है!',
    ]);
  });
  it('create writes the repeatable with json_encode escaping (same bytes as Backpack)', async () => {
    const r = await api('POST', '/administrator', {
      state: 'P9D New', city: 'Lucknow', pincode_id: '960', department_id: '960', status: '1', bogus: 'x',
      officer_rank_name: JSON.stringify([{ officer_rank: 'Sp / Rank', officer_rank_hi: 'पुलिस', officer_number: '98765' }]),
    });
    assert.equal(r.status, 201);
    const row = await first('SELECT * FROM administrators WHERE id = ?', [r.json.id]);
    assert.equal(row!.officer_rank_name, '[{"officer_rank":"Sp \\/ Rank","officer_rank_hi":"\\u092a\\u0941\\u0932\\u093f\\u0938","officer_number":"98765"}]');
    assert.equal(row!.pincode_id, 960);
    // update with equivalent JSON does not touch updated_at; pincode_show is dropped (not a column)
    await exec("UPDATE administrators SET updated_at = '2020-01-01 00:00:00' WHERE id = ?", [r.json.id]);
    const u = await api('PUT', `/administrator/${r.json.id}`, {
      state: 'P9D New', city: 'Lucknow', pincode_show: '996001', department_id: '960', status: '1', pincode_id: '960',
      officer_rank_name: [{ officer_rank: 'Sp / Rank', officer_rank_hi: 'पुलिस', officer_number: '98765' }],
    });
    assert.equal(u.status, 200);
    assert.equal((await first('SELECT updated_at FROM administrators WHERE id = ?', [r.json.id]))!.updated_at, '2020-01-01 00:00:00');
  });
});

describe('city-helpline-number', () => {
  it('Laravel quirk: a NULL city_helpline row on the page → 500 (foreach over null)', async () => {
    const r = await api('GET', '/city-helpline-number');
    const hasNull = await first('SELECT id FROM city_helpline_numbers WHERE city_helpline IS NULL LIMIT 1');
    if (hasNull) assert.equal(r.status, 500);
  });
  it('closure columns from row 0, filters state / district', async () => {
    const r = await api('GET', '/city-helpline-number?state=P9D%20State');
    assert.deepEqual(r.json.data.map((d: any) => [d.id, d.ambulance_number, d.police_headquarters, d.pincode]), [
      [961, '-', '-', '-'],
      [960, '108', '100', '996001'],
    ]);
    assert.deepEqual((await api('GET', '/city-helpline-number?district=P9D%20Town')).json.data.map((d: any) => d.id), [961]);
  });
  it('bare-attribute custom messages, explicit rules first', async () => {
    const r = await api('POST', '/city-helpline-number', { city_helpline: [{ ambulance_number: '' }] });
    assert.deepEqual(Object.values(r.json.errors).flat().slice(0, 4), ['State is Required!', 'City is Required!', 'PinCode is Required!', 'Ambulance Number is Required']);
  });
  it('create writes state (dev-schema column) + array cast', async () => {
    const r = await api('POST', '/city-helpline-number', {
      state: 'P9D New', city: 'X', pincode_id: '960',
      city_helpline: [{ ambulance_number: '108', fire_safety_number: '101', women_helpline: '1090', police_headquarters: '100' }],
    });
    assert.equal(r.status, 201);
    const row = await first('SELECT * FROM city_helpline_numbers WHERE id = ?', [r.json.id]);
    assert.equal(row!.city_helpline, '[{"ambulance_number":"108","fire_safety_number":"101","women_helpline":"1090","police_headquarters":"100"}]');
  });
});

describe('address', () => {
  it('list: pincode search through the relation, area displays', async () => {
    const r = await api('GET', '/address?search=996002');
    assert.deepEqual(r.json.data.map((d: any) => [d.id, d.pincode, d.area_display, d.area_hi_display]), [[961, '996002', '', 'N/A']]);
    const s = await api('GET', '/address?pincode_id=99600&search=P9D');
    assert.deepEqual(s.json.data.map((d: any) => d.id), [961, 960]);
    assert.equal(s.json.data[1].area_display, 'P9D North, P9D South Very Long Local Area Name');
  });
  it('create validation messages (order as Laravel)', async () => {
    const r = await api('POST', '/address', { area: [{ area_name: '' }] });
    assert.deepEqual(Object.values(r.json.errors).flat(), [
      'Please select a state.', 'Please select a city.', 'Please select a pincode.', 'The tehsil field is required.',
      'तहसील फ़ील्ड आवश्यक है.', 'Each area must have a name.', 'प्रत्येक क्षेत्र का एक नाम होना चाहिए.',
    ]);
  });
  it('create + unvalidated update', async () => {
    const r = await api('POST', '/address', {
      state: 'P9D New', city: 'C', pincode_id: '962', tehsil: 'T', tehsil_hi: 'त', area: JSON.stringify([{ area_name: 'A', area_name_hi: 'अ' }]),
    });
    assert.equal(r.status, 201);
    assert.equal((await first('SELECT area FROM addresses WHERE id = ?', [r.json.id]))!.area, '[{"area_name":"A","area_name_hi":"\\u0905"}]');
    const u = await api('PUT', `/address/${r.json.id}`, { state: 'P9D New', tehsil: '' });
    assert.equal(u.status, 200);
    assert.equal((await first('SELECT tehsil FROM addresses WHERE id = ?', [r.json.id]))!.tehsil, null);
  });
});

describe('about-us', () => {
  it('list text column', async () => {
    const r = await api('GET', '/about-us?search=P9D');
    assert.deepEqual(r.json.data.map((d: any) => [d.id, d.tourist_places_text]), [[961, '-'], [960, 'P9D Fort (किला),  ()']]);
  });
  it('create with images, then edit re-sending the stripped names (Backpack quirk: path lost, files deleted)', async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ state: 'P9D New', city: 'C', about_mediator: 'M', about_mediator_hi: 'म', know_your_city: 'K', know_your_city_hi: 'क' })) fd.append(k, v);
    fd.append('tourist_places', JSON.stringify([{ place_name: 'Fort / One', place_name_hi: 'किला', place_description: 'D', place_description_hi: 'वि' }]));
    fd.append('tourist_places[0][place_image]', new Blob([PNG], { type: 'image/png' }), 'My Fort Pic.PNG');
    const r = await api('POST', '/about-us', fd);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const row = await first('SELECT tourist_places FROM about_uses WHERE id = ?', [r.json.id]);
    const m = /^\[\{"place_name":"Fort \\\/ One","place_name_hi":"\\u0915\\u093f\\u0932\\u093e","place_description":"D","place_description_hi":"\\u0935\\u093f","place_image":"uploads\\\/tourist_place_images\\\/(my-fort-pic-[A-Za-z0-9]{4}\.png)"\}\]$/.exec(String(row!.tourist_places));
    assert.ok(m, String(row!.tourist_places));
    const file = path.posix.join(env.publicPath, 'uploads/tourist_place_images', m[1]!);
    assert.ok(fs.existsSync(file));
    const u = await api('PUT', `/about-us/${r.json.id}`, {
      state: 'P9D New', city: 'C', about_mediator: 'M', about_mediator_hi: 'म', know_your_city: 'K', know_your_city_hi: 'क',
      tourist_places: [{ place_name: 'Fort / One', place_name_hi: 'किला', place_description: 'D', place_description_hi: 'वि' }],
      _order_tourist_places: [{ place_image: m[1] }],
    });
    assert.equal(u.status, 200);
    assert.match(String((await first('SELECT tourist_places FROM about_uses WHERE id = ?', [r.json.id]))!.tourist_places), new RegExp(`"place_image":"${m[1]}"`));
    assert.ok(!fs.existsSync(file));
  });
  it('validation: tourist_places required → raw key; image rules', async () => {
    const r = await api('POST', '/about-us', {});
    assert.deepEqual(Object.values(r.json.errors).flat().slice(-1), ['validation.required']);
  });
});

describe('pincode', () => {
  it('list: whereNotNull clause, pincode area via first row with the pin', async () => {
    const r = await api('GET', '/pincode?search=9960');
    const ids = r.json.data.map((d: any) => d.id);
    assert.ok(!ids.includes(964));
    assert.equal(r.json.data.find((d: any) => d.id === 963).pincode_area, 'P9D Tehsil (पी तहसील)');
  });
  it('create: unique message; Hindi + codes spread over the state rows', async () => {
    assert.equal((await api('POST', '/pincode', { pin_code: '996001' })).json.message, 'This PinCode already exists.');
    const r = await api('POST', '/pincode', { state: 'P9D Upd State', city: 'P9D Upd City', pin_code: '996100', state_code: 'UB', district_code: '12' });
    assert.equal(r.status, 201);
    const rows = await all("SELECT pin_code, state_code, district_code FROM pincodes WHERE state = 'P9D Upd State' ORDER BY id");
    assert.deepEqual(rows.map((x) => [x.pin_code, x.state_code, x.district_code]), [['996005', 'UB', '12'], ['996100', 'UB', '12']]);
    const n = await first("SELECT state_hi, city_hi FROM pincodes WHERE pin_code = '996100'");
    assert.ok(n!.state_hi && n!.city_hi);
  });
  it('update: raw validation keys; codes updated before the entry', async () => {
    assert.equal((await api('PUT', '/pincode/965', { pin_code: '996005' })).json.message, 'validation.required');
    const u = await api('PUT', '/pincode/965', { pin_code: '996005', city: 'P9D Upd City', city_hi: 'अ', district_code: '11', state: 'P9D Upd State', state_hi: 'अपडेट', state_code: 'UA' });
    assert.equal(u.status, 200);
    assert.deepEqual(await first('SELECT city_hi, district_code, state_code FROM pincodes WHERE id = 965'), { city_hi: 'अ', district_code: '11', state_code: 'UA' });
    await exec("UPDATE pincodes SET city_hi = 'अपडेट शहर' WHERE id = 965");
  });
  it('import: missing file / bad type alerts; xlsx updates + inserts in one sheet', async () => {
    assert.deepEqual((await api('POST', '/insertPinCodeData', new FormData())).json, { alert: 'warning', message: 'Please select a file' });
    const bad = new FormData();
    bad.append('pin_code_master_sheet', new Blob(['x']), 'a.xlsx');
    assert.equal((await api('POST', '/insertPinCodeData', bad)).json.message, 'Please select a file with a valid extension (xlsx)');
    fs.mkdirSync(path.posix.join(env.publicPath, 'uploads/import_file/pin_code_master_sheet'), { recursive: true });
    const sheet = writeXlsx([
      ['Pincode', 'State', 'District', 'StateCode', 'District Code'],
      [996101, 'P9D Import', 'Imp City', 'PI', 5],
      ['996005', 'P9D Upd State', 'P9D Upd City', 'UA', '11'],
    ]);
    const fd = new FormData();
    fd.append('pin_code_master_sheet', new Blob([sheet]), 'p9d.xlsx');
    const r = await api('POST', '/insertPinCodeData', fd);
    assert.deepEqual(r.json, { success: 'Your sheet has been imported successfully.' });
    const ins = await first("SELECT state, city, state_code, district_code FROM pincodes WHERE pin_code = '996101'");
    assert.deepEqual(ins, { state: 'P9D Import', city: 'Imp City', state_code: 'PI', district_code: '5' });
  });
});

describe('dashboard + charts', () => {
  it('chart datasets (consoletvs JSON shape)', async () => {
    const r = await api('GET', '/charts/weekly-businesses');
    assert.deepEqual(Object.keys(r.json[0]), ['borderWidth', 'borderColor', 'backgroundColor', 'data', 'label', 'type']);
    assert.equal(r.json[0].data.length, 31);
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const cats = Number((await first('SELECT COUNT(*) c FROM business_categories WHERE DATE(created_at) = ?', [today]))!.c);
    assert.equal((await api('GET', '/charts/recent-businesses')).json[1].data[6], cats);
  });
  it('dashboard widgets + labels', async () => {
    const r = await api('GET', '/dashboard');
    assert.equal(r.json.widgets.length, 9);
    const addresses = Number((await first('SELECT COUNT(*) c FROM addresses'))!.c);
    assert.equal(r.json.widgets[8].value, addresses);
    assert.equal(r.json.charts[2].labels[0], '30 days ago');
    assert.deepEqual(r.json.charts[3].labels, []);
  });
  it('requires auth', async () => {
    const saved = token;
    token = 'nope';
    assert.equal((await api('GET', '/charts/weekly-users')).status, 401);
    token = saved;
  });
});
