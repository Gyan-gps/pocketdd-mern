// BusinessController, BusinessLocationController, BusinessUserProfileController.
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../../src/config/env.js';
import { createToken } from '../../support/mysql-token.js';
import { all, exec } from '../../../src/db/mysql.js';
import { seed } from '../../../scripts/seed/03-business-api.js';
import type { ParityCase } from '../types.js';

const TOKEN_NAME = 'parity4';
const ids = [400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410];
await exec('DELETE FROM personal_access_tokens WHERE name = ?', [TOKEN_NAME]);
const T: Record<number, string> = {};
for (const id of ids) T[id] = await createToken(id, TOKEN_NAME);

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// ------------------------------------------------------------------ uploads bookkeeping
const UPLOADS = path.posix.join(env.publicPath, 'uploads');
const FOLDERS = ['business_images', 'business_logo', 'user_images'];
const existedAtStart = new Set(FOLDERS.filter((f) => fs.existsSync(path.posix.join(UPLOADS, f))));
const uploadsExisted = fs.existsSync(UPLOADS);
const GENERATED = /^\d{5}-\d+-img\./;

function cleanupUploads() {
  for (const f of FOLDERS) {
    const dir = path.posix.join(UPLOADS, f);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) if (GENERATED.test(name)) fs.rmSync(path.posix.join(dir, name), { force: true });
    if (!existedAtStart.has(f) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
  if (!uploadsExisted && fs.existsSync(UPLOADS) && fs.readdirSync(UPLOADS).length === 0) fs.rmdirSync(UPLOADS);
}
const ensureDir = (f: string) => fs.mkdirSync(path.posix.join(UPLOADS, f), { recursive: true, mode: 0o777 });
const removeDirIfOurs = (f: string) => {
  const dir = path.posix.join(UPLOADS, f);
  if (!fs.existsSync(dir)) return;
  if (fs.readdirSync(dir).every((n) => GENERATED.test(n))) fs.rmSync(dir, { recursive: true, force: true });
};

// ------------------------------------------------------------------ DB reset
async function reseed() {
  await exec('SET FOREIGN_KEY_CHECKS = 0');
  for (const [table, rows] of seed) {
    const cols = new Set(
      (await all('SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table])).map(
        (r) => String(r.c),
      ),
    );
    for (const row of rows) {
      const entries = Object.entries(row).filter(([k]) => cols.has(k));
      await exec(
        `INSERT INTO \`${table}\` (${entries.map(([k]) => `\`${k}\``).join(', ')}) VALUES (?)
         ON DUPLICATE KEY UPDATE ${entries.map(([k]) => `\`${k}\` = VALUES(\`${k}\`)`).join(', ')}`,
        [entries.map(([, v]) => v)],
      );
    }
  }
  await exec('SET FOREIGN_KEY_CHECKS = 1');
  // rows created by the endpoints
  await exec('DELETE FROM businesses WHERE user_id BETWEEN 400 AND 410 AND id NOT IN (400,401,402,403,404)');
  await exec('DELETE FROM businesse_requests WHERE user_id BETWEEN 400 AND 410 AND id NOT IN (400,401,402,403,404)');
  await exec("DELETE FROM business_iamges WHERE (business_id IS NULL OR id NOT IN (400,401,402)) AND img LIKE 'uploads/business_images/%-img.%'");
  await exec('DELETE FROM business_details WHERE business_id BETWEEN 400 AND 499');
}
const reset = async () => {
  await reseed();
};

const NEW_REQ = {
  business_username: 'Gupta',
  number: '9876500403',
  business_email: 'new403@example.test',
  business_category: 'Phase4 Doctors',
  business_sub_category: 'P4 Dentist',
  business_name: 'Sharma Clinic',
  state: 'Uttar Pradesh',
  district: 'Lucknow',
  city: 'Lucknow',
  pincode: '226400',
  area: 'Area X',
  area_name: 'Park',
  street_address: 'Street X',
  address_line_1: 'Line X',
  language: 'en',
};

const B = '/api/';
export const cases: ParityCase[] = [
  { name: 'phase4 setup', path: B + 'get-all-business-categories-dropdown', body: {}, before: reset },

  // --- categories (public)
  { name: 'cats missing language', path: B + 'get-all-business-categories-dropdown', body: {} },
  { name: 'cats en', path: B + 'get-all-business-categories-dropdown', body: { language: 'en', cityName: 'Lucknow' } },
  { name: 'cats hi (form)', path: B + 'get-all-business-categories-dropdown', as: 'form', body: { language: 'hi' } },
  { name: 'subcats missing', path: B + 'get-all-business-sub-categories-dropdown', body: {} },
  { name: 'subcats unknown slug', path: B + 'get-all-business-sub-categories-dropdown', body: { category_slug: 'nope-4', cityName: 'x', language: 'en' } },
  { name: 'subcats missing city', path: B + 'get-all-business-sub-categories-dropdown', body: { category_slug: 'p4-doctors', language: 'en' } },
  { name: 'subcats numeric slug', path: B + 'get-all-business-sub-categories-dropdown', body: { category_slug: 5, cityName: 'x', language: 'en' } },
  { name: 'subcats en', path: B + 'get-all-business-sub-categories-dropdown', body: { category_slug: 'p4-doctors', cityName: 'Lucknow', language: 'en' } },
  { name: 'subcats hi', path: B + 'get-all-business-sub-categories-dropdown', body: { category_slug: 'p4-doctors', cityName: 'लखनऊ', language: 'hi' } },
  { name: 'subcats hi businessAdd "false"', path: B + 'get-all-business-sub-categories-dropdown', as: 'form', body: { category_slug: 'p4-doctors', cityName: 'x', language: 'hi', businessAdd: 'false' } },
  { name: 'subcats hi businessAdd 0', path: B + 'get-all-business-sub-categories-dropdown', body: { category_slug: 'p4-doctors', cityName: 'x', language: 'hi', businessAdd: 0 } },
  { name: 'subcats none', path: B + 'get-all-business-sub-categories-dropdown', body: { category_slug: 'p4-empty', cityName: 'x', language: 'en' } },

  // --- business images
  { name: 'images no token', path: B + 'get-business-images', body: {} },
  { name: 'images user 400', path: B + 'get-business-images', body: {}, token: T[400] },
  { name: 'images user 403 empty', path: B + 'get-business-images', body: {}, token: T[403] },
  { name: 'add image missing', path: B + 'add-business-images', body: {}, token: T[400] },
  { name: 'add image no business', path: B + 'add-business-images', body: { image: PNG }, token: T[403] },
  { name: 'add image not base64', path: B + 'add-business-images', body: { image: 'abc' }, token: T[400] },
  { name: 'add image no ;base64,', path: B + 'add-business-images', body: { image: 'data:image/png,xyz' }, token: T[400] },
  { name: 'add image ok', path: B + 'add-business-images', body: { image: PNG }, token: T[400], before: reset },
  { name: 'images after add (business_id null)', path: B + 'get-business-images', body: {}, token: T[400] },
  { name: 'delete image missing', path: B + 'delete-business-image', body: {}, token: T[400] },
  { name: 'delete image unknown', path: B + 'delete-business-image', body: { image_id: 99999 }, token: T[400] },
  { name: 'delete image array', path: B + 'delete-business-image', body: { image_id: [400] }, token: T[400] },
  { name: 'delete image ok', path: B + 'delete-business-image', body: { image_id: 401 }, token: T[400], before: reset },
  { name: 'update image missing image', path: B + 'update-business-image', body: { image_id: 400 }, token: T[400] },
  { name: 'update image bad data', path: B + 'update-business-image', body: { image_id: 400, image: 'nope' }, token: T[400] },
  { name: 'update image ok', path: B + 'update-business-image', body: { image_id: 400, image: PNG }, token: T[400], before: reset },
  { name: 'images after update', path: B + 'get-business-images', body: {}, token: T[400], volatile: ['data.*.img', 'data.*.photo_url', 'data.*.updated_at'] },
  { name: 'update image unknown id (500)', path: B + 'update-business-image', body: { image_id: 99999, image: PNG }, token: T[400] },

  // --- update-user-business
  { name: 'uub missing name', path: B + 'update-user-business', body: { city: 'x', address: 'y' }, token: T[400] },
  { name: 'uub missing city', path: B + 'update-user-business', body: { name: 'x', address: 'y' }, token: T[400] },
  { name: 'uub missing address', path: B + 'update-user-business', body: { name: 'x', city: 'y' }, token: T[400] },
  { name: 'uub no active business', path: B + 'update-user-business', body: { name: 'x', city: 'y', address: 'z' }, token: T[407] },
  {
    name: 'uub create detail',
    path: B + 'update-user-business',
    body: { name: 'New Name & Co_Ltd', city: 'Lucknow', address: 'Addr', street_address: 'S', pincode: 226400, description: 'Desc / ok' },
    token: T[400],
    before: reset,
  },
  { name: 'uub update detail', path: B + 'update-user-business', body: { name: 'New Name & Co_Ltd', city: 'Lucknow', address: 'Addr', post: 'P', description: 'हिंदी' }, token: T[400] },

  // --- add-new-business-request
  { name: 'anbr missing all', path: B + 'add-new-business-request', body: {}, token: T[403], before: reset },
  { name: 'anbr number taken', path: B + 'add-new-business-request', body: { ...NEW_REQ, number: '9200000400' }, token: T[403] },
  { name: 'anbr number pending', path: B + 'add-new-business-request', body: { ...NEW_REQ, number: '9300000402' }, token: T[403] },
  { name: 'anbr email taken', path: B + 'add-new-business-request', body: { ...NEW_REQ, business_email: 'owner400@example.test' }, token: T[403] },
  { name: 'anbr email pending', path: B + 'add-new-business-request', body: { ...NEW_REQ, business_email: 'req410@example.test' }, token: T[403] },
  { name: 'anbr missing district', path: B + 'add-new-business-request', body: { ...NEW_REQ, district: null }, token: T[403] },
  { name: 'anbr pincode 5 digits', path: B + 'add-new-business-request', body: { ...NEW_REQ, pincode: '22640' }, token: T[403] },
  { name: 'anbr pincode regex', path: B + 'add-new-business-request', body: { ...NEW_REQ, pincode: '026400' }, token: T[403] },
  { name: 'anbr has business', path: B + 'add-new-business-request', body: NEW_REQ, token: T[400] },
  { name: 'anbr pending request', path: B + 'add-new-business-request', body: NEW_REQ, token: T[402] },
  { name: 'anbr unknown category', path: B + 'add-new-business-request', body: { ...NEW_REQ, business_category: 'Nope' }, token: T[403] },
  { name: 'anbr unknown pincode (rollback)', path: B + 'add-new-business-request', body: { ...NEW_REQ, pincode: '999999' }, token: T[403], before: reset },
  { name: 'anbr after rollback still allowed', path: B + 'add-new-business-request', body: { ...NEW_REQ, pincode: '999998' }, token: T[403] },
  {
    name: 'anbr success en + logo',
    path: B + 'add-new-business-request',
    body: { ...NEW_REQ, business_image: PNG },
    token: T[403],
    before: reset,
    volatile: ['new-business'],
  },
  {
    name: 'anbr success hi, no sub (IS NULL quirk)',
    path: B + 'add-new-business-request',
    body: { ...NEW_REQ, language: 'hi', business_category: 'फेज़ डॉक्टर', business_sub_category: null, pincode: 226401, number: 9876500409, business_email: 'n409@example.test' },
    token: T[409],
    before: reset,
    volatile: ['new-business'],
  },
  {
    name: 'anbr success other language',
    path: B + 'add-new-business-request',
    body: { ...NEW_REQ, language: 'fr', business_category: 'फेज़ डॉक्टर' },
    token: T[403],
    before: reset,
    volatile: ['new-business'],
  },

  // --- update-business
  { name: 'ub existing no fields', path: B + 'update-business', body: {}, token: T[400], before: reset },
  { name: 'ub existing bad pincode', path: B + 'update-business', body: { pincode: '12' }, token: T[400] },
  { name: 'ub existing null username (sometimes)', path: B + 'update-business', body: { business_username: null }, token: T[400] },
  { name: 'ub existing number other business', path: B + 'update-business', body: { number: '9300000402' }, token: T[400] },
  { name: 'ub existing number own business', path: B + 'update-business', body: { number: '9100000400' }, token: T[400] },
  { name: 'ub existing email pending', path: B + 'update-business', body: { business_email: 'req401@example.test' }, token: T[400] },
  { name: 'ub existing bad email', path: B + 'update-business', body: { business_email: 'nope' }, token: T[400] },
  { name: 'ub existing invalid category', path: B + 'update-business', body: { business_category: 'nope' }, token: T[400] },
  {
    name: 'ub existing full update',
    path: B + 'update-business',
    body: { business_name: 'BN', business_username: 'Owner X', business_category: 'phase4 DOCTORS', business_sub_category: 'p4 ortho', state: 'S', district: 'D', pincode: '226400', tehsil: 'T', number: '9100000400', business_logo: 'x', area: 'A', address_line_1: 'L1' },
    token: T[400],
    before: reset,
  },
  { name: 'ub existing hi category + image', path: B + 'update-business', body: { language: 'hi', business_category: 'फेज़ डॉक्टर', business_sub_category: 'दंत', business_image: PNG }, token: T[400], before: reset },
  { name: 'ub inactive business (sometimes)', path: B + 'update-business', body: { state: 'New State' }, token: T[407], before: reset },
  { name: 'ub new missing all', path: B + 'update-business', body: {}, token: T[409], before: reset },
  { name: 'ub new bad number', path: B + 'update-business', body: { ...NEW_REQ, number: '123' }, token: T[409] },
  { name: 'ub new category "0"', path: B + 'update-business', body: { ...NEW_REQ, business_category: '0' }, token: T[409] },
  { name: 'ub new pending', path: B + 'update-business', body: { ...NEW_REQ, number: '9876500402', business_email: 'n402@example.test' }, token: T[402] },
  {
    name: 'ub new insert',
    path: B + 'update-business',
    body: { ...NEW_REQ, number: '9876500409', business_email: 'n409@example.test' },
    token: T[409],
    before: reset,
    volatile: ['new-business', 'business_id'],
  },

  // --- get-user-business-details
  // Laravel quirk: business_icon nests url(logo) behind APP_URL, so its host part differs per app.
  { name: 'ubd relative logo', path: B + 'get-user-business-details', body: {}, token: T[400], before: reset, volatile: ['data.business_icon'] },
  { name: 'ubd absolute logo', path: B + 'get-user-business-details', body: {}, token: T[401] },
  { name: 'ubd inactive business', path: B + 'get-user-business-details', body: {}, token: T[407], volatile: ['data.business_icon'] },
  { name: 'ubd no business (404)', path: B + 'get-user-business-details', body: {}, token: T[403] },

  // --- business locations
  { name: 'locations list', path: B + 'get-all-business-locations', body: {}, token: T[404] },
  { name: 'locations no business user', path: B + 'get-all-business-locations', body: {}, token: T[406] },
  { name: 'locations no location row', path: B + 'get-all-business-locations', body: {}, token: T[405] },
  { name: 'locations missing location id', path: B + 'get-all-business-locations', body: {}, token: T[409] },
  { name: 'set location current', path: B + 'update-business-location', body: {}, token: T[404] },
  { name: 'set location language', path: B + 'update-business-location', body: { language: 'hi' }, token: T[404], before: reset },
  { name: 'set location new', path: B + 'update-business-location', body: { location_id: 401, language: 'en' }, token: T[404], before: reset },
  { name: 'set location unknown', path: B + 'update-business-location', body: { location_id: 9999 }, token: T[404], before: reset },
  { name: 'set location no bul', path: B + 'update-business-location', body: {}, token: T[405] },
  { name: 'set location no bul + language (500)', path: B + 'update-business-location', body: { language: 'hi' }, token: T[405] },
  { name: 'set location no bul + id', path: B + 'update-business-location', body: { location_id: 401 }, token: T[405] },
  { name: 'set location no business user', path: B + 'update-business-location', body: {}, token: T[406] },
  { name: 'set location dangling location', path: B + 'update-business-location', body: {}, token: T[409] },

  // --- profile
  { name: 'profile active business', path: B + 'business-user-profile-details', body: {}, token: T[400], before: reset },
  { name: 'profile pending request', path: B + 'business-user-profile-details', body: {}, token: T[401] },
  { name: 'profile no business', path: B + 'business-user-profile-details', body: {}, token: T[402] },
  { name: 'profile bare user', path: B + 'business-user-profile-details', body: {}, token: T[406] },
  { name: 'profile inactive business', path: B + 'business-user-profile-details', body: {}, token: T[407] },
  { name: 'u&b active business', path: B + 'get-user-and-business-details', body: {}, token: T[400] },
  { name: 'u&b active + pending', path: B + 'get-user-and-business-details', body: {}, token: T[401] },
  { name: 'u&b pending only', path: B + 'get-user-and-business-details', body: {}, token: T[402] },
  { name: 'u&b bare user', path: B + 'get-user-and-business-details', body: {}, token: T[406] },
  { name: 'u&b inactive business', path: B + 'get-user-and-business-details', body: {}, token: T[407] },
  { name: 'u&b approved request only', path: B + 'get-user-and-business-details', body: {}, token: T[410] },

  // --- update-user-profile
  { name: 'uup missing name', path: B + 'update-user-profile', body: {}, token: T[408] },
  { name: 'uup bad email', path: B + 'update-user-profile', body: { name: 'N', email: 'bad' }, token: T[408] },
  { name: 'uup email taken', path: B + 'update-user-profile', body: { name: 'N', email: 'p4-400@example.test' }, token: T[408] },
  { name: 'uup images.*.mimes quirk', path: B + 'update-user-profile', body: { images: [{ mimes: 'x' }] }, token: T[408] },
  {
    name: 'uup strings',
    path: B + 'update-user-profile',
    body: {
      name: 'P4 Profile', email: 'p4-408@example.test', phone: '9000000408', user_icon: 'http://cdn/x/uploads/user_images/a.png',
      images: ['http://h/uploads/business_images/b.png', 'plain.png', ['uploads/z.png'], ''], state: 'S', district: 'D', pincode: '1',
      tahsil: 'T', post: 'P', description: 'About', street_address: 'SA', address_line_1: 'AL',
    },
    token: T[408],
    before: reset,
    volatile: ['userData.updated_at'],
  },
  { name: 'uup own email + images string', path: B + 'update-user-profile', body: { name: 'Q', email: 'p4-408@example.test', images: 'abc' }, token: T[408], volatile: ['userData.updated_at'] },
  {
    name: 'uup base64 icon, user_images missing',
    path: B + 'update-user-profile',
    body: { name: 'Q', user_icon: PNG },
    token: T[408],
    before: async () => {
      await reset();
      removeDirIfOurs('user_images');
    },
    // file_put_contents() message embeds public_path() (/var/www/html/public vs /laravel/public) + random name
    volatile: ['error', 'userData.user_icon', 'userData.updated_at'],
  },
  {
    name: 'uup base64 icon + gallery',
    path: B + 'update-user-profile',
    body: { name: 'Q', user_icon: [PNG], images: { 0: PNG, 2: ['uploads/business_images/k.png'] } },
    token: T[408],
    before: async () => {
      await reset();
      ensureDir('user_images');
      ensureDir('business_images');
    },
    volatile: ['userData.user_icon', 'userData.updated_at'],
  },
  {
    name: 'uup multipart file icon',
    path: B + 'update-user-profile',
    body: { name: 'Multi', email: 'p4-408@example.test' },
    files: { user_icon: { name: 'a.png', type: 'image/png', content: Buffer.from(PNG.split(',')[1]!, 'base64') }, 'images[]': { name: 'b.png', type: 'image/png', content: 'x' } },
    token: T[408],
    before: reset,
    // PHP binds the UploadedFile as its tmp path (/tmp/phpXXXXXX)
    volatile: ['userData.user_icon', 'userData.updated_at'],
  },

  // --- cleanup
  {
    name: 'phase4 cleanup',
    path: B + 'get-all-business-categories-dropdown',
    body: { language: 'en' },
    before: async () => {
      await reset();
      cleanupUploads();
      await exec('DELETE FROM personal_access_tokens WHERE name = ?', [TOKEN_NAME]);
    },
  },
];
