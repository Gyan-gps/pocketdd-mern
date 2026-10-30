// Request validation for the admin panel login (Backpack LoginController::validateLogin()).
import type { ValidationSchema } from '../../core/validation/validator.js';

export const adminLoginValidation: ValidationSchema = {
  rules: { email: 'required|string', password: 'required|string' },
};
