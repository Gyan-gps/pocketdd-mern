// Queries used by the public administration endpoints (Api\AdministrationController).
import { CASE_INSENSITIVE } from '../db/eloquent.js';
import { escapeRegex, like, type Row } from '../db/mongo.js';
import { Administrator } from '../models/administrator.model.js';
import { BusinessUser } from '../models/business-user.model.js';
import { CityHelplineNumber } from '../models/city-helpline-number.model.js';
import { Department } from '../models/department.model.js';
import { Designation } from '../models/designation.model.js';
import { Location } from '../models/location.model.js';
import { Pincode } from '../models/pincode.model.js';
import { User } from '../models/user.model.js';
import { phpTruthy, translatedAttr } from '../utils/php/compat.js';

type Document = { _id: number; [key: string]: any };

/** `TRIM(col) = ?` (MySQL TRIM strips spaces only; `=` is case-insensitive under the collation). */
const trimmedEquals = (field: string, value: unknown) => ({ $eq: [{ $trim: { input: `$${field}`, chars: ' ' } }, value] });

/** English city of a Hindi city name, from the pin code directory. */
export function findPincodeCityByHindiCity(cityNameHi: string) {
  return Pincode.findOne({ $expr: trimmedEquals('city_hi', cityNameHi) }, { _id: 0, city: 1 }, {
    collation: CASE_INSENSITIVE,
    sort: { _id: 1 },
  }).lean<Document>();
}

/** English state/city of a Hindi city (and state, when given) name. */
export function findPincodeByHindiCity(cityNameHi: string, stateNameHi: string, filterByState: boolean) {
  const conditions = [trimmedEquals('city_hi', cityNameHi)];
  if (filterByState) conditions.push(trimmedEquals('state_hi', stateNameHi));
  return Pincode.findOne({ $expr: { $and: conditions } }, { _id: 0, city: 1, state: 1 }, {
    collation: CASE_INSENSITIVE,
    sort: { _id: 1 },
  }).lean<Document>();
}

export function findActiveDepartments(nameField: string) {
  return Department.find({ status: 1 }, { slug: 1, [nameField]: 1 }, { sort: { _id: 1 } }).lean<Document[]>();
}

export function findCityHelpline(cityName: string) {
  return CityHelplineNumber.findOne({ city: cityName }, null, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean<Document>();
}

export function findDepartmentBySlug(slug: unknown) {
  return Department.findOne({ slug }, null, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean<Document>();
}

export function findActiveAdministrators(departmentId: number, cityName: string, stateName: string) {
  return Administrator.find({ department_id: departmentId, city: cityName, state: stateName, status: 1 }, null, {
    collation: CASE_INSENSITIVE,
    sort: { _id: 1 },
  }).lean<Document[]>();
}

/** First embedded child row by id (the old child-table `LIMIT 1` returned PK order). */
const firstChild = (children: Row[] | undefined): Row | null =>
  children?.length ? [...children].sort((a, b) => a.id - b.id)[0] : null;

/** $user->businessUser->businessUserLocation->location->location_name ?? null */
export async function findUserLocationName(userId: number): Promise<unknown> {
  const user = await User.findOne({ _id: userId }).lean<Document>();
  let locationName: unknown = null;
  const businessUser = user ? await BusinessUser.findOne({ user_id: user._id }, null, { sort: { _id: 1 } }).lean<Document>() : null;
  if (businessUser) {
    const businessUserLocation = firstChild(businessUser.locations);
    if (businessUserLocation && businessUserLocation.location_id != null) {
      const location = await Location.findOne({ _id: businessUserLocation.location_id }).lean<Document>();
      locationName = location ? translatedAttr(location.location_name) : null;
    }
  }
  return locationName;
}

/** Administrator::searchDepartmentDetails($search). */
export async function searchDepartmentDetails(search: unknown) {
  const term = `${search}`;
  const matchingDesignations = await Designation.find({ name: like(term) }, { _id: 1 }).lean<Document[]>();
  const filter: Row = { designation_id: { $in: matchingDesignations.map((designation) => designation._id) } };
  if (phpTruthy(search)) {
    const after = (key: string) => ({ $regex: escapeRegex(`"${key}":"`) + '.*' + escapeRegex(term), $options: 'is' });
    filter.$or = [{ officer_rank_name: after('officer_rank') }, { officer_rank_name: after('officer_number') }];
  }
  const administrators = await Administrator.find(filter, null, { sort: { _id: 1 } }).lean<Document[]>();
  // with('designation:id,name')
  const designationIds = [...new Set(administrators.map((row) => row.designation_id).filter((id) => id !== null))];
  const designations = designationIds.length
    ? await Designation.find({ _id: { $in: designationIds } }, { name: 1 }).lean<Document[]>()
    : [];
  const designationById = new Map(designations.map((designation) => [String(designation._id), { id: designation._id, name: designation.name }]));
  return administrators.map((administrator) => {
    const item: Document & { id: number } = { id: administrator._id, ...administrator };
    const designation = item.designation_id === null ? undefined : designationById.get(String(item.designation_id));
    return {
      id: item.id,
      designation_id: item.designation_id,
      department_id: item.department_id,
      // Designation and Location are HasTranslations models (translatable name / location_name).
      designations: designation
        ? { id: designation.id, name: translatedAttr(designation.name), mobile_number: item.officer_mobile_number ?? null }
        : null,
    };
  });
}
