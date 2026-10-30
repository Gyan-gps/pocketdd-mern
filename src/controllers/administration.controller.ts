// Port of App\Http\Controllers\Api\AdministrationController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../core/http/response.js';
import { validateRequest } from '../core/validation/validator.js';
import {
  findActiveAdministrators,
  findActiveDepartments,
  findCityHelpline,
  findDepartmentBySlug,
  findPincodeByHindiCity,
  findPincodeCityByHindiCity,
  findUserLocationName,
  searchDepartmentDetails,
} from '../services/administration.service.js';
import { phpTruthy } from '../utils/php/compat.js';
import { publicDepartmentOfficersValidation, publicDepartmentsValidation } from '../validators/administration.validator.js';

const TRIM_PATTERN = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g;

/** PHP `trim()` (non-strict mode): scalars are coerced, arrays/objects are a TypeError. */
function phpTrim(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    throw Object.assign(new PhpError('trim(): Argument #1 ($string) must be of type string, array given'), { name: 'TypeError' });
  }
  if (typeof value === 'boolean') return value ? '1' : '';
  return String(value).replace(TRIM_PATTERN, '');
}

function phpType(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  if (typeof value === 'boolean') return 'bool';
  return typeof value;
}

const jsonDecode = (raw: unknown): unknown => {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
};

/** `$arr[$key] ?? $default` where `$arr` may be any decoded JSON value. */
const offset = (item: unknown, key: string, defaultValue: unknown) => {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return (item as Record<string, unknown>)[key] ?? defaultValue;
  }
  return defaultValue;
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
    const validation = await validateRequest(input, publicDepartmentsValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    console.info('Request data for getPublicDepartments', { request: input });

    const language = input.language;
    let cityName = phpTrim(input.cityName);

    if (language === 'hi') {
      const pincode = await findPincodeCityByHindiCity(cityName);
      if (!pincode) return sendResponse(false, 'City not found.');
      cityName = phpTrim(pincode.city);
    }

    const nameField = language === 'hi' ? 'department_name_hi' : 'department_name';
    const departments = (await findActiveDepartments(nameField)).map((department) => ({
      id: department._id,
      slug: department.slug,
      department_name: department[nameField] ?? null,
    }));

    const helplineNumber = await findCityHelpline(cityName);
    let helplineData: Record<string, unknown> | null = null;
    if (helplineNumber) {
      const list = cityHelplineAttribute(helplineNumber.city_helpline) as Record<string, unknown> | unknown[];
      const count = Array.isArray(list) ? list.length : Object.keys(list).length;
      if (count > 0) {
        // Re-reading the accessor runs it again (same result).
        const again = cityHelplineAttribute(helplineNumber.city_helpline) as Record<string, unknown>;
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
  } catch (error) {
    console.error('Error retrieving administrator getPublicDepartments', { getMessage: errorMessage(error) });
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-department-officers-details. */
export async function getPublicDepartmentOfficers(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, publicDepartmentOfficersValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const language = input.language;
    let cityName = phpTrim(input.cityName);
    let stateName = phpTrim(input.stateName ?? '');

    if (language === 'hi') {
      const pincode = await findPincodeByHindiCity(cityName, stateName, phpTruthy(stateName));
      if (!pincode) return sendResponse(false, 'City not found.');
      cityName = phpTrim(pincode.city);
      stateName = phpTrim(pincode.state);
    }

    const department = await findDepartmentBySlug(input.department_slug);

    let formattedData: unknown[] = [];
    if (department) {
      const administrators = await findActiveAdministrators(department._id, cityName, stateName);
      const grouped = new Map<string, { department: unknown; city: unknown; officer_rank_data: unknown[] }>();
      for (const administrator of administrators) {
        const departmentKey = String(department.department_name ?? '');
        if (!grouped.has(departmentKey)) {
          grouped.set(departmentKey, { department: department.department_name, city: administrator.city, officer_rank_data: [] });
        }
        // $casts officer_rank_name => json (a TEXT column, stored as text)
        const ranks =
          typeof administrator.officer_rank_name === 'string' || administrator.officer_rank_name == null
            ? jsonDecode(administrator.officer_rank_name)
            : administrator.officer_rank_name;
        if (ranks && typeof ranks === 'object') {
          for (const item of Object.values(ranks as object)) {
            grouped.get(departmentKey)!.officer_rank_data.push({
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
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error retrieving administrator departments', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-public-department-search (auth:sanctum). */
export async function searchOfficeContactDetails(req: Request) {
  try {
    const search = req.input.search;
    if (!phpTruthy(search)) return { status: false, msg: 'No department details retrieved.' };

    const locationName = await findUserLocationName(Number(req.user!.id));
    const data = await searchDepartmentDetails(search);
    return sendResponse(true, 'City Department Officers contact details retrieved.', { data, location: locationName });
  } catch (error) {
    console.error('Error retrieving administrator departments', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}
