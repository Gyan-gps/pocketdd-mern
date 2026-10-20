// Port of App\Http\Controllers\Api\EventController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request } from 'express';
import { errorMessage, sendCatchLog, sendResponse } from '../../core/http/respond.js';
import { nowDb } from '../../core/time.js';
import { validate } from '../../core/validation/validator.js';
import { all, first } from '../../db/pool.js';
import {
  formatDateDMY,
  formatTimeHiA,
  isTodayIst,
  laravelUrl,
  phpEmpty,
  phpTruthy,
} from '../../helpers/phase5.js';
import { innerAdsWithBusiness } from '../../models/advertisment.js';

const phpTrim = (v: unknown) => (v === null || v === undefined ? '' : String(v)).replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');

/** POST get-all-business-events. */
export async function getAllBusinessEvents(req: Request) {
  try {
    const input = req.input;
    const v = await validate(
      input,
      { stateName: 'required|string', cityName: 'required|string', language: 'required|in:en,hi', location: 'required' },
      {
        'location.required': 'Location is required.',
        'cityName.required': 'City is required.',
        'stateName.required': 'State is required.',
        'language.required': 'Language is required.',
      },
    );
    if (v.fails()) return sendResponse(false, v.first());

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
      const stateFilter = phpTruthy(stateName);
      const pincode = await first(
        `SELECT city, state FROM pincodes WHERE TRIM(city_hi) = ?${stateFilter ? ' AND TRIM(state_hi) = ?' : ''} LIMIT 1`,
        stateFilter ? [cityName, stateName] : [cityName],
      );
      if (!pincode) return sendResponse(false, 'City not found.');
      cityName = phpTrim(pincode.city);
      stateName = phpTrim(pincode.state);
    }

    const orderCol = language == 'hi' ? 'name_hi' : 'name';
    const rows = await all(
      `SELECT id, name, name_hi, date, event_time, image FROM events
        WHERE (state = ? AND district = ? AND status = ?) AND DATE(\`date\`) >= ?
        ORDER BY \`${orderCol}\` ASC`,
      [stateName, cityName, 1, nowDb().slice(0, 10)],
    );
    const events = rows.map((e) => {
      const date = e.date ? String(e.date) : null;
      const time = e.event_time ? String(e.event_time) : null;
      return {
        name: language === 'hi' && !phpEmpty(e.name_hi) ? e.name_hi : e.name,
        date: date ? formatDateDMY(date) : null,
        time: time ? formatTimeHiA(time) : null,
        today: date ? isTodayIst(date) : false,
        id: e.id,
        image: e.image ? laravelUrl(req, e.image) : null,
      };
    });

    // Laravel quirk: a Collection is always truthy, so the `else` branch is unreachable.
    return sendResponse(true, 'Events Founds.', { events, advertisement_data: advertisementData });
  } catch (e) {
    console.error('Error retrieving getting dashboard categories', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-business-event-details. */
export async function getBusinessEventDetails(req: Request) {
  try {
    const input = req.input;
    const v = await validate(
      input,
      {
        event_id: 'required|string|exists:events,id',
        cityName: 'required|string',
        language: 'required|in:en,hi',
        stateName: 'required|string',
        location: 'required',
      },
      {
        'event_id.required': 'Id is required.',
        'event_id.exists': 'Event not found!',
        'cityName.required': 'City is required.',
        'stateName.required': 'State is required.',
        'language.required': 'Language is required.',
        'location.required': 'Location is Required.',
      },
    );
    if (v.fails()) return sendResponse(false, v.first());

    const language = input.language;
    const event = await first('SELECT * FROM events WHERE id = ? LIMIT 1', [input.event_id]);
    if (!event) return sendResponse(false, 'Events Not found!');

    const name = language === 'hi' ? event.name_hi : event.name;
    const about = language === 'hi' ? event.event_description_hi : event.short_description;
    const date = event.date ? String(event.date) : null;
    const time = event.event_time ? String(event.event_time) : null;

    const mappedEvents = {
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
      data: mappedEvents,
      advertisement_data: advertisementData,
    });
  } catch (e) {
    console.error('Error retrieving business event details', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}
