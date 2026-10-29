// Port of App\Http\Controllers\Api\ApiController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import crypto from 'node:crypto';
import type { Request } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../../core/http/response.js';
import { nowDb, toModelJson } from '../../core/time.js';
import { appUrl, url } from '../../core/url.js';
import { validate } from '../../core/validation/validator.js';
import { C, col, intId, like, toRow, toRows, type Row } from '../../db/mongo.js';
import { phpTrim } from '../../utils/php/values.js';
import { unicodeToKrutidev } from '../../utils/hindi/krutidev.js';

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

/** MySQL string `=` / `ORDER BY` were case-insensitive. */
type Doc = { _id: number; [k: string]: any };
const CI = { locale: 'en', strength: 2 };

/** `where($col, $value)` — Laravel turns a null value into `whereNull`. */
const eq = (value: unknown) => (value === undefined ? null : value);

/** First embedded child row by id (the old child-table `LIMIT 1` returned PK order). */
const firstChild = (children: Row[] | undefined): Row | null =>
  children?.length ? [...children].sort((a, b) => a.id - b.id)[0] : null;

/** `findOne` in PK order, as a MySQL-shaped row. */
const findRow = async (collection: string, filter: Row, collation = true) =>
  toRow(await col<Doc>(collection).findOne(filter, { sort: { _id: 1 }, ...(collation ? { collation: CI } : {}) }));

/** The day after a `YYYY-MM-DD` date (`DATE(x) <= d` is `x < d + 1 day` on the stored strings). */
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** JSON_CONTAINS(target, candidate) for a scalar candidate (JSON strings compare case-sensitively). */
function jsonContains(target: unknown, candidate: unknown): boolean {
  if (Array.isArray(target)) return target.some((t) => jsonContains(t, candidate));
  if (target !== null && typeof target === 'object') return false;
  return target === candidate;
}

/** A JSON column read back: a stored string was invalid JSON (decoded to null) or double-encoded (a string). */
const castJson = (v: unknown) => (typeof v === 'string' ? (jsonDecode(v) === null ? null : v) : v);

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
  if (sep === -1) return findRow(C.tokens, { token: sha256(token) }, false);
  const id = intId(token.slice(0, sep));
  const instance = id === null ? null : await findRow(C.tokens, { _id: id }, false);
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
  const n = id === null || id === undefined ? null : intId(id);
  return n === null ? null : findRow(C.businesses, { _id: n }, false);
}

