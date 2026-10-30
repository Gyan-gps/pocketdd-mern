// Request validation for the business endpoints (Api\BusinessController).
// Rules are checked attribute by attribute in this order (see firstValidationError() in the controller).
import type { ValidationSchema } from '../core/validation/validator.js';

export const businessCategoriesValidation: ValidationSchema = {
  rules: { language: 'required' },
  messages: { 'language.required': 'Language is required.' },
};

export const businessSubCategoriesValidation: ValidationSchema = {
  rules: { category_slug: 'required|string|exists:business_categories,slug', cityName: 'required', language: 'required' },
  messages: {
    'category_slug.required': 'Category is required.',
    'category_slug.exists': 'Category not found.',
    'language.required': 'Language is required.',
    'cityName.required': 'Location is required.',
  },
};

export const addBusinessImageValidation: ValidationSchema = {
  rules: { image: 'required' },
  messages: { 'image.required': 'image is required.' },
};

export const deleteBusinessImageValidation: ValidationSchema = {
  rules: { image_id: 'required' },
  messages: { 'image_id.required': 'image not found.' },
};

export const updateBusinessImageValidation: ValidationSchema = {
  rules: { image_id: 'required', image: 'required' },
  messages: {
    'image_id.required': 'image not found.',
    'image.required': 'Please add image.',
  },
};

export const updateUserBusinessDetailsValidation: ValidationSchema = {
  rules: { name: 'required', city: 'required', address: 'required' },
  messages: {
    'name.required': 'Business name is required.',
    // PHP message key is just 'city' (applies to every rule of the attribute).
    'city.required': 'City is required',
    'address.required': 'Business address is required.',
  },
};

/** add-new-business-request; `number`, `business_email` and `pincode` also run closures (controller). */
export const newBusinessRequestValidation: ValidationSchema = {
  rules: {
    business_username: 'required',
    number: 'required',
    business_email: 'required',
    business_category: 'required',
    state: 'required',
    district: 'required',
    pincode: 'required|digits:6',
  },
  messages: {
    'business_username.required': 'Business username is required.',
    'number.required': 'Mobile number is required.',
    'business_email.required': 'Business email is required.',
    'business_category.required': 'Business category is required.',
    'state.required': 'State is required.',
    'district.required': 'District is required.',
    'pincode.required': 'Pincode is required.',
    'pincode.digits': 'Pincode must be exactly 6 digits.',
  },
};

/**
 * update-business: every field is `sometimes` when the user already has a business, `required` otherwise;
 * `number` and `business_email` also run closures (controller).
 */
export function updateBusinessValidation(presence: 'sometimes' | 'required'): ValidationSchema {
  return {
    rules: {
      business_username: `${presence}|string|max:100`,
      business_category: `${presence}|string`,
      state: `${presence}|string`,
      district: `${presence}|string`,
      pincode: `${presence}|digits:6`,
      number: `${presence}|digits:10`,
      business_email: `${presence}|email`,
    },
    messages: { 'number.digits': 'Mobile number must be 10 digits.', 'pincode.digits': 'Pincode must be 6 digits.' },
  };
}
