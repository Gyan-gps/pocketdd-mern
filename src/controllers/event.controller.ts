// Port of App\Http\Controllers\Api\EventController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request } from 'express';
import { errorMessage, sendCatchLog, sendResponse } from '../core/http/response.js';
import { validateRequest } from '../core/validation/validator.js';
import { intId } from '../db/mongo.js';
import { innerAdsWithBusiness } from '../services/advertisement.service.js';
import { findEventById, findPincodeByHindiCity, findUpcomingEvents } from '../services/event.service.js';
import { formatDateDMY, formatTimeHiA, isTodayIst, laravelUrl, phpEmpty, phpTruthy } from '../utils/php/compat.js';
import { phpTrim } from '../utils/php/values.js';
import { businessEventDetailsValidation, listBusinessEventsValidation } from '../validators/event.validator.js';

const trimmedString = (value: unknown) => phpTrim(value === null || value === undefined ? '' : String(value));

/** POST get-all-business-events. */
export async function getAllBusinessEvents(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, listBusinessEventsValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const location = input.location;
    const language = input.language;
    let cityName = input.cityName as string;
    let stateName = input.stateName as string;

    console.info('Request data for getAllBusinessEvents', { language, stateName, cityName });

    // Laravel quirk: '' (not []) when the location is not the event page.
    let advertisementData: unknown = '';
    // PHP loose `==` against a string.
    if (location == 'event_page') advertisementData = await innerAdsWithBusiness(req, 'Event');

    if (language === 'hi') {
      const pincode = await findPincodeByHindiCity(cityName, stateName, phpTruthy(stateName));
      if (!pincode) return sendResponse(false, 'City not found.');
      cityName = trimmedString(pincode.city);
      stateName = trimmedString(pincode.state);
    }

    const orderByField = language == 'hi' ? 'name_hi' : 'name';
    const upcomingEvents = await findUpcomingEvents(stateName, cityName, orderByField);
    const events = upcomingEvents.map((event) => {
      const date = event.date ? String(event.date) : null;
      const time = event.event_time ? String(event.event_time) : null;
      return {
        name: language === 'hi' && !phpEmpty(event.name_hi) ? event.name_hi : event.name,
        date: date ? formatDateDMY(date) : null,
        time: time ? formatTimeHiA(time) : null,
        today: date ? isTodayIst(date) : false,
        id: event._id,
        image: event.image ? laravelUrl(req, event.image) : null,
      };
    });

    // Laravel quirk: a Collection is always truthy, so the `else` branch is unreachable.
    return sendResponse(true, 'Events Founds.', { events, advertisement_data: advertisementData });
  } catch (error) {
    console.error('Error retrieving getting dashboard categories', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-business-event-details. */
export async function getBusinessEventDetails(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, businessEventDetailsValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const language = input.language;
    const eventId = intId(input.event_id);
    const event = eventId === null ? null : await findEventById(eventId);
    if (!event) return sendResponse(false, 'Events Not found!');

    const name = language === 'hi' ? event.name_hi : event.name;
    const about = language === 'hi' ? event.event_description_hi : event.short_description;
    const date = event.date ? String(event.date) : null;
    const time = event.event_time ? String(event.event_time) : null;

    const eventDetails = {
      event_name: name,
      about,
      date: date ? formatDateDMY(date) : null,
      time: time ? formatTimeHiA(time) : null,
      // Laravel quirk: url(null) → `{}` when the event has no image.
      event_logo: laravelUrl(req, event.image),
    };

    let advertisementData: unknown = '';
    if (input.location == 'event_details') advertisementData = await innerAdsWithBusiness(req, 'Event Details');

    return sendResponse(true, 'Events Details fetched successfully', {
      data: eventDetails,
      advertisement_data: advertisementData,
    });
  } catch (error) {
    console.error('Error retrieving business event details', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}
