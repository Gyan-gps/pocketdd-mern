// Request validation for the notification endpoints (Api\NotificationController).
import type { ValidationSchema } from '../core/validation/validator.js';

export const markAsReadValidation: ValidationSchema = {
  rules: { notification_id: 'required' },
  messages: {},
};

/** Shared by `notifications` and `get-user-notification-count`. */
export const notificationLanguageValidation: ValidationSchema = {
  rules: { stateName: 'required|string', cityName: 'required|string', language: 'required|in:en,hi' },
  messages: {
    'stateName.required': 'State is required.',
    'cityName.required': 'City is required.',
    'language.required': 'Language is required.',
    'language.in': 'Language must be either en or hi.',
  },
};
