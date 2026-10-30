// Request validation for the BusinessDetail admin screens (BusinessDetailRequest / BusinessDetailUpdateRequest).
import type { ValidationSchema } from '../../core/validation/validator.js';

export const businessDetailValidation: ValidationSchema = {
  rules: { business_id: 'required', business_email: 'required|email', business_mobile_number: 'required|digits:10' },
};
