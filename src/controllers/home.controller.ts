// Port of App\Http\Controllers\Api\ApiController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import crypto from 'node:crypto';
import type { Request } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../core/http/response.js';
import { nowDb, toModelJson } from '../core/time.js';
import { appUrl, url } from '../core/url.js';
import { validateRequest } from '../core/validation/validator.js';
import { intId, like, type Row } from '../db/mongo.js';
import {
  countActiveSubCategoriesByCategory,
  countBusinessesBySubCategory,
  findAboutUs,
  findActiveAdsWithClient,
  findActiveCategories,
  findActiveSubCategories,
  findBusiness,
  findBusinessBySlug,
  findBusinessByUserId,
  findBusinessIdInCategory,
  findBusinessIdOfUser,
  findBusinessSubCategoryIds,
  findBusinessUserByUserId,
  findCategoryById,
  findCategoryBySlug,
  findCategoryPageAds,
  findInnerAdImages,
  findListedBusinesses,
  findLocationById,
  findPincode,
  findSubCategoryByHindiName,
  findSubCategoryBySlug,
  findSubCategoryIdInCategory,
  findTokenByHash,
  findTokenById,
  findUserById,
  searchBusinesses,
  searchCategories,
  searchSubCategories,
} from '../services/home.service.js';
import { phpTrim } from '../utils/php/values.js';
import { unicodeToKrutidev } from '../utils/hindi/krutidev.js';
import {
  aboutUsValidation,
  allBusinessValidation,
  businessDetailsValidation,
  businessSubCategoriesValidation,
  dashboardDataValidation,
  homeCategorySearchValidation,
} from '../validators/home.validator.js';

// ---------------------------------------------------------------------------------------------
// PHP / Laravel semantics helpers
// ---------------------------------------------------------------------------------------------

/** PHP truthiness. */
const truthy = (value: unknown): boolean => {
  if (value === null || value === undefined || value === false || value === 0 || value === '' || value === '0') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0 || 'originalname' in (value as object);
  return true;
};

/** PHP `array_filter()` without callback (values, original order). */
const arrayFilter = (values: unknown[]) => values.filter(truthy);

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
const eq = (value: unknown) => (value === undefined ? null : value);

/** First embedded child row by id (the old child-table `LIMIT 1` returned PK order). */
const firstChild = (children: Row[] | undefined): Row | null =>
  children?.length ? [...children].sort((a, b) => a.id - b.id)[0] : null;

/** The day after a `YYYY-MM-DD` date (`DATE(x) <= d` is `x < d + 1 day` on the stored strings). */
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** JSON_CONTAINS(target, candidate) for a scalar candidate (JSON strings compare case-sensitively). */
function jsonContains(target: unknown, candidate: unknown): boolean {
  if (Array.isArray(target)) return target.some((element) => jsonContains(element, candidate));
  if (target !== null && typeof target === 'object') return false;
  return target === candidate;
}

/** A JSON column read back: a stored string was invalid JSON (decoded to null) or double-encoded (a string). */
const castJson = (value: unknown) => (typeof value === 'string' ? (jsonDecode(value) === null ? null : value) : value);

/** PHP string coercion of DB/request scalars. */
const phpStr = (value: unknown): string =>
  value === null || value === undefined || value === false ? '' : value === true ? '1' : String(value);

/**
 * Laravel `url($path)`. `url(null)` returns the UrlGenerator instance, which json_encodes to `{}`.
 * Laravel quirk: kept, e.g. ads/businesses without an image serialize as `{}`.
 */
