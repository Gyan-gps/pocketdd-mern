// Request validation for the business user profile endpoints (Api\BusinessUserProfileController).
import type { Messages, ValidationSchema } from '../core/validation/validator.js';

export const UPDATE_PROFILE_MESSAGES: Messages = {
  'name.required': 'Please enter your name',
  'email.unique': 'This email is already in use.',
};

/** update-user-profile, first step: the name. */
export const updateProfileNameValidation: ValidationSchema = {
  rules: { name: 'required|string' },
  messages: UPDATE_PROFILE_MESSAGES,
};

/** update-user-profile, second step: the email (uniqueness is checked by the controller). */
export const updateProfileEmailValidation: ValidationSchema = {
  rules: { email: 'nullable|email' },
  messages: UPDATE_PROFILE_MESSAGES,
};
