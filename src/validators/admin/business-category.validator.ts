// Request validation for the Business Category admin screen
// (App\Http\Requests\BusinessCategoryRequest / BusinessCategoryUpdateRequest).
import type { ValidationSchema } from '../../core/validation/validator.js';

const BUSINESS_CATEGORY_MESSAGES = {
  'name.required': 'Business Category Name is required.',
  'name.string': 'Business Category Name must be a valid string.',
  'name.max': 'Business Category Name must not exceed 255 characters.',
  'name.unique': 'This Business Category Name already exists.',
  'name_hi.required': 'Business Category Name (Hindi) is required.',
  'name_hi.string': 'Business Category Name (Hindi) must be a valid string.',
  'name_hi.max': 'Business Category Name (Hindi) must not exceed 255 characters.',
  'img.required': 'Category image is required.',
  'img.image': 'The uploaded file must be an image.',
  'img.mimes': 'Only PNG, JPG, JPEG, and SVG formats are allowed.',
  'img.max': 'Image size must not exceed 2MB.',
};

export const createBusinessCategoryValidation: ValidationSchema = {
  rules: {
    name: 'required|string|max:255|unique:business_categories,name',
    name_hi: 'required|string|max:255',
    img: 'required|image|mimes:png,jpg,jpeg,svg|max:2048',
  },
  messages: BUSINESS_CATEGORY_MESSAGES,
};

export const updateBusinessCategoryValidation: ValidationSchema = {
  rules: {
    name: 'required|string|max:255',
    name_hi: 'required|string|max:255',
    img: 'nullable|image|mimes:png,jpg,jpeg,svg|max:2048',
  },
  messages: BUSINESS_CATEGORY_MESSAGES,
};
