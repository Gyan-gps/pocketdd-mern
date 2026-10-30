// Business-user location queries used by the business location endpoints (Api\BusinessLocationController).
import { childRow, toRow, type Row } from '../db/mongo.js';
import { eloquentSave, looseEq, poolDb, whereEq, withoutChildren } from '../db/eloquent.js';
import { BusinessUser } from '../models/business-user.model.js';
import { Location } from '../models/location.model.js';

/** `SELECT * FROM business_users WHERE … LIMIT 1` (without the embedded locations). */
async function findBusinessUser(filter: Row): Promise<Row | null> {
  return toRow(
    await BusinessUser.findOne(filter, withoutChildren(BusinessUser.collection.collectionName), { sort: { _id: 1 } }).lean<Row>(),
  );
}

export const findBusinessUserOf = (userId: unknown) => findBusinessUser({ user_id: looseEq(userId) });
export const findActiveBusinessUserOf = (userId: unknown) => findBusinessUser({ user_id: looseEq(userId), status: 1 });

/** `SELECT * FROM business_users_location WHERE business_user_id = ? LIMIT 1` (childRow shape). */
export async function findFirstUserLocation(businessUserId: number): Promise<Row | null> {
  const businessUser = await BusinessUser.findOne({ _id: businessUserId }, { locations: 1 }).lean<Row>();
  const location = (businessUser?.locations as Row[] | undefined)?.[0];
  return location ? childRow('business_users_location', businessUserId, location) : null;
}

/** `SELECT id, location_name FROM locations WHERE … LIMIT 1`. */
async function findLocationRow(filter: Row): Promise<Row | null> {
  const location = await Location.findOne(filter, { location_name: 1 }, { sort: { _id: 1 } }).lean<Row>();
  return location ? { id: location._id, location_name: location.location_name ?? null } : null;
}

/** `Location::where('id', $id)` (a null id becomes `IS NULL`). */
export const findLocationById = (locationId: unknown) => findLocationRow(whereEq('id', locationId));
/** `Location::find($id)` with MySQL's loose `=`. */
export const findLocationByLooseId = (locationId: unknown) => findLocationRow({ _id: looseEq(locationId) });

/** Location::getAllLocations(): where('id', '!=', null) becomes whereNotNull('id'). */
export async function findActiveLocationsExcept(excludedId: unknown): Promise<Row[]> {
  const filter = excludedId === null ? { status: 1 } : { _id: { $ne: excludedId }, status: 1 };
  const locations = await Location.find(filter, { location_name: 1 }).sort({ _id: 1 }).lean<Row[]>();
  return locations.map((location) => ({ id: location._id, location_name: location.location_name ?? null }));
}

export const updateUserLocation = (userLocation: Row, values: Record<string, unknown>) =>
  eloquentSave(poolDb, 'business_users_location', userLocation, values, { massAssign: true });
