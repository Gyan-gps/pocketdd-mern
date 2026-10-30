// Port of the "ADMIN PANEL Routes" block of routes/api.php (pocketdd-admin): lookup methods on the Admin
// CRUD controllers + App\Helpers\General::quickTranslate. Keep behaviour 1:1 with the PHP.
// These routes are outside every middleware group (no auth, no api_failures logging).
import type { Request, Response } from 'express';
import { errorMessage } from '../core/http/response.js';
import { phpTrim } from '../utils/php/values.js';
import { transliterateEnglishToHindi } from '../utils/hindi/transliterate.js';
import type { Row } from '../db/mongo.js';
import type { AnyModel } from '../models/index.js';
import { Administrator } from '../models/administrator.model.js';
import { BusinessUser } from '../models/business-user.model.js';
import { CityHelplineNumber } from '../models/city-helpline-number.model.js';
import { Event } from '../models/event.model.js';
import {
  findAddresses,
  findAddressPincodeIds,
  findPincodeCitiesOfState,
  findPincodes,
  findSubCategoriesOfCategory,
  firstAddress,
  firstBusinessCategory,
  firstPincode,
  looseValues,
  pluckPincodeIds,
} from '../services/admin-lookups.service.js';

/** Send `response()->json($data, $status)`. */
function json(res: Response, data: unknown, status = 200): undefined {
  res.status(status).json(data);
  return undefined;
}

const routeParam = (req: Request, name: string): string => req.params[name];

/** PHP truthiness of a string/scalar (`'0'` and `''` are falsy). */
function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === 0 || value === '' || value === '0') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

const isNumericString = (text: string) => /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(text);

/** PHP 8 loose `==` (used by Collection::unique() / in_array non-strict). */
function looseEq(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === undefined) left = null;
  if (right === undefined) right = null;
  if (left === null && right === null) return true;
  if (typeof left === 'boolean' || typeof right === 'boolean') return truthy(left) === truthy(right);
  if (left === null || right === null) {
    const other = left === null ? right : left;
    if (typeof other === 'string') return other === '';
    return !truthy(other);
  }
  if (typeof left === 'number' && typeof right === 'number') return left === right;
  if (typeof left === 'number' || typeof right === 'number') {
    const number = (typeof left === 'number' ? left : right) as number;
    const other = typeof left === 'number' ? right : left;
    if (typeof other === 'string') return isNumericString(other) ? Number(other) === number : String(number) === other;
    return false;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return isNumericString(left) && isNumericString(right) ? Number(left) === Number(right) : false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Collection::unique($key) — keeps the first item for each (loosely compared) key value. */
function uniqueBy<T>(items: T[], getKey: (item: T) => unknown): T[] {
  const seen: unknown[] = [];
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.some((seenKey) => looseEq(seenKey, key))) return false;
    seen.push(key);
    return true;
  });
}

/**
 * json_decode($v, true) as PHP sees it after re-encoding: objects whose keys are 0..n-1 (incl. `{}`) become
 * lists. Laravel quirk: an empty JSON object in `area` comes back as `[]`.
 * (JS objects reorder integer-like keys; PHP keeps insertion order — not reproducible for such keys.)
 */
function phpArrayify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(phpArrayify);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.every(([key], i) => key === String(i))) return entries.map(([, entry]) => phpArrayify(entry));
    return Object.fromEntries(entries.map(([key, entry]) => [key, phpArrayify(entry)]));
  }
  return value;
}

/** Eloquent `array` cast: json_decode($value, true) (null for null / invalid JSON). */
function decodeArrayCast(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  // Stored natively now (a string is a decoded JSON string literal).
  return phpArrayify(value);
}

const isPhpArray = (value: unknown): value is unknown[] | Record<string, unknown> => value !== null && typeof value === 'object';
const phpValues = (value: unknown[] | Record<string, unknown>) => (Array.isArray(value) ? value : Object.values(value));

/** collect($x)->all() — null → [], array → values kept, scalar → [scalar]. */
function collect(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  if (isPhpArray(value)) return phpValues(value);
  return [value];
}

/** data_get($item, $key) for one plain key. */
function dataGet(item: unknown, key: string): unknown {
  if (isPhpArray(item) && !Array.isArray(item)) return item[key] ?? null;
  if (Array.isArray(item)) return /^\d+$/.test(key) ? (item[Number(key)] ?? null) : null;
  return null;
}

// --------------------------------------------------------------------------------------------------
// BusinessCrudController

/** GET get-business-sub-categories/{categoryId} */
export async function getBusinessSubCategories(req: Request) {
  const subCategories = await findSubCategoriesOfCategory(routeParam(req, 'categoryId'));
  // Laravel quirk: `if (!$category)` is never true for a Collection.
  return { data: subCategories.map((subCategory) => ({ id: subCategory.id, name: subCategory.name, name_hi: subCategory.name_hi })) };
}

