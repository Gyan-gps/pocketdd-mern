// Port of App\Http\Controllers\Api\AdministrationController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../../core/http/respond.js';
import { validate } from '../../core/validation/validator.js';
import { all, first } from '../../db/pool.js';
import { phpTruthy, translatedAttr } from '../../helpers/php-compat.js';

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

const phpType = (v: unknown) =>
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
function cityHelplineAttribute(raw: unknown): unknown {
  const data = typeof raw === 'string' ? jsonDecode(raw) : raw;
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
      const pincode = await first('SELECT city FROM pincodes WHERE TRIM(city_hi) = ? LIMIT 1', [cityName]);
      if (!pincode) return sendResponse(false, 'City not found.');
      cityName = phpTrim(pincode.city);
    }

    const departments = await all(
      `SELECT id, slug, ${language === 'hi' ? 'department_name_hi as department_name' : 'department_name as department_name'}
         FROM departments WHERE status = ? ORDER BY id ASC`,
      [1],
    );

    const helpLineNo = await first('SELECT * FROM city_helpline_numbers WHERE city = ? LIMIT 1', [cityName]);
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
      const pincode = await first(
        `SELECT city, state FROM pincodes WHERE TRIM(city_hi) = ?${byState ? ' AND TRIM(state_hi) = ?' : ''} LIMIT 1`,
        byState ? [cityName, stateName] : [cityName],
      );
      if (!pincode) return sendResponse(false, 'City not found.');
      cityName = phpTrim(pincode.city);
      stateName = phpTrim(pincode.state);
    }

    const department = await first('SELECT * FROM departments WHERE slug = ? LIMIT 1', [input.department_slug]);

    let formattedData: unknown[] = [];
    if (department) {
      const admins = await all(
        'SELECT * FROM administrators WHERE department_id = ? AND city = ? AND state = ? AND status = ?',
        [department.id, cityName, stateName, 1],
      );
      const grouped = new Map<string, { department: unknown; city: unknown; officer_rank_data: unknown[] }>();
      for (const admin of admins) {
        const deptKey = String(department.department_name ?? '');
        if (!grouped.has(deptKey)) {
          grouped.set(deptKey, { department: department.department_name, city: admin.city, officer_rank_data: [] });
        }
        const ranks = jsonDecode(admin.officer_rank_name); // $casts officer_rank_name => json
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
  let sql = `SELECT * FROM administrators WHERE EXISTS (
      SELECT * FROM designations WHERE administrators.designation_id = designations.id AND name LIKE ?)`;
  const params: unknown[] = [`%${search}%`];
  if (phpTruthy(search)) {
    sql += ' AND (officer_rank_name LIKE ? OR officer_rank_name LIKE ?)';
    params.push(`%"officer_rank":"%${search}%`, `%"officer_number":"%${search}%`);
  }
  const rows = await all(sql, params);
  // with('designation:id,name')
  const ids = [...new Set(rows.map((r) => r.designation_id).filter((id) => id !== null))];
  const designations = ids.length ? await all('SELECT id, name FROM designations WHERE id IN (?)', [ids]) : [];
  const byId = new Map(designations.map((d) => [String(d.id), d]));
  return rows.map((item) => {
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

    const user = await first('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user!.id]);
    // $user->businessUser->businessUserLocation->location->location_name ?? null
    let locationName: unknown = null;
    const businessUser = user ? await first('SELECT * FROM business_users WHERE user_id = ? LIMIT 1', [user.id]) : null;
    if (businessUser) {
      const bul = await first('SELECT * FROM business_users_location WHERE business_user_id = ? LIMIT 1', [businessUser.id]);
      if (bul && bul.location_id !== null) {
        const loc = await first('SELECT * FROM locations WHERE id = ? LIMIT 1', [bul.location_id]);
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
