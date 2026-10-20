// Port of App\Http\Controllers\Api\BusinessLocationController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../../core/http/respond.js';
import { nowDb } from '../../core/time.js';
import { all, first, exec } from '../../db/pool.js';
import { eloquentSave, whereEq, type Db } from '../../helpers/business.js';
import { phpTruthy } from '../../helpers/phase5.js';
import { serializeLocation } from '../../models/business.js';

const db: Db = { all, first, exec };

/** POST get-all-business-locations. */
export async function getAllBusinessLocations(req: Request) {
  try {
    const businessUser = await first('SELECT * FROM business_users WHERE user_id = ? LIMIT 1', [req.user!.id]);
    if (!businessUser) throw new Error('Attempt to read property "businessUserLocation" on null');
    const location = await first('SELECT * FROM business_users_location WHERE business_user_id = ? LIMIT 1', [
      businessUser.id,
    ]);
    if (!location) throw new Error('Attempt to read property "location_id" on null');

    // Location::getAllLocations(): where('id', '!=', null) becomes whereNotNull('id').
    const exclude = location.location_id;
    const rows =
      exclude === null
        ? await all('SELECT id, location_name FROM locations WHERE id IS NOT NULL AND status = ?', [1])
        : await all('SELECT id, location_name FROM locations WHERE id != ? AND status = ?', [exclude, 1]);
    return sendResponse(true, 'Business Locations Retrieved', { data: rows.map(serializeLocation) });
  } catch (e) {
    console.error('Error retrieving getting dashboard data', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** Location::getCurrentLocation() / first(['id', 'location_name']). */
async function locationById(id: unknown) {
  const [w, p] = whereEq('id', id);
  const row = await first(`SELECT id, location_name FROM locations WHERE ${w} LIMIT 1`, p);
  return row ? serializeLocation(row) : null;
}

/** POST update-business-location. */
export async function updateBusinessUserLocation(req: Request) {
  try {
    const input = req.input;
    const newLocationId = phpTruthy(input.location_id) ? input.location_id : null;
    const businessUser = await first('SELECT * FROM business_users WHERE user_id = ? AND status = ? LIMIT 1', [
      req.user!.id,
      1,
    ]);
    if (!businessUser) throw new Error('Attempt to read property "businessUserLocation" on null');
    const bul = await first('SELECT * FROM business_users_location WHERE business_user_id = ? LIMIT 1', [businessUser.id]);
    let currentLocation: unknown = null;
    if (bul) {
      const loc = await first('SELECT * FROM locations WHERE id = ? LIMIT 1', [bul.location_id]);
      if (!loc) throw new Error('Attempt to read property "id" on null');
      currentLocation = loc.id;
    }
    const language = phpTruthy(input.language) ? input.language : null;
    const defaultLanguage = bul ? bul.language : null;
    let newUpdatedLanguage: unknown = null;
    // (`!$business_user && $current_location` can never be true here.)

    if (language !== null) {
      if (!bul) throw new PhpError('Call to a member function update() on null');
      await eloquentSave(db, 'business_users_location', bul, { language, updated_at: nowDb() }, { massAssign: true });
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
    const [w, p] = whereEq('id', newLocationId);
    const locationData = await first(`SELECT id, location_name FROM locations WHERE ${w} LIMIT 1`, p);
    const target = await first('SELECT * FROM business_users_location WHERE id = ? LIMIT 1', [bul.id]);
    let data: unknown = [];
    if (locationData && target) {
      await eloquentSave(
        db,
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
