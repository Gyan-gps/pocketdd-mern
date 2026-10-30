// Request validation for the Address admin screens (AddressRequest). The update operation sets no validation.
import type { ValidationSchema } from '../../core/validation/validator.js';

export const createAddressValidation: ValidationSchema = {
  rules: {
    state: 'required',
    city: 'required',
    pincode_id: 'required',
    tehsil: 'required',
    tehsil_hi: 'required',
    'area.*.area_name': 'required',
    'area.*.area_name_hi': 'required',
  },
  messages: {
    'state.required': 'Please select a state.',
    'city.required': 'Please select a city.',
    'pincode_id.required': 'Please select a pincode.',
    'tehsil.required': 'The tehsil field is required.',
    'tehsil_hi.required': 'तहसील फ़ील्ड आवश्यक है.',
    'area.*.area_name.required': 'Each area must have a name.',
    'area.*.area_name_hi.required': 'प्रत्येक क्षेत्र का एक नाम होना चाहिए.',
  },
};

/** No CRUD::setValidation() in setupUpdateOperation(): nothing is validated. */
export const updateAddressValidation: ValidationSchema = { rules: {} };
