// Request validation for the Business Sub-Category admin screen
// (App\Http\Requests\BusinessSubCategoryRequest / BusinessSubCategoryUpdateRequest).
import type { ValidationSchema } from '../../core/validation/validator.js';

export const createBusinessSubCategoryValidation: ValidationSchema = {
  rules: {
    name: 'required|string|max:255|unique:business_sub_categories,name',
    name_hi: 'required|string|max:255',
    img: 'required|image|mimes:png,jpg,jpeg,svg|max:2048',
    parent_id: 'required|exists:business_categories,id',
  },
  messages: {
    'parent_id.required': 'Please select a category.',
    'parent_id.exists': 'Selected category does not exist.',
    'name.required': 'Sub-category name is required.',
    'name.string': 'Sub-category name must be a valid string.',
    'name.unique': 'This sub-category name already exists.',
    'name_hi.required': 'Sub-category name (Hindi) is required.',
    'img.required': 'Sub-category image is required.',
    'img.image': 'Image must be a valid image format.',
    'img.mimes': 'Allowed image types: png, jpg, jpeg, svg.',
    'img.max': 'Image size must be less than 2MB.',
  },
};

// Laravel quirk: validates `parent_id_display` (an editable select) but the hidden `parent_id` is what gets saved.
export const updateBusinessSubCategoryValidation: ValidationSchema = {
  rules: {
    name: 'required|string|max:255',
    name_hi: 'required|string|max:255',
    img: 'nullable|image|mimes:png,jpg,jpeg,svg|max:2048',
    parent_id_display: 'required|exists:business_categories,id',
  },
  messages: {
    'parent_id_display.required': 'Please select a category.',
    'parent_id_display.exists': 'Selected category does not exist.',
    'name.required': 'Sub-category name is required.',
    'name.string': 'Sub-category name must be a valid string.',
    'name_hi.required': 'Sub-category name (Hindi) is required.',
    'img.image': 'Image must be a valid image format.',
    'img.mimes': 'Allowed image types: png, jpg, jpeg, svg.',
    'img.max': 'Image size must be less than 2MB.',
  },
};
