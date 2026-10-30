// Request validation for the public administration endpoints (Api\AdministrationController).
import type { ValidationSchema } from '../core/validation/validator.js';

export const publicDepartmentsValidation: ValidationSchema = {
  rules: { cityName: 'required|string', language: 'required|in:en,hi' },
  messages: {
    'cityName.required': 'Location is required.',
    'language.required': 'Language is required.',
  },
};

export const publicDepartmentOfficersValidation: ValidationSchema = {
  rules: { department_slug: 'required|string|exists:departments,slug', cityName: 'required', language: 'required' },
  messages: {
    'department_slug.required': 'Department is required.',
    'department_slug.exists': 'Department not found.',
    'language.required': 'Language is required.',
    'cityName.required': 'Location is required.',
  },
};