function laravelUrl(req: Request, path: unknown): string | Record<string, never> {
  if (path === null || path === undefined) return {};
  const pathString = phpStr(path);
  if (/^(#|\/\/|https?:\/\/|(mailto|tel|sms):)/i.test(pathString)) return pathString;
  const root = url(req, '').replace(/\/+$/, '');
  const queryIndex = pathString.indexOf('?');
  const [pathPart, query] =
    queryIndex === -1 ? [pathString, ''] : [pathString.slice(0, queryIndex), pathString.slice(queryIndex)];
  const trimmed = pathPart.replace(/^\/+|\/+$/g, '');
  return (root + '/' + trimmed).replace(/\/+$/, '') + query;
}

/** Laravel `$request->bearerToken()`. */
function bearerToken(req: Request): string | null {
  const header = req.get('authorization') ?? '';
  const position = header.toLowerCase().lastIndexOf('bearer ');
  if (position === -1) return null;
  const token = header.slice(position + 7);
  return token.includes(',') ? token.slice(0, token.indexOf(',')) : token;
}

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

/** Sanctum `PersonalAccessToken::findToken()` (no expiry / last_used_at handling). */
async function findToken(token: string): Promise<Row | null> {
  const separator = token.indexOf('|');
  if (separator === -1) return findTokenByHash(sha256(token));
  const tokenId = intId(token.slice(0, separator));
  const instance = tokenId === null ? null : await findTokenById(tokenId);
  if (!instance) return null;
  return String(instance.token) === sha256(token.slice(separator + 1)) ? instance : null;
}

/** json_decode($v, true) — null on invalid input. */
function jsonDecode(value: unknown): unknown {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const isPhpArray = (value: unknown): value is Record<string, unknown> | unknown[] => !!value && typeof value === 'object';
const phpValues = (value: Record<string, unknown> | unknown[]) => (Array.isArray(value) ? value : Object.values(value));

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
// Shared response shaping
// ---------------------------------------------------------------------------------------------

async function adsWithBusiness(req: Request, position: string, location: string) {
  const advertisements = await findActiveAdsWithClient(position, location);
  const results = [];
  for (const advertisement of advertisements) {
    const business = await findBusiness(advertisement.client_name);
    results.push({
      advt_img: laravelUrl(req, advertisement.advt_img),
      business: business
        ? {
            id: business.id,
            business_name: business.business_name_en ?? business.business_name_hi ?? null,
            slug: business.slug,
          }
        : null,
    });
  }
  return results;
}

/** Advertisment model JSON: columns, casts (from_date/to_date date, sub_category_name array), appends. */
function serializeAdvertisment(row: Row): Record<string, unknown> {
  const json: Record<string, unknown> = { ...row };
  for (const key of ['from_date', 'to_date']) {
    if (key in json) json[key] = json[key] ? toModelJson(String(json[key]).slice(0, 10)) : null;
  }
  for (const key of ['created_at', 'updated_at']) if (key in json) json[key] = toModelJson(json[key] as string | null);
  if ('sub_category_name' in json) {
    json.sub_category_name = json.sub_category_name === null ? null : castJson(json.sub_category_name);
  }
  json.advertisment_icon = row.advt_img ? appUrl(String(row.advt_img)) : null;
  return json;
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/** POST get-dashboard-data */
export async function getDashboardData(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, dashboardDataValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const language = input.language;
    let isBusinessExists = false;
    const nameField = language === 'en' ? 'name' : 'name_hi';
    const token = bearerToken(req);
    if (truthy(token)) {
      const accessToken = await findToken(token!);
      if (accessToken) {
        const userData = await findBusinessIdOfUser(accessToken.tokenable_id);
        if (userData) isBusinessExists = true;
      }
    }

    const categories = await findActiveCategories(nameField);
    const subCategoryCounts = new Map<unknown, number>();
    for (const group of await countActiveSubCategoriesByCategory(categories.map((category) => category._id))) {
      subCategoryCounts.set(group._id, group.n);
    }
    const categoriesData = categories.map((category) => ({
      id: category._id,
      name: category[nameField] ?? null,
      slug: category.slug,
      img: category.img,
      subcategories_count: subCategoryCounts.get(category._id) ?? 0,
      category_icon: category.img ? appUrl(String(category.img)) : null,
      category_name: categoryName(category[nameField] ?? null),
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
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error retrieving getting dashboard data', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-dashboard-search-categories */
export async function homeCategorySearch(req: Request) {
  try {
    const input = req.input;
    // $request->filled('search')
    const rawSearch = input.search;
    const isEmptyString =
      rawSearch === null ||
      rawSearch === undefined ||
      (typeof rawSearch !== 'boolean' &&
        !Array.isArray(rawSearch) &&
        typeof rawSearch !== 'object' &&
        phpTrim(String(rawSearch)) === '');
    if (isEmptyString) return sendResponse(true, 'No items found.', { data: [] });

    const validation = await validateRequest(input, homeCategorySearchValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const search = String(input.search);
    const location = input.location;
    const language = input.language;
    const hindiSearch = unicodeToKrutidev(search);

    const categories = await searchCategories(search, hindiSearch);
    const results: Record<string, unknown>[] = [];
    for (const category of categories) {
      const hasSubCategory = await findSubCategoryIdInCategory(category.id);
      const hasBusiness = await findBusinessIdInCategory(category.id);
      results.push({
        id: category.id,
        name: language === 'hi' ? category.name_hi : category.name,
        slug: category.slug,
        img: laravelUrl(req, category.img),
        type: 'category',
        is_business: !hasSubCategory && !!hasBusiness,
      });
    }

    const subCategories = await searchSubCategories(search);
    for (const subCategory of subCategories) {
      results.push({
        id: subCategory.id,
        name: language === 'hi' ? (subCategory.name_hi ?? null) : subCategory.name,
        slug: subCategory.slug,
        img: laravelUrl(req, subCategory.img),
        type: 'subcategory',
      });
    }

    const businessFilter: Row = { $or: [{ business_name_en: like(search) }, { keywords: like(search) }] };
    if (truthy(location)) businessFilter.dist_en = location;
    for (const business of await searchBusinesses(businessFilter)) {
      results.push({
        id: business.id,
        name: language === 'hi' ? business.business_name_hi : business.business_name_en,
        slug: business.slug,
        img: laravelUrl(req, business.logo),
        type: 'business',
      });
    }

    if (!results.length) return sendResponse(true, 'No items found.', { data: [] });
    return sendResponse(true, 'Search results found.', { data: results });
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error in homeCategorySearch', { error: errorMessage(error) });
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-business-subcategories */
export async function getBusinessSubCategories(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, businessSubCategoriesValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const language = input.language;
    const nameField = language === 'en' ? 'name' : 'name_hi';
    const stateName = input.stateName ?? null;
    const cityName = input.cityName;
    const category = await findCategoryBySlug(input.category_slug);

    const stateColumn = language === 'hi' ? 'state_hi' : 'state_en';
    const districtColumn = language === 'hi' ? 'dist_hi' : 'dist_en';

    if (category) {
      const token = bearerToken(req);
      if (truthy(token)) await findToken(token!); // user id only fed a commented-out filter

      const subCategoryRows = await findActiveSubCategories(category.id, nameField);
      const businessCounts = new Map<unknown, number>();
      for (const group of await countBusinessesBySubCategory({
        business_sub_category_id: { $in: subCategoryRows.map((subCategory) => subCategory._id) },
        status: 1,
        [stateColumn]: eq(stateName),
        [districtColumn]: eq(cityName),
      })) {
        businessCounts.set(group._id, group.n);
      }
      const subcategories = subCategoryRows.map((subCategory) => ({
        id: subCategory._id,
        name: subCategory[nameField] ?? null,
        slug: subCategory.slug,
        status: subCategory.status,
        img: subCategory.img,
        businesses_count: businessCounts.get(subCategory._id) ?? 0,
        category_icon: subCategory.img ? appUrl(String(subCategory.img)) : null,
        category_name: categoryName(subCategory[nameField] ?? null),
      }));

      const advertisementImages = await findInnerAdImages('All Subcategory Page');
      const advertisement = advertisementImages.map((advertisementImage) => laravelUrl(req, advertisementImage.advt_img));

      if (subcategories.length) {
        return sendResponse(true, 'Sub-Categories retrieved.', { subcategories, cityName: input.cityName, advertisement });
      }
      return sendResponse(true, 'Sub-Categories Not Found in Records.', { subcategories: [], cityName: input.cityName });
    }
    return sendResponse(false, 'Category not found.');
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error retrieving the sub-categories', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST search-business-sub-category (auth:sanctum) */
export async function searchBusinessSubCategory(req: Request) {
  try {
    const search = req.input.search;
    const user = await findUserById(Number(req.user!.id));
    const userId = prop(user, 'id');
    const businessUser = userId === null ? null : await findBusinessUserByUserId(userId);
    if (!businessUser) return sendResponse(true, 'Business User has not any location set.');
    const businessUserLocation = firstChild(businessUser.locations);
    prop(businessUserLocation, 'language');
    if (!truthy(search)) return { status: false, message: 'No Items found' };

    // Laravel quirk: BusinessSubCategory::getSearchedBusinessSubCategories() does not exist, so the
    // forwarded call throws BadMethodCallException (an \Exception) and this always ends in sendCatchLog().
    throw new Error('Call to undefined method App\\Models\\BusinessSubCategory::getSearchedBusinessSubCategories()');
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error retrieving getting dashboard categories', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-all-businesses */
export async function getAllBusiness(req: Request) {
  let subCategoryName: unknown = '';
  let categoryName: unknown = '';
  try {
    const input = req.input;
    const validation = await validateRequest(input, allBusinessValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const language = input.language as string;
    const tehsilName = input.tehsilName ?? null;
    const areaName = input.areaName ?? null;
    const cityNameInput = input.cityName ?? null;
    const stateNameInput = input.stateName ?? null;

    const city = await findPincode({ $or: [{ city_hi: eq(cityNameInput) }, { city: eq(cityNameInput) }] });
    const state = await findPincode({ $or: [{ state_hi: eq(stateNameInput) }, { state: eq(stateNameInput) }] });

    const cityName = language === 'hi' ? prop(city, 'city_hi') : prop(city, 'city');
    const stateName = language === 'hi' ? (state?.state_hi ?? null) : (state?.state ?? null);

    let businessSubCategory: Row | null;
    let currentSubCategoryNameEn: unknown = '';
    const districtColumn = language === 'hi' ? 'dist_hi' : 'dist_en';
    const orderByField = language === 'hi' ? 'business_name_hi' : 'business_name_en';
    const today = nowDb().slice(0, 10);
    // date(from_date) <= today AND date(exp_date) >= today, on the stored strings.
    const filter: Row = {
      [districtColumn]: eq(cityName),
      status: 1,
      to_show: 1,
      from_date: { $lt: nextDay(today) },
      exp_date: { $gte: today },
    };

    if (!truthy(input.is_business)) {
      businessSubCategory = await findSubCategoryBySlug(input.slug);
      currentSubCategoryNameEn = prop(businessSubCategory, 'name_en');
      const subCategory = businessSubCategory!;
      subCategoryName =
        language === 'hi'
          ? (subCategory.name_hi ?? subCategory.name_en ?? null)
          : (subCategory.name_en ?? subCategory.name ?? null);

      const category = await findCategoryById(eq(subCategory.parent_id));
      categoryName = category
        ? language === 'hi'
          ? (category.name_hi ?? category.name_en ?? null)
          : (category.name_en ?? category.name ?? null)
        : null;

      filter.business_sub_category_id = eq(subCategory.id);
      // SQL `!=` never matches NULL.
      filter.business_name_en = { $nin: [null, 'Pocket DD Desk'] };
      filter.business_name_hi = { $nin: [null, 'पॉकेट डीडी डेस्क'] };
    } else {
      businessSubCategory = await findCategoryBySlug(input.slug);
      const category = businessSubCategory;
      // `$x->name_hi ?? $x->name` — the right-hand side of ?? is not null-safe, so a missing category warns on "name".
      subCategoryName =
        language === 'hi' ? (category?.name_hi ?? prop(category, 'name')) : (category?.name ?? prop(category, 'name'));
      filter.business_category_id = eq(prop(category, 'id'));
    }
    void currentSubCategoryNameEn;

    const currentSubCategoryId = !truthy(input.is_business) ? businessSubCategory!.id : null;
    const currentSubCategoryName = subCategoryName;

    let searchSubCategory = currentSubCategoryName;
    if (language === 'hi') {
      const hindiSubCategory = await findSubCategoryByHindiName(eq(currentSubCategoryName));
      if (hindiSubCategory) searchSubCategory = hindiSubCategory.name;
    }
    // advertisments LEFT JOIN businesses ON businesses.id = client_name, filtered in code.
    const candidates = await findCategoryPageAds();
    const sameLocation = (advertisement: Row) =>
      String(advertisement.ads_location).toLowerCase() === 'same category/subcategory page';
    const clientIds = [
      ...new Set(
        candidates
          .filter(sameLocation)
          .map((advertisement) => (advertisement.client_name == null ? null : intId(advertisement.client_name)))
          .filter((clientId) => clientId !== null),
      ),
    ];
    const clientSubCategory = new Map<number, unknown>();
    if (clientIds.length) {
      for (const client of await findBusinessSubCategoryIds(clientIds as number[])) {
        clientSubCategory.set(client._id as number, client.business_sub_category_id ?? null);
      }
    }
    const advertisements = candidates
      .filter((advertisement) => {
        if (sameLocation(advertisement)) {
          const clientId = advertisement.client_name == null ? null : intId(advertisement.client_name);
          const joined = clientId !== null && clientSubCategory.has(clientId) ? clientSubCategory.get(clientId) : null;
          return currentSubCategoryId === null || currentSubCategoryId === undefined
            ? joined === null
            : joined !== null && Number(joined) === Number(currentSubCategoryId);
        }
        return (
          advertisement.sub_category_name !== null &&
          jsonContains(castJson(advertisement.sub_category_name), searchSubCategory ?? null)
        );
      })
      .map(({ _id, subcategories: _children, ...rest }) => ({ id: _id, ...rest }));
    const getAdvertisementData = advertisements.map(serializeAdvertisment);

    const token = bearerToken(req);
    if (truthy(token)) await findToken(token!);

    if (truthy(tehsilName)) filter.tehsil_en = tehsilName;
    if (truthy(areaName) && isPhpArray(areaName)) filter.area_en = { $in: phpValues(areaName) };
    const businesses = await findListedBusinesses(filter, orderByField);

    const separator = language === 'hi' ? '] ' : ', ';
    const mapped = businesses.map((business) => {
      const contact = arrayFilter([
        business.business_contact_1,
        business.business_contact_2,
        business.business_contact_3,
        business.business_contact_4,
      ]);
      const parts = arrayFilter([
        language === 'hi' ? business.address_line_1_hi : business.address_line_1_en,
        language === 'hi' ? business.area_hi : business.area_en,
        language === 'hi' ? business.dist_hi : business.dist_en,
        language === 'hi' ? business.state_hi : business.state_en,
        business.pincode_hi,
      ]);
      return {
        business_name: language === 'hi' ? business.business_name_hi : business.business_name_en,
        slug: business.slug,
        contact,
        address: phpTrim(parts.map(phpStr).join(separator), separator),
        business_logo: laravelUrl(req, business.logo),
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
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error retrieving getting businesses under sub-category', [errorMessage(error)]);
    return { status: false, message: errorMessage(error), subCategoryName };
  }
}

/** POST get-all-business-details */
export async function getBusinessDetails(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, businessDetailsValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const language = input.language;
    const business = await findBusinessBySlug(input.slug);
    if (!business) return sendResponse(false, 'Business Not found!');

    const hindi = language === 'hi';
    const separator = language === 'hi' ? '] ' : ', ';
    const fullAddress = arrayFilter([
      hindi ? business.address_line_1_hi : business.address_line_1_en,
      hindi ? business.area_hi : business.area_en,
      hindi ? business.dist_hi : business.dist_en,
      hindi ? business.state_hi : business.state_en,
      phpStr(business.pincode_hi),
    ]);
    const contact = arrayFilter([
      business.business_contact_1,
      business.business_contact_2,
      business.business_contact_3,
      business.business_contact_4,
    ]);
    const images = arrayFilter([business.image_1, business.image_2, business.image_3, business.image_4]).map((image) =>
      laravelUrl(req, image),
    );

    // `social_media_url` has an 'array' cast; a double-encoded string is decoded once more.
    // It is stored decoded once, so a string left in it is decoded again (invalid JSON → null).
    let social: unknown =
      business.social_media_url === null || business.social_media_url === '' ? null : business.social_media_url;
    if (typeof social === 'string') social = jsonDecode(social);
    const socialList = social === null || social === undefined ? [] : isPhpArray(social) ? phpValues(social) : [social];
    const socialMedia = socialList.filter(
      (item) =>
        isPhpArray(item) &&
        !Array.isArray(item) &&
        (item as Record<string, unknown>).platform != null &&
        (item as Record<string, unknown>).url != null,
    );

    return sendResponse(true, 'Business Details fetched successfully', {
      data: {
        business_name: hindi ? business.business_name_hi : business.business_name_en,
        about: hindi ? business.about_hi : business.about_en,
        slug: business.slug,
        business_email: business.business_email,
        contact,
        address: phpTrim(fullAddress.map(phpStr).join(separator), separator),
        business_logo: laravelUrl(req, business.logo),
        images,
        social_media_url: socialMedia,
      },
    });
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error retrieving getting businesses Details', { message: errorMessage(error) });
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-all-business-summaries (auth:sanctum) */
export async function getAllBusinessSummaries(req: Request) {
  try {
    const user = await findUserById(Number(req.user!.id));
    const userId = prop(user, 'id');
    const summaries: { title: string; summary: string }[] = [];
    let counter = 1;

    const business = userId === null ? null : await findBusinessByUserId(userId);
    if (business) {
      const detail = firstChild(business.details);
      const raw = translatedAttr(prop(detail, 'summaries'));
      if (truthy(raw)) {
        const data = jsonDecode(phpStr(raw));
        if (isPhpArray(data)) {
          for (const item of phpValues(data)) {
            const description =
              isPhpArray(item) && !Array.isArray(item) ? (item as Record<string, unknown>).description : undefined;
            if (typeof description === 'string') {
              summaries.push({ title: `About us ${counter}`, summary: description });
              counter++;
            }
          }
        }
      }
    }

    // $user->businessUser->businessUserLocation->location->location_name ?? null
    let location: unknown = null;
    const businessUser = userId === null ? null : await findBusinessUserByUserId(userId);
    if (businessUser) {
      const businessUserLocation = firstChild(businessUser.locations);
      if (businessUserLocation && businessUserLocation.location_id != null) {
        const locationRow = await findLocationById(businessUserLocation.location_id);
        if (locationRow) location = translatedAttr(locationRow.location_name) ?? null;
      }
    }

    return sendResponse(true, 'Business summary fetched successfully', { data: summaries, location });
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error retrieving getting details.', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-about-us */
export async function aboutUs(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, aboutUsValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const language = input.language;
    const cityName = input.cityName;
    const getcity = language === 'hi' ? await findPincode({ city_hi: cityName }) : await findPincode({ city: cityName });

    const aboutMediatorField = language === 'hi' ? 'about_mediator_hi' : 'about_mediator';
    const knowYourCityField = language === 'hi' ? 'know_your_city_hi' : 'know_your_city';
    const aboutUsRow = await findAboutUs(getcity?.state ?? null, getcity?.city ?? null);
    if (!aboutUsRow) return sendResponse(false, 'No data found.', {});
    const about = {
      about_mediator: aboutUsRow[aboutMediatorField] ?? null,
      know_your_city: aboutUsRow[knowYourCityField] ?? null,
    };

    // Stored decoded; a string left in it never decoded to an array.
    const places = aboutUsRow.tourist_places;
    const mappedPlaces: Record<string, unknown>[] = [];
    if (isPhpArray(places)) {
      const root = url(req, '').replace(/\/+$/, '');
      for (const place of phpValues(places)) {
        const get = (key: string): unknown =>
          isPhpArray(place) && !Array.isArray(place) ? ((place as Record<string, unknown>)[key] ?? '') : '';
        const placeName = language === 'hi' ? get('place_name_hi') : get('place_name');
        const placeDescription = language === 'hi' ? get('place_description_hi') : get('place_description');
        const imagePath = phpStr(get('place_image'));
        const relativePath = imagePath.replace(/^\/+/, '');
        const fullUrl = imagePath.includes('uploads/')
          ? `${root}/${relativePath}`
          : `${root}/uploads/tourist_place_images/${relativePath}`;
        mappedPlaces.push({ place_name: placeName, place_description: placeDescription, place_img: fullUrl });
      }
    }

    return sendResponse(true, 'About Us retrieved successfully.', {
      aboutUs: { about_mediator: about.about_mediator, know_your_city: about.know_your_city, tourist_places: mappedPlaces },
    });
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error in aboutUs()', { message: errorMessage(error) });
    return sendCatchLog(errorMessage(error));
  }
}
