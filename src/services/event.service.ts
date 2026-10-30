// Event queries used by the event endpoints.
import { nowDb } from '../core/time.js';
import { CASE_INSENSITIVE } from '../db/eloquent.js';
import { Event } from '../models/event.model.js';
import { Pincode } from '../models/pincode.model.js';

/** `TRIM(column) = value` (MySQL TRIM strips spaces only; `=` is case-insensitive under the collation). */
const trimmedEquals = (field: string, value: unknown) => ({ $eq: [{ $trim: { input: `$${field}`, chars: ' ' } }, value] });

/** English state/city of a Hindi city (and state, when given) name, from the pin code directory. */
export function findPincodeByHindiCity(cityNameHi: unknown, stateNameHi: unknown, filterByState: boolean) {
  const conditions = [trimmedEquals('city_hi', cityNameHi)];
  if (filterByState) conditions.push(trimmedEquals('state_hi', stateNameHi));
  return Pincode.findOne({ $expr: { $and: conditions } }, { _id: 0, city: 1, state: 1 }, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean();
}

/** Active events from today on in a state/district, ordered by the (language's) name. */
export function findUpcomingEvents(stateName: string, districtName: string, orderByField: 'name' | 'name_hi') {
  return Event.find(
    { state: stateName, district: districtName, status: 1, date: { $gte: nowDb().slice(0, 10) } },
    { name: 1, name_hi: 1, date: 1, event_time: 1, image: 1 },
    { collation: CASE_INSENSITIVE, sort: { [orderByField]: 1, _id: 1 } },
  ).lean();
}

export function findEventById(eventId: number) {
  return Event.findOne({ _id: eventId }).lean();
}
