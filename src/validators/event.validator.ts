// Request validation for the event endpoints (Api\EventController).
import type { ValidationSchema } from '../core/validation/validator.js';

export const listBusinessEventsValidation: ValidationSchema = {
  rules: {
    stateName: 'required|string',
    cityName: 'required|string',
    language: 'required|in:en,hi',
    location: 'required',
  },
  messages: {
    'location.required': 'Location is required.',
    'cityName.required': 'City is required.',
    'stateName.required': 'State is required.',
    'language.required': 'Language is required.',
  },
};

export const businessEventDetailsValidation: ValidationSchema = {
  rules: {
    event_id: 'required|string|exists:events,id',
    cityName: 'required|string',
    language: 'required|in:en,hi',
    stateName: 'required|string',
    location: 'required',
  },
  messages: {
    'event_id.required': 'Id is required.',
    'event_id.exists': 'Event not found!',
    'cityName.required': 'City is required.',
    'stateName.required': 'State is required.',
    'language.required': 'Language is required.',
    'location.required': 'Location is Required.',
  },
};
