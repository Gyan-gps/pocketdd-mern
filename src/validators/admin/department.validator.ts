// Request validation for the Department admin screen (App\Http\Requests\DepartmentRequest / DepartmentUpdateRequest).
import type { ValidationSchema } from '../../core/validation/validator.js';

const DEPARTMENT_MESSAGES = {
  'department_name.required': 'Please enter the department name (English)',
  'department_name_hi.required': 'कृपया विभाग का नाम (हिंदी) दर्ज करें।',
  'department_name.unique': 'The department name (English) already exists',
  'department_name_hi.unique': 'विभाग का नाम (हिंदी) पहले से मौजूद है।',
};

export const createDepartmentValidation: ValidationSchema = {
  rules: {
    department_name: 'required|max:255|unique:departments,department_name',
    department_name_hi: 'required|max:255|unique:departments,department_name_hi',
  },
  messages: DEPARTMENT_MESSAGES,
};

export const updateDepartmentValidation: ValidationSchema = {
  rules: { department_name: 'required|min:5|max:255', department_name_hi: 'required|min:5|max:255' },
  messages: DEPARTMENT_MESSAGES,
};
