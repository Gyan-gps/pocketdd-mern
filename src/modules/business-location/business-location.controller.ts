// Port of App\Http\Controllers\Api\BusinessLocationController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../../core/http/response.js';
import { nowDb } from '../../core/time.js';
import { C, childRow, col, toRow, type Filter, type Row } from '../../db/mongo.js';
import { eloquentSave, looseEq, poolDb, whereEq, withoutChildren } from '../../db/eloquent.js';
import { phpTruthy } from '../../utils/php/compat.js';
import { serializeLocation } from '../../models/business.js';

/** `SELECT * FROM business_users WHERE … LIMIT 1` (without the embedded locations). */
async function businessUserWhere(filter: Filter<Row>): Promise<Row | null> {
  return toRow(await col(C.businessUsers).findOne(filter, { sort: { _id: 1 }, projection: withoutChildren(C.businessUsers) }));
}

/** `SELECT * FROM business_users_location WHERE business_user_id = ? LIMIT 1` (childRow shape). */
async function firstUserLocation(businessUserId: number): Promise<Row | null> {
  const doc = await col(C.businessUsers).findOne({ _id: businessUserId } as unknown as Filter<Row>, {
    projection: { locations: 1 },
  });
  const loc = (doc?.locations as Row[] | undefined)?.[0];
  return loc ? childRow('business_users_location', businessUserId, loc) : null;
}

/** `SELECT id, location_name FROM locations WHERE … LIMIT 1`. */
async function locationRow(filter: Filter<Row>): Promise<Row | null> {
  const doc = await col(C.locations).findOne(filter, { sort: { _id: 1 }, projection: { location_name: 1 } });
  return doc ? { id: doc._id, location_name: doc.location_name ?? null } : null;
}

/** POST get-all-business-locations. */
export async function getAllBusinessLocations(req: Request) {
  try {
    const businessUser = await businessUserWhere({ user_id: looseEq(req.user!.id) });
    if (!businessUser) throw new Error('Attempt to read property "businessUserLocation" on null');
    const location = await firstUserLocation(businessUser.id);
    if (!location) throw new Error('Attempt to read property "location_id" on null');

    // Location::getAllLocations(): where('id', '!=', null) becomes whereNotNull('id').
    const exclude = location.location_id;
    const filter = (exclude === null ? { status: 1 } : { _id: { $ne: exclude }, status: 1 }) as unknown as Filter<Row>;
    const docs = await col(C.locations).find(filter, { projection: { location_name: 1 } }).sort({ _id: 1 }).toArray();
    const rows = docs.map((d) => ({ id: d._id, location_name: d.location_name ?? null }));
    return sendResponse(true, 'Business Locations Retrieved', { data: rows.map(serializeLocation) });
  } catch (e) {
    console.error('Error retrieving getting dashboard data', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** Location::getCurrentLocation() / first(['id', 'location_name']). */
async function locationById(id: unknown) {
  const row = await locationRow(whereEq('id', id));
  return row ? serializeLocation(row) : null;
}

/** POST update-business-location. */
export async function updateBusinessUserLocation(req: Request) {
  try {
    const input = req.input;
    const newLocationId = phpTruthy(input.location_id) ? input.location_id : null;
    const businessUser = await businessUserWhere({ user_id: looseEq(req.user!.id), status: 1 });
    if (!businessUser) throw new Error('Attempt to read property "businessUserLocation" on null');
    const bul = await firstUserLocation(businessUser.id);
    let currentLocation: unknown = null;
    if (bul) {
      const loc = await locationRow({ _id: looseEq(bul.location_id) } as Filter<Row>);
      if (!loc) throw new Error('Attempt to read property "id" on null');
      currentLocation = loc.id;
    }
    const language = phpTruthy(input.language) ? input.language : null;
    const defaultLanguage = bul ? bul.language : null;
    let newUpdatedLanguage: unknown = null;
    // (`!$business_user && $current_location` can never be true here.)

    if (language !== null) {
      if (!bul) throw new PhpError('Call to a member function update() on null');
      await eloquentSave(poolDb, 'business_users_location', bul, { language, updated_at: nowDb() }, { massAssign: true });
      newUpdatedLanguage = bul.language;
    }

    if (newLocationId === null) {
      return sendResponse(true, 'Business Location set successfully.', {
        data: await locationById(currentLocation),
        language: defaultLanguage,
      });
    }

    if (!bul) throw new Error('Attempt to read property "id" on null');
    // Location::getUpdatedNewLocation()
    const locationData = await locationRow(whereEq('id', newLocationId));
    const target = await firstUserLocation(businessUser.id);
    let data: unknown = [];
    if (locationData && target) {
      await eloquentSave(
        poolDb,
        'business_users_location',
        target,
        { temp_location_id: currentLocation, location_id: locationData.id },
        { massAssign: true },
      );
      data = serializeLocation(locationData);
    }
    return sendResponse(true, 'Business Locations Updates Successfully, A new location is set.', {
      data,
      language: newUpdatedLanguage,
    });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error updating business user location.', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}
