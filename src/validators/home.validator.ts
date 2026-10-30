// Request validation for the home endpoints (Api\ApiController).
import type { ValidationSchema } from '../core/validation/validator.js';

export const dashboardDataValidation: ValidationSchema = {
  rules: { cityName: 'required', language: 'required' },
  messages: {
    'cityName.required': 'Location is required.',
    'language.required': 'Language is required.',
  },
};

export const homeCategorySearchValidation: ValidationSchema = {
  rules: { search: 'required|string', location: 'nullable|string' },
  messages: {
    'search.required': 'Please provide the Search Item.',
  },
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

export const allBusinessValidation: ValidationSchema = {
  rules: { slug: 'required|string', cityName: 'required|string', language: 'required|in:en,hi' },
  messages: {
    'slug.required': 'Slug is required.',
    'slug.exists': 'Business Sub-Category Not found!',
    'cityName.required': 'Location is required.',
    'language.required': 'Language is required.',
  },
};

export const businessDetailsValidation: ValidationSchema = {
  rules: { slug: 'required|string|exists:businesses,slug', cityName: 'required|string', language: 'required|in:en,hi' },
  messages: {
    'slug.required': 'Slug is required.',
    'slug.exists': 'Business not found!',
    'cityName.required': 'Location is required.',
    'language.required': 'Language is required.',
  },
};

export const aboutUsValidation: ValidationSchema = {
  rules: { stateName: 'required|string', cityName: 'required|string', language: 'required|in:en,hi' },
  messages: {
    'cityName.required': 'City is required.',
    'stateName.required': 'State is required.',
    'language.required': 'Language is required.',
  },
};
