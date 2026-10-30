// Request validation for the PinCode admin screens (PinCodeRequest / PincodeUpdateRequest).
import type { ValidationSchema } from '../../core/validation/validator.js';

export const createPincodeValidation: ValidationSchema = {
  rules: {
    pin_code: 'required|unique:pincodes,pin_code',
    city: 'required',
    district_code: 'required',
    state: 'required',
    state_code: 'required',
  },
  messages: {
    'pin_code.required': 'PinCode is required.',
    'pin_code.unique': 'This PinCode already exists.',
    'city.required': 'District is required.',
    'district_code.required': 'District Code is required.',
    'state.required': 'State is required.',
    'state_code.required': 'State Code is required.',
  },
};

// PincodeUpdateRequest::messages() only has (copy-pasted) business-category keys → raw `validation.required`.
export const updatePincodeValidation: ValidationSchema = {
  rules: {
    pin_code: 'required',
    city: 'required',
    city_hi: 'required',
    district_code: 'required',
    state: 'required',
    state_hi: 'required',
    state_code: 'required',
  },
};
