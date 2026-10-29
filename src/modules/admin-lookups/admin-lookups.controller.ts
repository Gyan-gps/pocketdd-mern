// Port of the "ADMIN PANEL Routes" block of routes/api.php (pocketdd-admin): lookup methods on the Admin
// CRUD controllers + App\Helpers\General::quickTranslate. Keep behaviour 1:1 with the PHP.
// These routes are outside every middleware group (no auth, no api_failures logging).
import type { Request, Response } from 'express';
import { errorMessage } from '../../core/http/response.js';
import { phpTrim } from '../../utils/php/values.js';
import { transliterateEnglishToHindi } from '../../utils/hindi/transliterate.js';
import { C, col, toRow, toRows, type Row } from '../../db/mongo.js';

const CI = { locale: 'en', strength: 2 } as const;

/** MySQL `col = '<route param>'`: a numeric string also matched the integer. */
const loose = (v: unknown) => {
  const n = typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
  return n === null ? [v] : [v, n];
};

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
  // Stored natively now (a string is a decoded JSON string literal).
  return phpArrayify(v);
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
  const rows = toRows(
    await col(C.businessSubCategories)
      .find({ parent_id: { $in: loose(p(req, 'categoryId')) } }, { sort: { _id: 1 } })
      .toArray(),
  );
  // Laravel quirk: `if (!$category)` is never true for a Collection.
  return { data: rows.map((s) => ({ id: s.id, name: s.name, name_hi: s.name_hi })) };
}

/** getStateCities — identical in Business/Address/BusinessUser/CityHelplineNumber/Event/Administrator/AboutUs. */
export async function getStateCities(req: Request, res: Response) {
  try {
    // GROUP BY via a temporary table: groups in first-appearance order, case-insensitive.
    const rows = await col(C.pincodes)
      .find({ state: { $in: loose(p(req, 'state')) } }, { projection: { city: 1 }, collation: CI, sort: { _id: 1 } })
      .toArray();
    const seen = new Set<string>();
    const cities = rows.filter((r) => {
      const k = r.city === null || r.city === undefined ? '\0null' : String(r.city).toLowerCase().trimEnd();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return json(res, { success: true, data: cities.map((c) => ({ city: c.city ?? null })) }, 200);
  } catch (e) {
    // Laravel quirk: returns $e->getTraceAsString() (a PHP stack trace) — not reproducible; message used.
    return json(res, { success: false, message: errorMessage(e) }, 500);
  }
}

async function pincodesByStateCity(state: string, city: string, excludeIds?: unknown[]) {
  const filter: Row = { state: { $in: loose(state) }, city: { $in: loose(city) } };
  if (excludeIds && excludeIds.length) {
    // `NOT IN (..., NULL)` is never true.
    if (excludeIds.some((x) => x === null || x === undefined)) return [];
    filter._id = { $nin: excludeIds.flatMap(loose) };
  }
  const rows = toRows(await col(C.pincodes).find(filter, { collation: CI, sort: { _id: 1 } }).toArray());
  return uniqueBy(rows, (r) => r.pin_code).map((r) => ({ id: r.id, pin_code: r.pin_code }));
}

/**
 * getPincodeByStateCity for Business (no pluck) and BusinessUser/CityHelplineNumber/Event/Administrator
 * (pluck('pincode_id') whose result is unused — whereNotIn is commented out in the PHP — but the query runs).
 */
function pincodeByStateCity(pluckTable: string | null, errorStatus: number) {
  return async (req: Request, res: Response) => {
    try {
      if (pluckTable) await col(pluckTable).find({}, { projection: { _id: 0, pincode_id: 1 } }).toArray();
      const data = await pincodesByStateCity(p(req, 'state'), p(req, 'city'));
      return json(res, { success: true, data }, 200);
    } catch (e) {
      return json(res, { success: false, message: errorMessage(e) }, errorStatus);
    }
  };
}
export const businessGetPincodeByStateCity = pincodeByStateCity(null, 500);
// Laravel quirk: BusinessUser and Event answer DB errors with 404, the others with 500.
export const businessUserGetPincodeByStateCity = pincodeByStateCity(C.businessUsers, 404);
export const helplineGetPincodeByStateCity = pincodeByStateCity(C.cityHelplines, 500);
export const eventGetPincodeByStateCity = pincodeByStateCity(C.events, 404);
export const administratorGetPincodeByStateCity = pincodeByStateCity(C.administrators, 500);

/** AddressCrudController::getPincodeByStateCity — excludes pincodes already used by an address. */
export async function addressGetPincodeByStateCity(req: Request, res: Response) {
  try {
    const used = (await col(C.addresses).find({}, { projection: { pincode_id: 1 } }).toArray()).map(
      (r) => r.pincode_id ?? null,
    );
    // Laravel quirk: a NULL pincode_id in addresses makes `NOT IN (..., NULL)` match nothing.
    const data = await pincodesByStateCity(p(req, 'state'), p(req, 'city'), used);
    return json(res, { success: true, data }, 200);
  } catch (e) {
    return json(res, { success: false, message: errorMessage(e) }, 500);
  }
}

const addressWhere = (state: string, city: string, pincode: string): Row => ({
  state: { $in: loose(state) },
  city: { $in: loose(city) },
  pincode_id: { $in: loose(pincode) },
});

/** `select … from <collection> where … limit 1` (case-insensitive, PK order). */
const firstWhere = async (collection: string, filter: Row, fields?: string[]) =>
  toRow(
    await col(collection).findOne(filter, {
      collation: CI,
      sort: { _id: 1 },
      ...(fields ? { projection: Object.fromEntries([['_id', 0], ...fields.map((f) => [f, 1])]) } : {}),
    }),
  );

const addressFirst = (state: string, city: string, pincode: string) =>
  firstWhere(C.addresses, addressWhere(state, city, pincode));

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
    const row = await firstWhere(C.pincodes, { state: { $in: loose(state) } }, ['state_hi']);
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
    const row = await firstWhere(
      C.pincodes,
      { state: { $in: loose(p(req, 'state')) }, city: { $in: loose(p(req, 'city')) } },
      ['city_hi'],
    );
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
    const row = await firstWhere(C.addresses, addressWhere(p(req, 'state'), p(req, 'city'), p(req, 'pincode')), [
      'tehsil_hi',
    ]);
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
    const records = toRows(
      await col(C.addresses)
        .find(addressWhere(p(req, 'state'), p(req, 'city'), p(req, 'pincode')), { collation: CI, sort: { _id: 1 } })
        .toArray(),
    );
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
    const row = await firstWhere(C.businessCategories, { _id: { $in: loose(p(req, 'categoryId')) } }, ['name_hi']);
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
  const pin = await firstWhere(C.pincodes, { _id: { $in: loose(p(req, 'Id')) } });
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
  const filter: Row = { state: { $in: loose(p(req, 'state')) } };
  if (truthy(city)) filter.city = { $in: loose(city) };
  const data = await firstWhere(C.pincodes, filter);
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
