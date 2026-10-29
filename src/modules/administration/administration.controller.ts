// Port of App\Http\Controllers\Api\AdministrationController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../../core/http/response.js';
import { validate } from '../../core/validation/validator.js';
import { C, col, escapeRegex, like, type Row } from '../../db/mongo.js';

type Doc = { _id: number; [k: string]: any };
const CI = { locale: 'en', strength: 2 };

/** `TRIM(col) = ?` (MySQL TRIM strips spaces only; `=` is case-insensitive under the collation). */
const trimEq = (field: string, value: unknown) => ({ $eq: [{ $trim: { input: `$${field}`, chars: ' ' } }, value] });
import { phpTruthy, translatedAttr } from '../../utils/php/compat.js';

const TRIM_RE = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g;

/** PHP `trim()` (non-strict mode): scalars are coerced, arrays/objects are a TypeError. */
function phpTrim(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    throw Object.assign(new PhpError('trim(): Argument #1 ($string) must be of type string, array given'), { name: 'TypeError' });
  }
  if (typeof v === 'boolean') return v ? '1' : '';
  return String(v).replace(TRIM_RE, '');
}

/** First embedded child row by id (the old child-table `LIMIT 1` returned PK order). */
const firstChild = (children: Row[] | undefined): Row | null =>
  children?.length ? [...children].sort((a, b) => a.id - b.id)[0] : null;

const phpType =(v: unknown) =>
  v === null || v === undefined ? 'null' : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : typeof v === 'boolean' ? 'bool' : typeof v;

const jsonDecode = (raw: unknown): unknown => {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
};

/** `$arr[$key] ?? $default` where `$arr` may be any decoded JSON value. */
const offset = (item: unknown, key: string, dflt: unknown) => {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return (item as Record<string, unknown>)[key] ?? dflt;
  }
  return dflt;
};

/**
 * CityHelplineNumber::getCityHelplineAttribute() — the accessor wins over the `array` cast and
 * foreach()es the decoded value (a warning → ErrorException when it is not an array).
 */
function cityHelplineAttribute(stored: unknown): unknown {
  // `city_helpline` is stored decoded. A string left in it was either invalid JSON (decoded to null) or
  // double-encoded (decoded once to a string).
  const data = typeof stored === 'string' ? (jsonDecode(stored) === null ? null : stored) : stored;
  if (data === null || typeof data !== 'object') {
    throw new Error(`foreach() argument must be of type array|object, ${phpType(data)} given`);
  }
  return data;
}

