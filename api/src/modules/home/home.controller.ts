// Port of App\Http\Controllers\Api\ApiController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import crypto from 'node:crypto';
import type { Request } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../../core/http/respond.js';
import { nowDb, toModelJson } from '../../core/time.js';
import { appUrl, url } from '../../core/url.js';
import { validate } from '../../core/validation/validator.js';
import { all, first, type Row } from '../../db/pool.js';
import { phpTrim, unicodeToKrutidev } from '../../helpers/krutidev.js';

// ---------------------------------------------------------------------------------------------
// PHP / Laravel semantics helpers
// ---------------------------------------------------------------------------------------------

/** PHP truthiness. */
const truthy = (v: unknown): boolean => {
  if (v === null || v === undefined || v === false || v === 0 || v === '' || v === '0') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0 || 'originalname' in (v as object);
  return true;
};

/** PHP `array_filter()` without callback (values, original order). */
const arrayFilter = (vals: unknown[]) => vals.filter(truthy);

/**
 * Laravel's HandleExceptions turns PHP warnings into ErrorException (an \Exception, so controller
 * `catch (Exception $e)` blocks catch it) — e.g. reading a property of null.
 */
class ErrorException extends Error {}
function prop(obj: Row | null | undefined, name: string): unknown {
  if (obj === null || obj === undefined) throw new ErrorException(`Attempt to read property "${name}" on null`);
  return obj[name] ?? null;
}

/** `where($col, $value)` — Laravel turns a null value into `whereNull`. */
function eq(col: string, value: unknown): [string, unknown[]] {
  return value === null || value === undefined ? [`${col} is null`, []] : [`${col} = ?`, [value]];
}

/** PHP string coercion of DB/request scalars. */
const phpStr = (v: unknown): string =>
  v === null || v === undefined || v === false ? '' : v === true ? '1' : String(v);

/**
 * Laravel `url($path)`. `url(null)` returns the UrlGenerator instance, which json_encodes to `{}`.
 * Laravel quirk: kept, e.g. ads/businesses without an image serialize as `{}`.
 */
