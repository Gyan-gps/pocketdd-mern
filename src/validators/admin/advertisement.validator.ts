// Request validation for the Advertisement admin screen (App\Http\Requests\AdvertismentRequest / AdvertismentUpdateRequest).
import type { Rules, ValidationSchema } from '../../core/validation/validator.js';

const ADVERTISEMENT_MESSAGES = {
  'ads_position.required': 'Please select a banner type.',
  'client_name.required': 'Client name is required.',
  'client_name.min': 'Client name must be at least 2 characters.',
  'client_name.max': 'Client name may not exceed 255 characters.',
  'ads_location.required': 'Please select an ad location.',
  'advt_img.required': 'Advertisement image is required.',
  'advt_img.image': 'The uploaded file must be an image.',
  'advt_img.mimes': 'Only PNG, JPG, JPEG, and SVG images are allowed.',
  'advt_img.max': 'Image size must not exceed 2MB.',
  'from_date.required': 'From date is required.',
  'from_date.date': 'From date must be a valid date.',
  'vaild_till.required': 'Please select a valid duration.',
  'to_date.required': 'To date is required.',
  'to_date.date': 'To date must be a valid date.',
  'to_date.after_or_equal': 'To date must be after or equal to From date.',
  'url.url': 'Please enter a valid URL.',
};

/** Both requests share the rule set; only the `advt_img` rule differs. */
const advertisementRules = (imageRule: string): Rules => ({
  ads_position: 'required',
  client_name: 'required',
  ads_location: 'required',
  advt_img: imageRule,
  from_date: 'required|date',
  vaild_till: 'required',
  fees_type: 'required',
  to_date: 'required|date|after_or_equal:from_date',
  url: 'nullable|url',
});

export const createAdvertisementValidation: ValidationSchema = {
  rules: advertisementRules('required|image|mimes:png,jpg,jpeg,svg|max:2048'),
  messages: ADVERTISEMENT_MESSAGES,
};

export const updateAdvertisementValidation: ValidationSchema = {
  rules: advertisementRules('image|mimes:png,jpg,jpeg,svg|max:2048'),
  messages: ADVERTISEMENT_MESSAGES,
};