/** POST get-office-departments. */
export async function getPublicDepartments(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { cityName: 'required|string', language: 'required|in:en,hi' }, {
      'cityName.required': 'Location is required.',
      'language.required': 'Language is required.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    console.info('Request data for getPublicDepartments', { request: input });

    const language = input.language;
    let cityName = phpTrim(input.cityName);

    if (language === 'hi') {
      const pincode = await col<Doc>(C.pincodes).findOne(
        { $expr: trimEq('city_hi', cityName) },
        { projection: { _id: 0, city: 1 }, collation: CI, sort: { _id: 1 } },
      );
      if (!pincode) return sendResponse(false, 'City not found.');
      cityName = phpTrim(pincode.city);
    }

    const nameCol = language === 'hi' ? 'department_name_hi' : 'department_name';
    const departments = (
      await col<Doc>(C.departments)
        .find({ status: 1 }, { projection: { slug: 1, [nameCol]: 1 }, sort: { _id: 1 } })
        .toArray()
    ).map((d) => ({ id: d._id, slug: d.slug, department_name: d[nameCol] ?? null }));

    const helpLineNo = await col<Doc>(C.cityHelplines).findOne({ city: cityName }, { collation: CI, sort: { _id: 1 } });
    let helplineData: Record<string, unknown> | null = null;
    if (helpLineNo) {
      const list = cityHelplineAttribute(helpLineNo.city_helpline) as Record<string, unknown> | unknown[];
      const count = Array.isArray(list) ? list.length : Object.keys(list).length;
      if (count > 0) {
        // Re-reading the accessor runs it again (same result).
        const again = cityHelplineAttribute(helpLineNo.city_helpline) as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(again, '0')) throw new Error('Undefined array key 0');
        const helpline = again['0'];
        helplineData = {
          ambulance_number: offset(helpline, 'ambulance_number', null),
          fire_safety_number: offset(helpline, 'fire_safety_number', null),
          women_helpline: offset(helpline, 'women_helpline', null),
          police_headquarters: offset(helpline, 'police_headquarters', null),
        };
      }
    }
    return sendResponse(true, 'City Departments with the Helpline No(s)', {
      departments,
      helpline_numbers: helplineData,
    });
  } catch (e) {
    console.error('Error retrieving administrator getPublicDepartments', { getMessage: errorMessage(e) });
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-department-officers-details. */
export async function getPublicDepartmentOfficers(req: Request) {
  try {
    const input = req.input;
    const v = await validate(
      input,
      { department_slug: 'required|string|exists:departments,slug', cityName: 'required', language: 'required' },
      {
        'department_slug.required': 'Department is required.',
        'department_slug.exists': 'Department not found.',
        'language.required': 'Language is required.',
        'cityName.required': 'Location is required.',
      },
    );
    if (v.fails()) return sendResponse(false, v.first());

    const language = input.language;
    let cityName = phpTrim(input.cityName);
    let stateName = phpTrim(input.stateName ?? '');

    if (language === 'hi') {
      const byState = phpTruthy(stateName);
      const conds = [trimEq('city_hi', cityName)];
      if (byState) conds.push(trimEq('state_hi', stateName));
      const pincode = await col<Doc>(C.pincodes).findOne(
        { $expr: { $and: conds } },
        { projection: { _id: 0, city: 1, state: 1 }, collation: CI, sort: { _id: 1 } },
      );
      if (!pincode) return sendResponse(false, 'City not found.');
      cityName = phpTrim(pincode.city);
      stateName = phpTrim(pincode.state);
    }

    const department = await col<Doc>(C.departments).findOne(
      { slug: input.department_slug },
      { collation: CI, sort: { _id: 1 } },
    );

    let formattedData: unknown[] = [];
    if (department) {
      const admins = await col<Doc>(C.administrators)
        .find({ department_id: department._id, city: cityName, state: stateName, status: 1 }, { collation: CI, sort: { _id: 1 } })
        .toArray();
      const grouped = new Map<string, { department: unknown; city: unknown; officer_rank_data: unknown[] }>();
      for (const admin of admins) {
        const deptKey = String(department.department_name ?? '');
        if (!grouped.has(deptKey)) {
          grouped.set(deptKey, { department: department.department_name, city: admin.city, officer_rank_data: [] });
        }
        // $casts officer_rank_name => json (a TEXT column, stored as text)
        const ranks = typeof admin.officer_rank_name === 'string' || admin.officer_rank_name == null
          ? jsonDecode(admin.officer_rank_name)
          : admin.officer_rank_name;
        if (ranks && typeof ranks === 'object') {
          for (const item of Object.values(ranks as object)) {
            grouped.get(deptKey)!.officer_rank_data.push({
              officer_rank: language == 'hi' ? offset(item, 'officer_rank_hi', '') : offset(item, 'officer_rank', ''),
              officer_number: offset(item, 'officer_number', ''),
            });
          }
        }
      }
      formattedData = [...grouped.values()];
    }
    return sendResponse(true, 'City Department Officers contact details retrieved.', {
      data: formattedData,
      department_name: language === 'hi' ? department!.department_name_hi : department!.department_name,
    });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error retrieving administrator departments', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** Administrator::searchDepartmentDetails($search). */
async function searchDepartmentDetails(search: unknown) {
  const term = `${search}`;
  const matching = await col<Doc>(C.designations).find({ name: like(term) }, { projection: { _id: 1 } }).toArray();
  const filter: Row = { designation_id: { $in: matching.map((d) => d._id) } };
  if (phpTruthy(search)) {
    const after = (key: string) => ({ $regex: escapeRegex(`"${key}":"`) + '.*' + escapeRegex(term), $options: 'is' });
    filter.$or = [{ officer_rank_name: after('officer_rank') }, { officer_rank_name: after('officer_number') }];
  }
  const rows = await col<Doc>(C.administrators).find(filter, { sort: { _id: 1 } }).toArray();
  // with('designation:id,name')
  const ids = [...new Set(rows.map((r) => r.designation_id).filter((id) => id !== null))];
  const designations = ids.length
    ? await col<Doc>(C.designations).find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray()
    : [];
  const byId = new Map(designations.map((d) => [String(d._id), { id: d._id, name: d.name }]));
  return rows.map((r) => {
    const item: Doc & { id: number } = { id: r._id, ...r };
    const d = item.designation_id === null ? undefined : byId.get(String(item.designation_id));
    return {
      id: item.id,
      designation_id: item.designation_id,
      department_id: item.department_id,
      // Designation and Location are HasTranslations models (translatable name / location_name).
      designations: d ? { id: d.id, name: translatedAttr(d.name), mobile_number: item.officer_mobile_number ?? null } : null,
    };
  });
}

/** POST get-public-department-search (auth:sanctum). */
export async function searchOfficeContactDetails(req: Request) {
  try {
    const search = req.input.search;
    if (!phpTruthy(search)) return { status: false, msg: 'No department details retrieved.' };

    const user = await col<Doc>(C.users).findOne({ _id: Number(req.user!.id) });
    // $user->businessUser->businessUserLocation->location->location_name ?? null
    let locationName: unknown = null;
    const businessUser = user ? await col<Doc>(C.businessUsers).findOne({ user_id: user._id }, { sort: { _id: 1 } }) : null;
    if (businessUser) {
      const bul = firstChild(businessUser.locations);
      if (bul && bul.location_id != null) {
        const loc = await col<Doc>(C.locations).findOne({ _id: bul.location_id });
        locationName = loc ? translatedAttr(loc.location_name) : null;
      }
    }
    const data = await searchDepartmentDetails(search);
    return sendResponse(true, 'City Department Officers contact details retrieved.', { data, location: locationName });
  } catch (e) {
    console.error('Error retrieving administrator departments', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}