function laravelUrl(req: Request, path: unknown): string | Record<string, never> {
  if (path === null || path === undefined) return {};
  const p = phpStr(path);
  if (/^(#|\/\/|https?:\/\/|(mailto|tel|sms):)/i.test(p)) return p;
  const root = url(req, '').replace(/\/+$/, '');
  const qi = p.indexOf('?');
  const [pathPart, query] = qi === -1 ? [p, ''] : [p.slice(0, qi), p.slice(qi)];
  const trimmed = pathPart.replace(/^\/+|\/+$/g, '');
  return (root + '/' + trimmed).replace(/\/+$/, '') + query;
}

/** Laravel `$request->bearerToken()`. */
function bearerToken(req: Request): string | null {
  const header = req.get('authorization') ?? '';
  const pos = header.toLowerCase().lastIndexOf('bearer ');
  if (pos === -1) return null;
  const h = header.slice(pos + 7);
  return h.includes(',') ? h.slice(0, h.indexOf(',')) : h;
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Sanctum `PersonalAccessToken::findToken()` (no expiry / last_used_at handling). */
async function findToken(token: string): Promise<Row | null> {
  const sep = token.indexOf('|');
  if (sep === -1) return first('SELECT * FROM personal_access_tokens WHERE token = ? LIMIT 1', [sha256(token)]);
  const instance = await first('SELECT * FROM personal_access_tokens WHERE id = ? LIMIT 1', [token.slice(0, sep)]);
  if (!instance) return null;
  return String(instance.token) === sha256(token.slice(sep + 1)) ? instance : null;
}

/** json_decode($v, true) — null on invalid input. */
function jsonDecode(v: unknown): unknown {
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

const isPhpArray = (v: unknown): v is Record<string, unknown> | unknown[] => !!v && typeof v === 'object';
const phpValues = (v: Record<string, unknown> | unknown[]) => (Array.isArray(v) ? v : Object.values(v));

/**
 * Backpack HasTranslations attribute read (`$model->attr` for a `$translatable` column) with
 * app.locale = fallback = 'en': the 'en' entry of the JSON column, or ''. Arrays are json_encoded.
 */
function translatedAttr(raw: unknown): unknown {
  const decoded = raw === null || raw === '' ? null : jsonDecode(raw);
  if (!isPhpArray(decoded)) return '';
  const value = (decoded as Record<string, unknown>)['en'];
  if (Array.isArray(decoded) || value === null || value === undefined || value === '') return '';
  return isPhpArray(value) ? JSON.stringify(value) : value;
}

/** `category_name` accessor of BusinessCategory / BusinessSubCategory. */
function categoryName(name: unknown): unknown {
  if (typeof name === 'string') return name;
  // json_decode(null) → null → `$decoded['en'] ?? ''`
  return '';
}

// ---------------------------------------------------------------------------------------------
// Shared queries
// ---------------------------------------------------------------------------------------------

/** `Business::find($id)` */
async function findBusiness(id: unknown): Promise<Row | null> {
  const [w, p] = eq('id', id);
  return first(`SELECT * FROM businesses WHERE ${w} LIMIT 1`, p);
}

async function adsWithBusiness(req: Request, position: string, location: string) {
  const ads = await all('SELECT advt_img, client_name FROM advertisments WHERE ads_position = ? AND ads_location = ? AND status = ?', [
    position,
    location,
    1,
  ]);
  const out = [];
  for (const ad of ads) {
    const business = await findBusiness(ad.client_name);
    out.push({
      advt_img: laravelUrl(req, ad.advt_img),
      business: business
        ? {
            id: business.id,
            business_name: business.business_name_en ?? business.business_name_hi ?? null,
            slug: business.slug,
          }
        : null,
    });
  }
  return out;
}

/** Advertisment model JSON: columns, casts (from_date/to_date date, sub_category_name array), appends. */
function serializeAdvertisment(row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const k of ['from_date', 'to_date']) {
    if (k in out) out[k] = out[k] ? toModelJson(String(out[k]).slice(0, 10)) : null;
  }
  for (const k of ['created_at', 'updated_at']) if (k in out) out[k] = toModelJson(out[k] as string | null);
  if ('sub_category_name' in out) out.sub_category_name = out.sub_category_name === null ? null : jsonDecode(out.sub_category_name);
  out.advertisment_icon = row.advt_img ? appUrl(String(row.advt_img)) : null;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/** POST get-dashboard-data */
export async function getDashboardData(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { cityName: 'required', language: 'required' }, {
      'cityName.required': 'Location is required.',
      'language.required': 'Language is required.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const language = input.language;
    let isBusinessExists = false;
    const nameField = language === 'en' ? 'name' : 'name_hi';
    const token = bearerToken(req);
    if (truthy(token)) {
      const accessToken = await findToken(token!);
      if (accessToken) {
        const userData = await first('SELECT * FROM businesses WHERE user_id = ? LIMIT 1', [accessToken.tokenable_id]);
        if (userData) isBusinessExists = true;
      }
    }

    const cats = await all(
      `SELECT id, ${nameField} AS name, slug, img,
        (SELECT COUNT(*) FROM business_sub_categories WHERE business_categories.id = business_sub_categories.parent_id AND status = ?) AS subcategories_count
       FROM business_categories WHERE status = ? ORDER BY LOWER(${nameField}) ASC`,
      [1, 1],
    );
    const categoriesData = cats.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      img: c.img,
      subcategories_count: Number(c.subcategories_count),
      category_icon: c.img ? appUrl(String(c.img)) : null,
      category_name: categoryName(c.name),
    }));

    const top = await adsWithBusiness(req, 'home', 'TOP');
    const bottom = await adsWithBusiness(req, 'home', 'BOTTOM');
    const menu = await adsWithBusiness(req, 'inner', 'Menu');

    return sendResponse(true, 'Dashboard data found', {
      user_location: '',
      categories: categoriesData,
      sliders: '',
      top,
      bottom,
      menu_advertisement: menu,
      is_business_exists: isBusinessExists,
    });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error retrieving getting dashboard data', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-dashboard-search-categories */
export async function homeCategorySearch(req: Request) {
  try {
    const input = req.input;
    // $request->filled('search')
    const s = input.search;
    const isEmptyString = s === null || s === undefined || (typeof s !== 'boolean' && !Array.isArray(s) && typeof s !== 'object' && phpTrim(String(s)) === '');
    if (isEmptyString) return sendResponse(true, 'No items found.', { data: [] });

    const v = await validate(input, { search: 'required|string', location: 'nullable|string' }, {
      'search.required': 'Please provide the Search Item.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const search = String(input.search);
    const location = input.location;
    const language = input.language;
    const hindiSearch = unicodeToKrutidev(search);

    const cats = await all('SELECT * FROM business_categories WHERE name LIKE ? OR name_hi LIKE ? OR name_hi LIKE ?', [
      `%${search}%`,
      `%${hindiSearch}%`,
      `%${search}%`,
    ]);
    const results: Record<string, unknown>[] = [];
    for (const item of cats) {
      const hasSub = await first('SELECT 1 AS e FROM business_sub_categories WHERE parent_id = ? LIMIT 1', [item.id]);
      const hasBiz = await first('SELECT 1 AS e FROM businesses WHERE business_category_id = ? LIMIT 1', [item.id]);
      results.push({
        id: item.id,
        name: language === 'hi' ? item.name_hi : item.name,
        slug: item.slug,
        img: laravelUrl(req, item.img),
        type: 'category',
        is_business: !hasSub && !!hasBiz,
      });
    }

    const subs = await all('SELECT * FROM business_sub_categories WHERE name LIKE ?', [`%${search}%`]);
    for (const item of subs) {
      results.push({
        id: item.id,
        name: language === 'hi' ? (item.name_hi ?? null) : item.name,
        slug: item.slug,
        img: laravelUrl(req, item.img),
        type: 'subcategory',
      });
    }

    let sql = 'SELECT * FROM businesses WHERE (business_name_en LIKE ? OR keywords LIKE ?)';
    const params: unknown[] = [`%${search}%`, `%${search}%`];
    if (truthy(location)) {
      sql += ' AND dist_en = ?';
      params.push(location);
    }
    for (const item of await all(sql, params)) {
      results.push({
        id: item.id,
        name: language === 'hi' ? item.business_name_hi : item.business_name_en,
        slug: item.slug,
        img: laravelUrl(req, item.logo),
        type: 'business',
      });
    }

    if (!results.length) return sendResponse(true, 'No items found.', { data: [] });
    return sendResponse(true, 'Search results found.', { data: results });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error in homeCategorySearch', { error: errorMessage(e) });
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-business-subcategories */
export async function getBusinessSubCategories(req: Request) {
  try {
    const input = req.input;
    const v = await validate(
      input,
      { category_slug: 'required|string|exists:business_categories,slug', cityName: 'required', language: 'required' },
      {
        'category_slug.required': 'Category is required.',
        'category_slug.exists': 'Category not found.',
        'language.required': 'Language is required.',
        'cityName.required': 'Location is required.',
      },
    );
    if (v.fails()) return sendResponse(false, v.first());

    const language = input.language;
    const nameField = language === 'en' ? 'name' : 'name_hi';
    const stateName = input.stateName ?? null;
    const cityName = input.cityName;
    const category = await first('SELECT * FROM business_categories WHERE slug = ? LIMIT 1', [input.category_slug]);

    const stateColumn = language === 'hi' ? 'state_hi' : 'state_en';
    const districtColumn = language === 'hi' ? 'dist_hi' : 'dist_en';

    if (category) {
      const token = bearerToken(req);
      if (truthy(token)) await findToken(token!); // user id only fed a commented-out filter

      const [sw, sp] = eq(stateColumn, stateName);
      const [dw, dp] = eq(districtColumn, cityName);
      const subs = await all(
        `SELECT id, ${nameField} AS name, slug, status, img,
          (SELECT COUNT(*) FROM businesses WHERE business_sub_categories.id = businesses.business_sub_category_id
             AND status = ? AND status = ? AND ${sw} AND ${dw}) AS businesses_count
         FROM business_sub_categories WHERE parent_id = ? AND status = ? ORDER BY ${nameField} ASC`,
        [1, 1, ...sp, ...dp, category.id, 1],
      );
      const subcategories = subs.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        status: s.status,
        img: s.img,
        businesses_count: Number(s.businesses_count),
        category_icon: s.img ? appUrl(String(s.img)) : null,
        category_name: categoryName(s.name),
      }));

      const adImgs = await all(
        'SELECT advt_img FROM advertisments WHERE ads_position = ? AND ads_location = ? AND status = ?',
        ['inner', 'All Subcategory Page', 1],
      );
      const advertisement = adImgs.map((a) => laravelUrl(req, a.advt_img));

      if (subcategories.length) {
        return sendResponse(true, 'Sub-Categories retrieved.', { subcategories, cityName: input.cityName, advertisement });
      }
      return sendResponse(true, 'Sub-Categories Not Found in Records.', { subcategories: [], cityName: input.cityName });
    }
    return sendResponse(false, 'Category not found.');
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error retrieving the sub-categories', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST search-business-sub-category (auth:sanctum) */
export async function searchBusinessSubCategory(req: Request) {
  try {
    const search = req.input.search;
    const user = await first('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user!.id]);
    const businessUser = await first('SELECT * FROM business_users WHERE user_id = ? AND user_id IS NOT NULL LIMIT 1', [
      prop(user, 'id'),
    ]);
    if (!businessUser) return sendResponse(true, 'Business User has not any location set.');
    const loc = await first(
      'SELECT * FROM business_users_location WHERE business_user_id = ? AND business_user_id IS NOT NULL LIMIT 1',
      [businessUser.id],
    );
    prop(loc, 'language');
    if (!truthy(search)) return { status: false, message: 'No Items found' };

    // Laravel quirk: BusinessSubCategory::getSearchedBusinessSubCategories() does not exist, so the
    // forwarded call throws BadMethodCallException (an \Exception) and this always ends in sendCatchLog().
    throw new Error('Call to undefined method App\\Models\\BusinessSubCategory::getSearchedBusinessSubCategories()');
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error retrieving getting dashboard categories', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-all-businesses */
export async function getAllBusiness(req: Request) {
  let subCategoryName: unknown = '';
  let categoryName: unknown = '';
  try {
    const input = req.input;
    const v = await validate(input, { slug: 'required|string', cityName: 'required|string', language: 'required|in:en,hi' }, {
      'slug.required': 'Slug is required.',
      'slug.exists': 'Business Sub-Category Not found!',
      'cityName.required': 'Location is required.',
      'language.required': 'Language is required.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const language = input.language as string;
    const tehsilName = input.tehsilName ?? null;
    const areaName = input.areaName ?? null;
    const cityNameInput = input.cityName ?? null;
    const stateNameInput = input.stateName ?? null;

    const [c1, c1p] = eq('city_hi', cityNameInput);
    const [c2, c2p] = eq('city', cityNameInput);
    const city = await first(`SELECT * FROM pincodes WHERE ${c1} OR ${c2} LIMIT 1`, [...c1p, ...c2p]);
    const [s1, s1p] = eq('state_hi', stateNameInput);
    const [s2, s2p] = eq('state', stateNameInput);
    const state = await first(`SELECT * FROM pincodes WHERE ${s1} OR ${s2} LIMIT 1`, [...s1p, ...s2p]);

    const cityName = language === 'hi' ? prop(city, 'city_hi') : prop(city, 'city');
    const stateName = language === 'hi' ? (state?.state_hi ?? null) : (state?.state ?? null);

    let businessSubCategory: Row | null;
    let currentSubCategoryNameEn: unknown = '';
    const distCol = language === 'hi' ? 'dist_hi' : 'dist_en';
    const orderCol = language === 'hi' ? 'business_name_hi' : 'business_name_en';
    const today = nowDb().slice(0, 10);
    const [dw, dp] = eq(distCol, cityName);
    let sql: string;
    let params: unknown[];

    if (!truthy(input.is_business)) {
      businessSubCategory = await first('SELECT * FROM business_sub_categories WHERE slug = ? LIMIT 1', [input.slug]);
      currentSubCategoryNameEn = prop(businessSubCategory, 'name_en');
      const sub = businessSubCategory!;
      subCategoryName = language === 'hi' ? (sub.name_hi ?? sub.name_en ?? null) : (sub.name_en ?? sub.name ?? null);

      const [kw, kp] = eq('id', sub.parent_id ?? null);
      const category = await first(`SELECT * FROM business_categories WHERE ${kw} LIMIT 1`, kp);
      categoryName = category
        ? language === 'hi'
          ? (category.name_hi ?? category.name_en ?? null)
          : (category.name_en ?? category.name ?? null)
        : null;

      const [bw, bp] = eq('business_sub_category_id', sub.id ?? null);
      sql = `SELECT * FROM businesses WHERE ${bw} AND ${dw} AND status = ? AND to_show = ?
        AND date(from_date) <= ? AND date(exp_date) >= ?
        AND (business_name_en != ? AND business_name_hi != ?)`;
      params = [...bp, ...dp, 1, 1, today, today, 'Pocket DD Desk', 'पॉकेट डीडी डेस्क'];
    } else {
      businessSubCategory = await first('SELECT * FROM business_categories WHERE slug = ? LIMIT 1', [input.slug]);
      const sub = businessSubCategory;
      // `$x->name_hi ?? $x->name` — the right-hand side of ?? is not null-safe, so a missing category warns on "name".
      subCategoryName = language === 'hi' ? (sub?.name_hi ?? prop(sub, 'name')) : (sub?.name ?? prop(sub, 'name'));
      const [bw, bp] = eq('business_category_id', prop(sub, 'id'));
      sql = `SELECT * FROM businesses WHERE ${bw} AND ${dw} AND status = ? AND to_show = ?
        AND date(from_date) <= ? AND date(exp_date) >= ?`;
      params = [...bp, ...dp, 1, 1, today, today];
    }
    void currentSubCategoryNameEn;

    const currentSubCategoryId = !truthy(input.is_business) ? businessSubCategory!.id : null;
    const currentSubCategoryName = subCategoryName;

    let searchSubCategory = currentSubCategoryName;
    if (language === 'hi') {
      const [nw, np] = eq('name_hi', currentSubCategoryName);
      const sc = await first(`SELECT * FROM business_sub_categories WHERE ${nw} LIMIT 1`, np);
      if (sc) searchSubCategory = sc.name;
    }
    const [aw, ap] = eq('businesses.business_sub_category_id', currentSubCategoryId);
    const ads = await all(
      `SELECT DISTINCT advertisments.* FROM advertisments
       LEFT JOIN businesses ON businesses.id = advertisments.client_name
       WHERE advertisments.ads_position = ? AND advertisments.status = ?
         AND ((advertisments.ads_location = ? AND ${aw})
           OR (advertisments.ads_location = ? AND json_contains(advertisments.sub_category_name, ?)))`,
      ['inner', 1, 'Same Category/Subcategory Page', ...ap, 'Multiple Category/Subcategory Page', JSON.stringify(searchSubCategory ?? null)],
    );
    const getAdvertisementData = ads.map(serializeAdvertisment);

    const token = bearerToken(req);
    if (truthy(token)) await findToken(token!);

    if (truthy(tehsilName)) {
      sql += ' AND tehsil_en = ?';
      params.push(tehsilName);
    }
    if (truthy(areaName) && isPhpArray(areaName)) {
      const vals = phpValues(areaName);
      sql += ` AND area_en IN (${vals.map(() => '?').join(', ')})`;
      params.push(...vals);
    }
    sql += ` ORDER BY ${orderCol} ASC`;
    const businesses = await all(sql, params);

    const separator = language === 'hi' ? '] ' : ', ';
    const mapped = businesses.map((b) => {
      const contact = arrayFilter([b.business_contact_1, b.business_contact_2, b.business_contact_3, b.business_contact_4]);
      const parts = arrayFilter([
        language === 'hi' ? b.address_line_1_hi : b.address_line_1_en,
        language === 'hi' ? b.area_hi : b.area_en,
        language === 'hi' ? b.dist_hi : b.dist_en,
        language === 'hi' ? b.state_hi : b.state_en,
        b.pincode_hi,
      ]);
      return {
        business_name: language === 'hi' ? b.business_name_hi : b.business_name_en,
        slug: b.slug,
        contact,
        address: phpTrim(parts.map(phpStr).join(separator), separator),
        business_logo: laravelUrl(req, b.logo),
      };
    });

    // Laravel quirk: `if ($mappedBusinesses)` tests a Collection object — always true.
    return sendResponse(true, 'Businesses fetched successfully.', {
      data: mapped,
      cityName,
      stateName,
      subCategoryName,
      category_name: categoryName,
      advertisement: getAdvertisementData,
    });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error retrieving getting businesses under sub-category', [errorMessage(e)]);
    return { status: false, message: errorMessage(e), subCategoryName };
  }
}

/** POST get-all-business-details */
export async function getBusinessDetails(req: Request) {
  try {
    const input = req.input;
    const v = await validate(
      input,
      { slug: 'required|string|exists:businesses,slug', cityName: 'required|string', language: 'required|in:en,hi' },
      {
        'slug.required': 'Slug is required.',
        'slug.exists': 'Business not found!',
        'cityName.required': 'Location is required.',
        'language.required': 'Language is required.',
      },
    );
    if (v.fails()) return sendResponse(false, v.first());

    const language = input.language;
    const b = await first('SELECT * FROM businesses WHERE slug = ? LIMIT 1', [input.slug]);
    if (!b) return sendResponse(false, 'Business Not found!');

    const hi = language === 'hi';
    const separator = language === 'hi' ? '] ' : ', ';
    const fullAddress = arrayFilter([
      hi ? b.address_line_1_hi : b.address_line_1_en,
      hi ? b.area_hi : b.area_en,
      hi ? b.dist_hi : b.dist_en,
      hi ? b.state_hi : b.state_en,
      phpStr(b.pincode_hi),
    ]);
    const contact = arrayFilter([b.business_contact_1, b.business_contact_2, b.business_contact_3, b.business_contact_4]);
    const images = arrayFilter([b.image_1, b.image_2, b.image_3, b.image_4]).map((img) => laravelUrl(req, img));

    // `social_media_url` has an 'array' cast; a double-encoded string is decoded once more.
    let social: unknown = b.social_media_url === null || b.social_media_url === '' ? null : jsonDecode(b.social_media_url);
    if (typeof social === 'string') social = jsonDecode(social);
    const list = social === null || social === undefined ? [] : isPhpArray(social) ? phpValues(social) : [social];
    const socialMedia = list.filter(
      (item) =>
        isPhpArray(item) &&
        !Array.isArray(item) &&
        (item as Record<string, unknown>).platform != null &&
        (item as Record<string, unknown>).url != null,
    );

    return sendResponse(true, 'Business Details fetched successfully', {
      data: {
        business_name: hi ? b.business_name_hi : b.business_name_en,
        about: hi ? b.about_hi : b.about_en,
        slug: b.slug,
        business_email: b.business_email,
        contact,
        address: phpTrim(fullAddress.map(phpStr).join(separator), separator),
        business_logo: laravelUrl(req, b.logo),
        images,
        social_media_url: socialMedia,
      },
    });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error retrieving getting businesses Details', { message: errorMessage(e) });
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-all-business-summaries (auth:sanctum) */
export async function getAllBusinessSummaries(req: Request) {
  try {
    const user = await first('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user!.id]);
    const userId = prop(user, 'id');
    const summaries: { title: string; summary: string }[] = [];
    let counter = 1;

    const business = await first('SELECT * FROM businesses WHERE user_id = ? AND user_id IS NOT NULL LIMIT 1', [userId]);
    if (business) {
      const detail = await first(
        'SELECT * FROM business_details WHERE business_id = ? AND business_id IS NOT NULL LIMIT 1',
        [business.id],
      );
      const raw = translatedAttr(prop(detail, 'summaries'));
      if (truthy(raw)) {
        const data = jsonDecode(phpStr(raw));
        if (isPhpArray(data)) {
          for (const item of phpValues(data)) {
            const desc = isPhpArray(item) && !Array.isArray(item) ? (item as Record<string, unknown>).description : undefined;
            if (typeof desc === 'string') {
              summaries.push({ title: `About us ${counter}`, summary: desc });
              counter++;
            }
          }
        }
      }
    }

    // $user->businessUser->businessUserLocation->location->location_name ?? null
    let location: unknown = null;
    const bu = await first('SELECT * FROM business_users WHERE user_id = ? AND user_id IS NOT NULL LIMIT 1', [userId]);
    if (bu) {
      const bul = await first(
        'SELECT * FROM business_users_location WHERE business_user_id = ? AND business_user_id IS NOT NULL LIMIT 1',
        [bu.id],
      );
      if (bul && bul.location_id !== null) {
        const loc = await first('SELECT * FROM locations WHERE id = ? LIMIT 1', [bul.location_id]);
        if (loc) location = translatedAttr(loc.location_name) ?? null;
      }
    }

    return sendResponse(true, 'Business summary fetched successfully', { data: summaries, location });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error retrieving getting details.', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-about-us */
export async function aboutUs(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { stateName: 'required|string', cityName: 'required|string', language: 'required|in:en,hi' }, {
      'cityName.required': 'City is required.',
      'stateName.required': 'State is required.',
      'language.required': 'Language is required.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const language = input.language;
    const cityName = input.cityName;
    const getcity =
      language === 'hi'
        ? await first('SELECT * FROM pincodes WHERE city_hi = ? LIMIT 1', [cityName])
        : await first('SELECT * FROM pincodes WHERE city = ? LIMIT 1', [cityName]);

    const am = language === 'hi' ? 'about_mediator_hi' : 'about_mediator';
    const kc = language === 'hi' ? 'know_your_city_hi' : 'know_your_city';
    const [sw, sp] = eq('state', getcity?.state ?? null);
    const [cw, cp] = eq('city', getcity?.city ?? null);
    const about = await first(
      `SELECT ${am} as about_mediator,${kc} as know_your_city,tourist_places as tourist_places FROM about_uses WHERE ${sw} AND ${cw} LIMIT 1`,
      [...sp, ...cp],
    );
    if (!about) return sendResponse(false, 'No data found.', {});

    const places = jsonDecode(about.tourist_places);
    const mappedPlaces: Record<string, unknown>[] = [];
    if (isPhpArray(places)) {
      const root = url(req, '').replace(/\/+$/, '');
      for (const place of phpValues(places)) {
        const get = (k: string): unknown =>
          isPhpArray(place) && !Array.isArray(place) ? ((place as Record<string, unknown>)[k] ?? '') : '';
        const placeName = language === 'hi' ? get('place_name_hi') : get('place_name');
        const placeDesc = language === 'hi' ? get('place_description_hi') : get('place_description');
        const imagePath = phpStr(get('place_image'));
        const rel = imagePath.replace(/^\/+/, '');
        const full = imagePath.includes('uploads/') ? `${root}/${rel}` : `${root}/uploads/tourist_place_images/${rel}`;
        mappedPlaces.push({ place_name: placeName, place_description: placeDesc, place_img: full });
      }
    }

    return sendResponse(true, 'About Us retrieved successfully.', {
      aboutUs: { about_mediator: about.about_mediator, know_your_city: about.know_your_city, tourist_places: mappedPlaces },
    });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error in aboutUs()', { message: errorMessage(e) });
    return sendCatchLog(errorMessage(e));
  }
}
