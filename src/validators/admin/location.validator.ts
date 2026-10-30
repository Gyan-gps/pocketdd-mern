// Request validation for the Location admin screen (App\Http\Requests\LocationRequest / LocationUpdateRequest).
// Laravel quirk: messages() uses the bare attribute key → every location_name failure shows the same text.
import type { ValidationSchema } from '../../core/validation/validator.js';

const LOCATION_MESSAGES = { location_name: 'City name should be unique and required.' };

export const createLocationValidation: ValidationSchema = {
  rules: { location_name: 'required|unique:locations,location_name' },
  messages: LOCATION_MESSAGES,
};

export const updateLocationValidation: ValidationSchema = {
  rules: { location_name: 'required' },
  messages: LOCATION_MESSAGES,
};
