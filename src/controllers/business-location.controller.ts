// Port of App\Http\Controllers\Api\BusinessLocationController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../core/http/response.js';
import { nowDb } from '../core/time.js';
import {
  findActiveBusinessUserOf,
  findActiveLocationsExcept,
  findBusinessUserOf,
  findFirstUserLocation,
  findLocationById,
  findLocationByLooseId,
  updateUserLocation,
} from '../services/business-location.service.js';
import { phpTruthy } from '../utils/php/compat.js';
import { serializeLocation } from '../serializers/business.serializer.js';

/** POST get-all-business-locations. */
export async function getAllBusinessLocations(req: Request) {
  try {
    const businessUser = await findBusinessUserOf(req.user!.id);
    if (!businessUser) throw new Error('Attempt to read property "businessUserLocation" on null');
    const userLocation = await findFirstUserLocation(businessUser.id);
    if (!userLocation) throw new Error('Attempt to read property "location_id" on null');

    const locations = await findActiveLocationsExcept(userLocation.location_id);
    return sendResponse(true, 'Business Locations Retrieved', { data: locations.map(serializeLocation) });
  } catch (error) {
    console.error('Error retrieving getting dashboard data', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** Location::getCurrentLocation() / first(['id', 'location_name']). */
async function serializedLocationById(locationId: unknown) {
  const location = await findLocationById(locationId);
  return location ? serializeLocation(location) : null;
}

/** POST update-business-location. */
export async function updateBusinessUserLocation(req: Request) {
  try {
    const input = req.input;
    const newLocationId = phpTruthy(input.location_id) ? input.location_id : null;
    const businessUser = await findActiveBusinessUserOf(req.user!.id);
    if (!businessUser) throw new Error('Attempt to read property "businessUserLocation" on null');
    const userLocation = await findFirstUserLocation(businessUser.id);
    let currentLocation: unknown = null;
    if (userLocation) {
      const location = await findLocationByLooseId(userLocation.location_id);
      if (!location) throw new Error('Attempt to read property "id" on null');
      currentLocation = location.id;
    }
    const language = phpTruthy(input.language) ? input.language : null;
    const defaultLanguage = userLocation ? userLocation.language : null;
    let newUpdatedLanguage: unknown = null;
    // (`!$business_user && $current_location` can never be true here.)

    if (language !== null) {
      if (!userLocation) throw new PhpError('Call to a member function update() on null');
      await updateUserLocation(userLocation, { language, updated_at: nowDb() });
      newUpdatedLanguage = userLocation.language;
    }

    if (newLocationId === null) {
      return sendResponse(true, 'Business Location set successfully.', {
        data: await serializedLocationById(currentLocation),
        language: defaultLanguage,
      });
    }

    if (!userLocation) throw new Error('Attempt to read property "id" on null');
    // Location::getUpdatedNewLocation()
    const locationData = await findLocationById(newLocationId);
    const target = await findFirstUserLocation(businessUser.id);
    let data: unknown = [];
    if (locationData && target) {
      await updateUserLocation(target, { temp_location_id: currentLocation, location_id: locationData.id });
      data = serializeLocation(locationData);
    }
    return sendResponse(true, 'Business Locations Updates Successfully, A new location is set.', {
      data,
      language: newUpdatedLanguage,
    });
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error updating business user location.', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}
