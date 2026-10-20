// Port of the "ADMIN PANEL Routes" block of routes/api.php (pocketdd-admin): lookup methods on the Admin
// CRUD controllers + App\Helpers\General::quickTranslate. Keep behaviour 1:1 with the PHP.
// These routes are outside every middleware group (no auth, no api_failures logging).
import type { Request, Response } from 'express';
import { errorMessage } from '../../core/http/respond.js';
import { phpTrim, transliterateEnglishToHindi } from '../../helpers/transliterate.js';
import { all, first } from '../../db/pool.js';

type Json = unknown;

/** Send `response()->json($data, $status)`. */
function json(res: Response, data: Json, status = 200): undefined {
  res.status(status).json(data);
  return undefined;
}

const p = (req: Request, k: string): string => req.params[k];

/** PHP truthiness of a string/scalar (`'0'` and `''` are falsy). */
function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === '' || v === '0') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

const isNumericStr = (s: string) => /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(s);

/** PHP 8 loose `==` (used by Collection::unique() / in_array non-strict). */
function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (a === null && b === null) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b);
  if (a === null || b === null) {
    const o = a === null ? b : a;
    if (typeof o === 'string') return o === '';
    return !truthy(o);
  }
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'number' || typeof b === 'number') {
    const n = (typeof a === 'number' ? a : b) as number;
    const s = typeof a === 'number' ? b : a;
    if (typeof s === 'string') return isNumericStr(s) ? Number(s) === n : String(n) === s;
    return false;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return isNumericStr(a) && isNumericStr(b) ? Number(a) === Number(b) : false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Collection::unique($key) — keeps the first item for each (loosely compared) key value. */
function uniqueBy<T>(items: T[], get: (i: T) => unknown): T[] {
  const seen: unknown[] = [];
  return items.filter((i) => {
    const id = get(i);
    if (seen.some((s) => looseEq(s, id))) return false;
    seen.push(id);
    return true;
  });
}

/**
 * json_decode($v, true) as PHP sees it after re-encoding: objects whose keys are 0..n-1 (incl. `{}`) become
 * lists. Laravel quirk: an empty JSON object in `area` comes back as `[]`.
 * (JS objects reorder integer-like keys; PHP keeps insertion order — not reproducible for such keys.)
 */
function phpArrayify(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(phpArrayify);
  if (v && typeof v === 'object') {
    const entries = Object.entries(v);
    if (entries.every(([k], i) => k === String(i))) return entries.map(([, x]) => phpArrayify(x));
    return Object.fromEntries(entries.map(([k, x]) => [k, phpArrayify(x)]));
  }
  return v;
}

/** Eloquent `array` cast: json_decode($value, true) (null for null / invalid JSON). */
function decodeArrayCast(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  try {
    return phpArrayify(JSON.parse(String(v)));
  } catch {
    return null;
  }
}

const isPhpArray = (v: unknown): v is unknown[] | Record<string, unknown> => v !== null && typeof v === 'object';
const phpValues = (v: unknown[] | Record<string, unknown>) => (Array.isArray(v) ? v : Object.values(v));

/** collect($x)->all() — null → [], array → values kept, scalar → [scalar]. */
function collect(v: unknown): unknown[] {
  if (v === null || v === undefined) return [];
  if (isPhpArray(v)) return phpValues(v);
  return [v];
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
  const rows = await all('select * from `business_sub_categories` where `parent_id` = ?', [p(req, 'categoryId')]);
  // Laravel quirk: `if (!$category)` is never true for a Collection.
  return { data: rows.map((s) => ({ id: s.id, name: s.name, name_hi: s.name_hi })) };
}

/** getStateCities — identical in Business/Address/BusinessUser/CityHelplineNumber/Event/Administrator/AboutUs. */
export async function getStateCities(req: Request, res: Response) {
  try {
    const cities = await all('select `city` from `pincodes` where `state` = ? group by `city`', [p(req, 'state')]);
    return json(res, { success: true, data: cities.map((c) => ({ city: c.city })) }, 200);
  } catch (e) {
    // Laravel quirk: returns $e->getTraceAsString() (a PHP stack trace) — not reproducible; message used.
    return json(res, { success: false, message: errorMessage(e) }, 500);
  }
}

async function pincodesByStateCity(state: string, city: string, excludeIds?: unknown[]) {
  let sql = 'select * from `pincodes` where `state` = ? and `city` = ?';
  const params: unknown[] = [state, city];
  if (excludeIds) {
    if (excludeIds.length === 0) sql += ' and 1 = 1';
    else {
      sql += ` and \`id\` not in (${excludeIds.map(() => '?').join(', ')})`;
      params.push(...excludeIds);
    }
  }
  const rows = await all(sql, params);
  return uniqueBy(rows, (r) => r.pin_code).map((r) => ({ id: r.id, pin_code: r.pin_code }));
}

/**
 * getPincodeByStateCity for Business (no pluck) and BusinessUser/CityHelplineNumber/Event/Administrator
 * (pluck('pincode_id') whose result is unused — whereNotIn is commented out in the PHP — but the query runs).
 */
function pincodeByStateCity(pluckTable: string | null, errorStatus: number) {
  return async (req: Request, res: Response) => {
    try {
      if (pluckTable) await all(`select \`pincode_id\` from \`${pluckTable}\``);
      const data = await pincodesByStateCity(p(req, 'state'), p(req, 'city'));
      return json(res, { success: true, data }, 200);
    } catch (e) {
      return json(res, { success: false, message: errorMessage(e) }, errorStatus);
    }
  };
}
export const businessGetPincodeByStateCity = pincodeByStateCity(null, 500);
// Laravel quirk: BusinessUser and Event answer DB errors with 404, the others with 500.
export const businessUserGetPincodeByStateCity = pincodeByStateCity('business_users', 404);
export const helplineGetPincodeByStateCity = pincodeByStateCity('city_helpline_numbers', 500);
export const eventGetPincodeByStateCity = pincodeByStateCity('events', 404);
export const administratorGetPincodeByStateCity = pincodeByStateCity('administrators', 500);

/** AddressCrudController::getPincodeByStateCity — excludes pincodes already used by an address. */
export async function addressGetPincodeByStateCity(req: Request, res: Response) {
  try {
    const used = (await all('select `pincode_id` from `addresses`')).map((r) => r.pincode_id);
    // Laravel quirk: a NULL pincode_id in addresses makes `NOT IN (..., NULL)` match nothing.
    const data = await pincodesByStateCity(p(req, 'state'), p(req, 'city'), used);
    return json(res, { success: true, data }, 200);
  } catch (e) {
    return json(res, { success: false, message: errorMessage(e) }, 500);
  }
}

const addressFirst = (state: string, city: string, pincode: string) =>
  first('select * from `addresses` where `state` = ? and `city` = ? and `pincode_id` = ? limit 1', [state, city, pincode]);

/** GET get-tehsil-area/{state}/{district}/{pincodeId} */
export async function getTehsilAndAreaByPincode(req: Request, res: Response) {
  try {
    let tehsil: unknown = null;
    let areas: unknown[] = [];
    const record = await addressFirst(p(req, 'state'), p(req, 'district'), p(req, 'pincodeId'));
    if (record) {
      tehsil = record.tehsil;
      areas = uniqueBy(collect(decodeArrayCast(record.area)), (i) => dataGet(i, 'area_name'));
    }
    return json(res, { tehsil, area: areas });
  } catch (e) {
    // Laravel quirk: HTTP 200 with "status": 500 in the body.
    return json(res, { message: errorMessage(e), status: 500 });
  }
}

/** GET get-hindi-state/{state} */
export async function getHindiState(req: Request, res: Response) {
  try {
    const state = p(req, 'state');
    const row = await first('select `state_hi` from `pincodes` where `state` = ? limit 1', [state]);
    // Laravel quirk: checks the route param, not the query result ('0' is falsy in PHP).
    if (truthy(state)) return json(res, { data: row ? { state_hi: row.state_hi } : null });
    return json(res, { data: null }, 404);
  } catch (e) {
    return json(res, { message: errorMessage(e), status: 500 });
  }
}

/** GET get-hindi-district/{state}/{city} */
export async function getHindiDistrict(req: Request, res: Response) {
  try {
    const row = await first('select `city_hi` from `pincodes` where `state` = ? and `city` = ? limit 1', [
      p(req, 'state'),
      p(req, 'city'),
    ]);
    const cityName = row ? row.city_hi : null;
    if (truthy(cityName)) return json(res, { data: cityName }, 200);
    return json(res, { data: null }, 404);
  } catch (e) {
    return json(res, { message: errorMessage(e), status: 500 }, 500);
  }
}

/** GET get-hindi-tehsil/{state}/{city}/{pincode} */
export async function getHindiTehsil(req: Request, res: Response) {
  try {
    const row = await first(
      'select `tehsil_hi` from `addresses` where `state` = ? and `city` = ? and `pincode_id` = ? limit 1',
      [p(req, 'state'), p(req, 'city'), p(req, 'pincode')],
    );
    const name = row ? row.tehsil_hi : null;
    if (truthy(name)) return json(res, { data: name }, 200);
    return json(res, { data: null }, 404);
  } catch (e) {
    return json(res, { message: errorMessage(e), status: 500 }, 500);
  }
}

/** GET get-hindi-area/{state}/{city}/{pincode} */
export async function getHindiArea(req: Request, res: Response) {
  try {
    const records = await all('select * from `addresses` where `state` = ? and `city` = ? and `pincode_id` = ?', [
      p(req, 'state'),
      p(req, 'city'),
      p(req, 'pincode'),
    ]);
    if (records.length === 0) {
      // Laravel quirk: $areas is undefined → "Undefined variable" warning → ErrorException, caught → 500.
      return json(res, { message: 'Undefined variable $areas', status: 500 }, 500);
    }
    // pluck('area')->flatten(1)
    const flat: unknown[] = [];
    for (const area of records.map((r) => decodeArrayCast(r.area))) {
      if (isPhpArray(area)) flat.push(...phpValues(area));
      else flat.push(area);
    }
    const areas = uniqueBy(flat, (i) => dataGet(i, 'area_name_hi'))
      .map((i) => (isPhpArray(i) && !Array.isArray(i) ? (i.area_name_hi ?? null) : null))
      .filter(truthy);
    return json(res, { data: areas }, 200);
  } catch (e) {
    return json(res, { message: errorMessage(e), status: 500 }, 500);
  }
}

/** GET get-category-hindi/{categoryId} */
export async function getBusinessCategoriesHindi(req: Request, res: Response) {
  try {
    const row = await first('select `name_hi` from `business_categories` where `id` = ? limit 1', [p(req, 'categoryId')]);
    const name = row ? row.name_hi : null;
    if (truthy(name)) return json(res, { data: name });
    return json(res, { data: null }, 404);
  } catch (e) {
    return json(res, { message: errorMessage(e), status: 500 });
  }
}

// --------------------------------------------------------------------------------------------------
// BusinessDetailCrudController

/** GET business-city/{Id} — no try/catch in the PHP. */
export async function getPincodeInfo(req: Request, res: Response) {
  const pin = await first('select * from `pincodes` where `pincodes`.`id` = ? limit 1', [p(req, 'Id')]);
  if (!pin) return json(res, { error: 'Pincode not found' }, 404);
  return json(res, { state: truthy(pin.state) ? pin.state : null, district: pin.city ?? null });
}

// --------------------------------------------------------------------------------------------------
// BusinessUserCrudController / EventCrudController

/** getTehsilByUserCity — DB errors answered with 404 (both controllers). */
export async function getTehsilByUserCity(req: Request, res: Response) {
  try {
    const rec = await addressFirst(p(req, 'state'), p(req, 'city'), p(req, 'pincode'));
    const tehsil = rec ? rec.tehsil : null;
    return json(res, { success: true, message: 'Tehsil data is fetched successfully.', tehsil }, 200);
  } catch (e) {
    return json(res, { success: false, message: errorMessage(e) }, 404);
  }
}

// --------------------------------------------------------------------------------------------------
// PinCodeCrudController

/** GET pincode-codes/{state}/{city?} — no try/catch in the PHP. */
export async function getCodes(req: Request) {
  const city = req.params.city;
  let sql = 'select * from `pincodes` where `state` = ?';
  const params: unknown[] = [p(req, 'state')];
  if (truthy(city)) {
    sql += ' and `city` = ?';
    params.push(city);
  }
  const data = await first(sql + ' limit 1', params);
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
  const text = phpTrim(p(req, 'department'));
  if (!truthy(text)) return json(res, { error: 'Input text is required.' }, 400); // empty('0') is true
  const transliterated = await transliterateEnglishToHindi(text);
  if (transliterated === '') return json(res, { error: 'Transliteration failed.' }, 500);
  return json(res, { data: { translated_text: transliterated } });
}
