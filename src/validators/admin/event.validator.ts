// Request validation for the Event admin screens (EventRequest / EventUpdateRequest).
import type { Messages, ValidationSchema } from '../../core/validation/validator.js';

const EVENT_MESSAGES: Messages = {
  'name.required': 'Event Name is required',
  'date.required': 'Event date is required',
  'event_time.required': 'Event Time is required',
  'charge.required': 'Event Charge is required',
  'image.required': 'Event Image is required',
  'short_description.required': 'Event description is required',
  'event_description_hi.required': 'घटना विवरण आवश्यक है',
  'state.required': 'Event State is not selected.',
  'district.required': 'Event City is not selected.',
  'pincode_id.required': 'City pincode  is not selected.',
  'tahsil.required': 'Tahsil is not selected.',
};

export const createEventValidation: ValidationSchema = {
  rules: {
    name: 'required|min:1|max:191',
    date: 'required',
    short_description: 'required',
    event_description_hi: 'required',
    image: 'required',
    charge: 'nullable',
    state: 'required',
    district: 'required',
    pincode_id: 'required',
  },
  messages: EVENT_MESSAGES,
};

export const updateEventValidation: ValidationSchema = {
  rules: {
    name: 'required|min:1|max:191',
    date: 'required',
    short_description: 'required',
    event_description_hi: 'required',
    charge: 'nullable',
    state: 'required',
    district: 'required',
    tahsil: 'required',
  },
  messages: EVENT_MESSAGES,
};

/** `Validator::make(['value' => $term], ['value' => 'date'])` — Backpack's date column search check. */
export const dateSearchTermValidation: ValidationSchema = { rules: { value: 'date' } };
