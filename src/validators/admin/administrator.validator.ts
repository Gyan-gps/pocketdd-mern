// Request validation for the Administrator admin screens (AdministratorRequest / AdministratorUpdateRequest).
import type { ValidationSchema } from '../../core/validation/validator.js';

export const administratorValidation: ValidationSchema = {
  rules: {
    department_id: 'required',
    'officer_rank_name.*.officer_rank': 'required',
    'officer_rank_name.*.officer_rank_hi': 'required',
    'officer_rank_name.*.officer_number': 'required',
  },
  messages: {
    'department_id.required': 'Department is not selected! / विभाग चयनित नहीं किया गया है!',
    'officer_rank_name.*.officer_rank.required':
      'Officer rank (English) is not entered! / अधिकारी रैंक (अंग्रेज़ी) दर्ज नहीं की गई है!',
    'officer_rank_name.*.officer_rank_hi.required':
      'Officer rank (Hindi) is not entered! / अधिकारी रैंक (हिंदी) दर्ज नहीं की गई है!',
    'officer_rank_name.*.officer_number.required':
      'Number of officers is not entered! / अधिकारियों की संख्या दर्ज नहीं की गई है!',
  },
};