/** getStateCities — identical in Business/Address/BusinessUser/CityHelplineNumber/Event/Administrator/AboutUs. */
export async function getStateCities(req: Request, res: Response) {
  try {
    // GROUP BY via a temporary table: groups in first-appearance order, case-insensitive.
    const pincodes = await findPincodeCitiesOfState(routeParam(req, 'state'));
    const seen = new Set<string>();
    const cities = pincodes.filter((pincode) => {
      const key = pincode.city === null || pincode.city === undefined ? '\0null' : String(pincode.city).toLowerCase().trimEnd();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return json(res, { success: true, data: cities.map((pincode) => ({ city: pincode.city ?? null })) }, 200);
  } catch (error) {
    // Laravel quirk: returns $e->getTraceAsString() (a PHP stack trace) — not reproducible; message used.
    return json(res, { success: false, message: errorMessage(error) }, 500);
  }
}

async function pincodesByStateCity(state: string, city: string, excludeIds?: unknown[]) {
  const filter: Row = { state: { $in: looseValues(state) }, city: { $in: looseValues(city) } };
  if (excludeIds && excludeIds.length) {
    // `NOT IN (..., NULL)` is never true.
    if (excludeIds.some((id) => id === null || id === undefined)) return [];
    filter._id = { $nin: excludeIds.flatMap(looseValues) };
  }
  const pincodes = await findPincodes(filter);
  return uniqueBy(pincodes, (pincode) => pincode.pin_code).map((pincode) => ({ id: pincode.id, pin_code: pincode.pin_code }));
}

/**
 * getPincodeByStateCity for Business (no pluck) and BusinessUser/CityHelplineNumber/Event/Administrator
 * (pluck('pincode_id') whose result is unused — whereNotIn is commented out in the PHP — but the query runs).
 */
function pincodeByStateCity(pluckModel: AnyModel | null, errorStatus: number) {
  return async (req: Request, res: Response) => {
    try {
      if (pluckModel) await pluckPincodeIds(pluckModel);
      const data = await pincodesByStateCity(routeParam(req, 'state'), routeParam(req, 'city'));
      return json(res, { success: true, data }, 200);
    } catch (error) {
      return json(res, { success: false, message: errorMessage(error) }, errorStatus);
    }
  };
}
export const businessGetPincodeByStateCity = pincodeByStateCity(null, 500);
// Laravel quirk: BusinessUser and Event answer DB errors with 404, the others with 500.
export const businessUserGetPincodeByStateCity = pincodeByStateCity(BusinessUser, 404);
export const helplineGetPincodeByStateCity = pincodeByStateCity(CityHelplineNumber, 500);
export const eventGetPincodeByStateCity = pincodeByStateCity(Event, 404);
export const administratorGetPincodeByStateCity = pincodeByStateCity(Administrator, 500);

/** AddressCrudController::getPincodeByStateCity — excludes pincodes already used by an address. */
export async function addressGetPincodeByStateCity(req: Request, res: Response) {
  try {
    const usedPincodeIds = (await findAddressPincodeIds()).map((address) => address.pincode_id ?? null);
    // Laravel quirk: a NULL pincode_id in addresses makes `NOT IN (..., NULL)` match nothing.
    const data = await pincodesByStateCity(routeParam(req, 'state'), routeParam(req, 'city'), usedPincodeIds);
    return json(res, { success: true, data }, 200);
  } catch (error) {
    return json(res, { success: false, message: errorMessage(error) }, 500);
  }
}

/** GET get-tehsil-area/{state}/{district}/{pincodeId} */
export async function getTehsilAndAreaByPincode(req: Request, res: Response) {
  try {
    let tehsil: unknown = null;
    let areas: unknown[] = [];
    const address = await firstAddress(routeParam(req, 'state'), routeParam(req, 'district'), routeParam(req, 'pincodeId'));
    if (address) {
      tehsil = address.tehsil;
      areas = uniqueBy(collect(decodeArrayCast(address.area)), (area) => dataGet(area, 'area_name'));
    }
    return json(res, { tehsil, area: areas });
  } catch (error) {
    // Laravel quirk: HTTP 200 with "status": 500 in the body.
    return json(res, { message: errorMessage(error), status: 500 });
  }
}

/** GET get-hindi-state/{state} */
export async function getHindiState(req: Request, res: Response) {
  try {
    const state = routeParam(req, 'state');
    const pincode = await firstPincode({ state: { $in: looseValues(state) } }, ['state_hi']);
    // Laravel quirk: checks the route param, not the query result ('0' is falsy in PHP).
    if (truthy(state)) return json(res, { data: pincode ? { state_hi: pincode.state_hi } : null });
    return json(res, { data: null }, 404);
  } catch (error) {
    return json(res, { message: errorMessage(error), status: 500 });
  }
}

/** GET get-hindi-district/{state}/{city} */
export async function getHindiDistrict(req: Request, res: Response) {
  try {
    const pincode = await firstPincode(
      { state: { $in: looseValues(routeParam(req, 'state')) }, city: { $in: looseValues(routeParam(req, 'city')) } },
      ['city_hi'],
    );
    const cityName = pincode ? pincode.city_hi : null;
    if (truthy(cityName)) return json(res, { data: cityName }, 200);
    return json(res, { data: null }, 404);
  } catch (error) {
    return json(res, { message: errorMessage(error), status: 500 }, 500);
  }
}

/** GET get-hindi-tehsil/{state}/{city}/{pincode} */
export async function getHindiTehsil(req: Request, res: Response) {
  try {
    const address = await firstAddress(routeParam(req, 'state'), routeParam(req, 'city'), routeParam(req, 'pincode'), [
      'tehsil_hi',
    ]);
    const name = address ? address.tehsil_hi : null;
    if (truthy(name)) return json(res, { data: name }, 200);
    return json(res, { data: null }, 404);
  } catch (error) {
    return json(res, { message: errorMessage(error), status: 500 }, 500);
  }
}

/** GET get-hindi-area/{state}/{city}/{pincode} */
export async function getHindiArea(req: Request, res: Response) {
  try {
    const addresses = await findAddresses(routeParam(req, 'state'), routeParam(req, 'city'), routeParam(req, 'pincode'));
    if (addresses.length === 0) {
      // Laravel quirk: $areas is undefined → "Undefined variable" warning → ErrorException, caught → 500.
      return json(res, { message: 'Undefined variable $areas', status: 500 }, 500);
    }
    // pluck('area')->flatten(1)
    const flattened: unknown[] = [];
    for (const area of addresses.map((address) => decodeArrayCast(address.area))) {
      if (isPhpArray(area)) flattened.push(...phpValues(area));
      else flattened.push(area);
    }
    const areas = uniqueBy(flattened, (item) => dataGet(item, 'area_name_hi'))
      .map((item) => (isPhpArray(item) && !Array.isArray(item) ? (item.area_name_hi ?? null) : null))
      .filter(truthy);
    return json(res, { data: areas }, 200);
  } catch (error) {
    return json(res, { message: errorMessage(error), status: 500 }, 500);
  }
}

/** GET get-category-hindi/{categoryId} */
export async function getBusinessCategoriesHindi(req: Request, res: Response) {
  try {
    const category = await firstBusinessCategory({ _id: { $in: looseValues(routeParam(req, 'categoryId')) } }, ['name_hi']);
    const name = category ? category.name_hi : null;
    if (truthy(name)) return json(res, { data: name });
    return json(res, { data: null }, 404);
  } catch (error) {
    return json(res, { message: errorMessage(error), status: 500 });
  }
}

// --------------------------------------------------------------------------------------------------
// BusinessDetailCrudController

/** GET business-city/{Id} — no try/catch in the PHP. */
export async function getPincodeInfo(req: Request, res: Response) {
  const pincode = await firstPincode({ _id: { $in: looseValues(routeParam(req, 'Id')) } });
  if (!pincode) return json(res, { error: 'Pincode not found' }, 404);
  return json(res, { state: truthy(pincode.state) ? pincode.state : null, district: pincode.city ?? null });
}

// --------------------------------------------------------------------------------------------------
// BusinessUserCrudController / EventCrudController

/** getTehsilByUserCity — DB errors answered with 404 (both controllers). */
export async function getTehsilByUserCity(req: Request, res: Response) {
  try {
    const address = await firstAddress(routeParam(req, 'state'), routeParam(req, 'city'), routeParam(req, 'pincode'));
    const tehsil = address ? address.tehsil : null;
    return json(res, { success: true, message: 'Tehsil data is fetched successfully.', tehsil }, 200);
  } catch (error) {
    return json(res, { success: false, message: errorMessage(error) }, 404);
  }
}

// --------------------------------------------------------------------------------------------------
// PinCodeCrudController

/** GET pincode-codes/{state}/{city?} — no try/catch in the PHP. */
export async function getCodes(req: Request) {
  const city = req.params.city;
  const filter: Row = { state: { $in: looseValues(routeParam(req, 'state')) } };
  if (truthy(city)) filter.city = { $in: looseValues(city) };
  const data = await firstPincode(filter);
  return {
    status: true,
    data: {
      state_code: data?.state_code ?? '',
      district_code: data?.district_code ?? '',
    },
  };
}

// --------------------------------------------------------------------------------------------------
// App\Helpers\General

/** GET translate-to-hindi/{department} */
export async function quickTranslate(req: Request, res: Response) {
  const text = phpTrim(routeParam(req, 'department'));
  if (!truthy(text)) return json(res, { error: 'Input text is required.' }, 400); // empty('0') is true
  const transliterated = await transliterateEnglishToHindi(text);
  if (transliterated === '') return json(res, { error: 'Transliteration failed.' }, 500);
  return json(res, { data: { translated_text: transliterated } });
}
