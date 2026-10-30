// Request validation for the AboutUs admin screens (AboutUsRequest / AboutUsUpdateRequest).
import type { Messages, ValidationSchema } from '../../core/validation/validator.js';

const ABOUT_US_BASE_RULES = {
  city: 'required',
  state: 'required',
  about_mediator: 'required',
  about_mediator_hi: 'required',
  know_your_city: 'required',
  know_your_city_hi: 'required',
  tourist_places: 'required|array|min:1|max:10',
  'tourist_places.*.place_name': 'required',
  'tourist_places.*.place_name_hi': 'required',
};

const ABOUT_US_MESSAGES: Messages = {
  'state.required': 'Please select a state.',
  'city.required': 'Please select a city.',
  'about_mediator.required': 'The "Know About the Mediator" field is required.',
  'about_mediator_hi.required': '"मध्यस्थ के बारे में जानें" फ़ील्ड आवश्यक है',
  'know_your_city.required': 'The "Know Your City" field is required.',
  'know_your_city_hi.required': 'The "अपने शहर को जानें" field is required.',
  'tourist_places.*.place_name.required': 'Each tourist place must have a name.',
  'tourist_places.*.place_name_hi.required': 'प्रत्येक पर्यटन स्थल का हिंदी नाम होना चाहिए।',
  'tourist_places.*.place_image.required': 'Each tourist place must have an image.',
  'tourist_places.*.place_image.mimes': 'Images must be in jpg, jpeg, png, or svg format.',
  'tourist_places.*.place_image.max': 'Each image must be less than 2MB.',
  'tourist_places.*.place_description.required': 'Each tourist place must have a description.',
  'tourist_places.*.place_description_hi.required': 'प्रत्येक पर्यटन स्थल का हिंदी विवरण होना चाहिए।',
};

export const createAboutUsValidation: ValidationSchema = {
  rules: {
    ...ABOUT_US_BASE_RULES,
    'tourist_places.*.place_image': 'required|image|mimes:jpg,jpeg,png,svg|max:2048',
    'tourist_places.*.place_description': 'required',
    'tourist_places.*.place_description_hi': 'required',
  },
  messages: ABOUT_US_MESSAGES,
};

export const updateAboutUsValidation: ValidationSchema = {
  rules: {
    ...ABOUT_US_BASE_RULES,
    'tourist_places.*.place_image': 'image|mimes:jpg,jpeg,png,svg|max:2048',
    'tourist_places.*.place_description': 'required',
    'tourist_places.*.place_description_hi': 'required',
  },
  messages: ABOUT_US_MESSAGES,
};