async function adsWithBusiness(req: Request, position: string, location: string) {
  const ads = await col<Doc>(C.advertisements)
    .find(
      { ads_position: position, ads_location: location, status: 1 },
      { projection: { _id: 0, advt_img: 1, client_name: 1 }, collation: CI, sort: { _id: 1 } },
    )
    .toArray();
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
  if ('sub_category_name' in out) out.sub_category_name = out.sub_category_name === null ? null : castJson(out.sub_category_name);
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
        const userData = await col<Doc>(C.businesses).findOne({ user_id: accessToken.tokenable_id }, { projection: { _id: 1 } });
        if (userData) isBusinessExists = true;
      }
    }

    const cats = await col<Doc>(C.businessCategories)
      .find({ status: 1 }, { projection: { [nameField]: 1, slug: 1, img: 1 }, collation: CI, sort: { [nameField]: 1, _id: 1 } })
      .toArray();
    const subCounts = new Map<unknown, number>();
    for (const g of await col<Doc>(C.businessSubCategories)
      .aggregate([{ $match: { status: 1, parent_id: { $in: cats.map((c) => c._id) } } }, { $group: { _id: '$parent_id', n: { $sum: 1 } } }])
      .toArray()) {
      subCounts.set(g._id, g.n);
    }
    const categoriesData = cats.map((c) => ({
      id: c._id,
      name: c[nameField] ?? null,
      slug: c.slug,
      img: c.img,
      subcategories_count: subCounts.get(c._id) ?? 0,
      category_icon: c.img ? appUrl(String(c.img)) : null,
      category_name: categoryName(c[nameField] ?? null),
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

    const cats = toRows(
      await col<Doc>(C.businessCategories)
        .find({ $or: [{ name: like(search) }, { name_hi: like(hindiSearch) }, { name_hi: like(search) }] }, { sort: { _id: 1 } })
        .toArray(),
    );
    const results: Record<string, unknown>[] = [];
    for (const item of cats) {
      const hasSub = await col<Doc>(C.businessSubCategories).findOne({ parent_id: item.id }, { projection: { _id: 1 } });
      const hasBiz = await col<Doc>(C.businesses).findOne({ business_category_id: item.id }, { projection: { _id: 1 } });
      results.push({
        id: item.id,
        name: language === 'hi' ? item.name_hi : item.name,
        slug: item.slug,
        img: laravelUrl(req, item.img),
        type: 'category',
        is_business: !hasSub && !!hasBiz,
      });
    }

    const subs = toRows(await col<Doc>(C.businessSubCategories).find({ name: like(search) }, { sort: { _id: 1 } }).toArray());
    for (const item of subs) {
      results.push({
        id: item.id,
        name: language === 'hi' ? (item.name_hi ?? null) : item.name,
        slug: item.slug,
        img: laravelUrl(req, item.img),
        type: 'subcategory',
      });
    }

    const bizFilter: Row = { $or: [{ business_name_en: like(search) }, { keywords: like(search) }] };
    if (truthy(location)) bizFilter.dist_en = location;
    for (const item of toRows(await col<Doc>(C.businesses).find(bizFilter, { collation: CI, sort: { _id: 1 } }).toArray())) {
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
    const category = await findRow(C.businessCategories, { slug: input.category_slug });

    const stateColumn = language === 'hi' ? 'state_hi' : 'state_en';
    const districtColumn = language === 'hi' ? 'dist_hi' : 'dist_en';

    if (category) {
      const token = bearerToken(req);
      if (truthy(token)) await findToken(token!); // user id only fed a commented-out filter

      const subs = await col<Doc>(C.businessSubCategories)
        .find(
          { parent_id: category.id, status: 1 },
          { projection: { [nameField]: 1, slug: 1, status: 1, img: 1 }, collation: CI, sort: { [nameField]: 1, _id: 1 } },
        )
        .toArray();
      const bizCounts = new Map<unknown, number>();
      for (const g of await col<Doc>(C.businesses)
        .aggregate(
          [
            {
              $match: {
                business_sub_category_id: { $in: subs.map((s) => s._id) },
                status: 1,
                [stateColumn]: eq(stateName),
                [districtColumn]: eq(cityName),
              },
            },
            { $group: { _id: '$business_sub_category_id', n: { $sum: 1 } } },
          ],
          { collation: CI },
        )
        .toArray()) {
        bizCounts.set(g._id, g.n);
      }
      const subcategories = subs.map((s) => ({
        id: s._id,
        name: s[nameField] ?? null,
        slug: s.slug,
        status: s.status,
        img: s.img,
        businesses_count: bizCounts.get(s._id) ?? 0,
        category_icon: s.img ? appUrl(String(s.img)) : null,
        category_name: categoryName(s[nameField] ?? null),
      }));

      const adImgs = await col<Doc>(C.advertisements)
        .find(
          { ads_position: 'inner', ads_location: 'All Subcategory Page', status: 1 },
          { projection: { _id: 0, advt_img: 1 }, collation: CI, sort: { _id: 1 } },
        )
        .toArray();
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
    const user = await findRow(C.users, { _id: Number(req.user!.id) }, false);
    const userId = prop(user, 'id');
    const businessUser = userId === null ? null : await findRow(C.businessUsers, { user_id: userId }, false);
    if (!businessUser) return sendResponse(true, 'Business User has not any location set.');
    const loc = firstChild(businessUser.locations);
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

    const city = await findRow(C.pincodes, { $or: [{ city_hi: eq(cityNameInput) }, { city: eq(cityNameInput) }] });
    const state = await findRow(C.pincodes, { $or: [{ state_hi: eq(stateNameInput) }, { state: eq(stateNameInput) }] });

    const cityName = language === 'hi' ? prop(city, 'city_hi') : prop(city, 'city');
    const stateName = language === 'hi' ? (state?.state_hi ?? null) : (state?.state ?? null);

    let businessSubCategory: Row | null;
    let currentSubCategoryNameEn: unknown = '';
    const distCol = language === 'hi' ? 'dist_hi' : 'dist_en';
    const orderCol = language === 'hi' ? 'business_name_hi' : 'business_name_en';
    const today = nowDb().slice(0, 10);
    // date(from_date) <= today AND date(exp_date) >= today, on the stored strings.
    const filter: Row = {
      [distCol]: eq(cityName),
      status: 1,
      to_show: 1,
      from_date: { $lt: nextDay(today) },
      exp_date: { $gte: today },
    };

    if (!truthy(input.is_business)) {
      businessSubCategory = await findRow(C.businessSubCategories, { slug: input.slug });
      currentSubCategoryNameEn = prop(businessSubCategory, 'name_en');
      const sub = businessSubCategory!;
      subCategoryName = language === 'hi' ? (sub.name_hi ?? sub.name_en ?? null) : (sub.name_en ?? sub.name ?? null);

      const category = await findRow(C.businessCategories, { _id: eq(sub.parent_id) }, false);
      categoryName = category
        ? language === 'hi'
          ? (category.name_hi ?? category.name_en ?? null)
          : (category.name_en ?? category.name ?? null)
        : null;

      filter.business_sub_category_id = eq(sub.id);
      // SQL `!=` never matches NULL.
      filter.business_name_en = { $nin: [null, 'Pocket DD Desk'] };
      filter.business_name_hi = { $nin: [null, 'पॉकेट डीडी डेस्क'] };
    } else {
      businessSubCategory = await findRow(C.businessCategories, { slug: input.slug });
      const sub = businessSubCategory;
      // `$x->name_hi ?? $x->name` — the right-hand side of ?? is not null-safe, so a missing category warns on "name".
      subCategoryName = language === 'hi' ? (sub?.name_hi ?? prop(sub, 'name')) : (sub?.name ?? prop(sub, 'name'));
      filter.business_category_id = eq(prop(sub, 'id'));
    }
    void currentSubCategoryNameEn;

    const currentSubCategoryId = !truthy(input.is_business) ? businessSubCategory!.id : null;
    const currentSubCategoryName = subCategoryName;

    let searchSubCategory = currentSubCategoryName;
    if (language === 'hi') {
      const sc = await findRow(C.businessSubCategories, { name_hi: eq(currentSubCategoryName) });
      if (sc) searchSubCategory = sc.name;
    }
    // advertisments LEFT JOIN businesses ON businesses.id = client_name, filtered in code.
    const candidates = await col<Doc>(C.advertisements)
      .find(
        { ads_position: 'inner', status: 1, ads_location: { $in: ['Same Category/Subcategory Page', 'Multiple Category/Subcategory Page'] } },
        { collation: CI, sort: { _id: 1 } },
      )
      .toArray();
    const sameLocation = (ad: Row) => String(ad.ads_location).toLowerCase() === 'same category/subcategory page';
    const clientIds = [
      ...new Set(candidates.filter(sameLocation).map((ad) => (ad.client_name == null ? null : intId(ad.client_name))).filter((n) => n !== null)),
    ];
    const clientSub = new Map<number, unknown>();
    if (clientIds.length) {
      for (const b of await col<Doc>(C.businesses)
        .find({ _id: { $in: clientIds } }, { projection: { business_sub_category_id: 1 } })
        .toArray()) {
        clientSub.set(b._id as number, b.business_sub_category_id ?? null);
      }
    }
    const ads = candidates
      .filter((ad) => {
        if (sameLocation(ad)) {
          const id = ad.client_name == null ? null : intId(ad.client_name);
          const joined = id !== null && clientSub.has(id) ? clientSub.get(id) : null;
          return currentSubCategoryId === null || currentSubCategoryId === undefined
            ? joined === null
            : joined !== null && Number(joined) === Number(currentSubCategoryId);
        }
        return ad.sub_category_name !== null && jsonContains(castJson(ad.sub_category_name), searchSubCategory ?? null);
      })
      .map(({ _id, subcategories: _children, ...rest }) => ({ id: _id, ...rest }));
    const getAdvertisementData = ads.map(serializeAdvertisment);

    const token = bearerToken(req);
    if (truthy(token)) await findToken(token!);

    if (truthy(tehsilName)) filter.tehsil_en = tehsilName;
    if (truthy(areaName) && isPhpArray(areaName)) filter.area_en = { $in: phpValues(areaName) };
    const businesses = await col<Doc>(C.businesses).find(filter, { collation: CI, sort: { [orderCol]: 1, _id: 1 } }).toArray();

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
    const b = await findRow(C.businesses, { slug: input.slug });
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
    // It is stored decoded once, so a string left in it is decoded again (invalid JSON → null).
    let social: unknown = b.social_media_url === null || b.social_media_url === '' ? null : b.social_media_url;
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
    const user = await findRow(C.users, { _id: Number(req.user!.id) }, false);
    const userId = prop(user, 'id');
    const summaries: { title: string; summary: string }[] = [];
    let counter = 1;

    const business = userId === null ? null : await findRow(C.businesses, { user_id: userId }, false);
    if (business) {
      const detail = firstChild(business.details);
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
    const bu = userId === null ? null : await findRow(C.businessUsers, { user_id: userId }, false);
    if (bu) {
      const bul = firstChild(bu.locations);
      if (bul && bul.location_id != null) {
        const loc = await findRow(C.locations, { _id: bul.location_id }, false);
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
        ? await findRow(C.pincodes, { city_hi: cityName })
        : await findRow(C.pincodes, { city: cityName });

    const am = language === 'hi' ? 'about_mediator_hi' : 'about_mediator';
    const kc = language === 'hi' ? 'know_your_city_hi' : 'know_your_city';
    const doc = await findRow(C.aboutUs, { state: getcity?.state ?? null, city: getcity?.city ?? null });
    if (!doc) return sendResponse(false, 'No data found.', {});
    const about = { about_mediator: doc[am] ?? null, know_your_city: doc[kc] ?? null };

    // Stored decoded; a string left in it never decoded to an array.
    const places = doc.tourist_places;
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
