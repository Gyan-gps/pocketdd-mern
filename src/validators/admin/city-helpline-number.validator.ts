// Request validation for the CityHelplineNumber admin screens
// (CityHelplineNumberRequest / CityHelplineNumberUpdateRequest).
import type { Messages, ValidationSchema } from '../../core/validation/validator.js';

const HELPLINE_RULES = {
  'city_helpline.*.ambulance_number': 'required',
  'city_helpline.*.fire_safety_number': 'required',
  'city_helpline.*.women_helpline': 'required',
  'city_helpline.*.police_headquarters': 'required',
};

const CITY_HELPLINE_MESSAGES: Messages = {
  'city_helpline.*.ambulance_number.required': 'Ambulance Number is Required',
  'city_helpline.*.fire_safety_number.required': 'Fire Safety Number is Required',
  'city_helpline.*.women_helpline.required': 'Women Helpline Number is Required',
  'city_helpline.*.police_headquarters.required': 'Police Headquarter Number is Required',
  // Laravel: a message keyed by the bare attribute applies to every rule of that attribute.
  state: 'State is Required!',
  city: 'City is Required!',
  pincode_id: 'PinCode is Required!',
};

export const createCityHelplineNumberValidation: ValidationSchema = {
  rules: { ...HELPLINE_RULES, state: 'required', city: 'required', pincode_id: 'required' },
  messages: CITY_HELPLINE_MESSAGES,
};

export const updateCityHelplineNumberValidation: ValidationSchema = {
  rules: { ...HELPLINE_RULES, state: 'required', city: 'required' },
  messages: CITY_HELPLINE_MESSAGES,
};
