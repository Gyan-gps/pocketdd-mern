// Request validation for the Designation admin screens (DesignationRequest / DesignationUpdateRequest).
import type { ValidationSchema } from '../../core/validation/validator.js';

export const designationValidation: ValidationSchema = {
  rules: { name: 'required|min:5|max:255' },
};
