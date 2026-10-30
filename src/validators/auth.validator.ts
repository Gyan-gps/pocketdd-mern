// Request validation for the auth / location / device endpoints (Api\AuthController).
import type { ValidationSchema } from '../core/validation/validator.js';

export const storeDeviceIdValidation: ValidationSchema = {
  rules: { device_id: 'required' },
  messages: { 'device_id.required': 'Device ID is required.' },
};

export const sendLoginOtpValidation: ValidationSchema = {
  rules: { phone: 'required|digits:10' },
  messages: {
    'phone.required': 'Phone number is required.',
    'phone.digits': 'Phone number must be 10 digits.',
  },
};

export const verifyMobileOtpValidation: ValidationSchema = {
  rules: { phone: 'required|digits:10', client_otp: 'required' },
  messages: {
    'phone.required': 'Phone number is required.',
    'client_otp.required': 'OTP is required.',
    'phone.digits': 'Phone number must be 10 digits.',
  },
};

export const statesCitiesValidation: ValidationSchema = {
  rules: { state: 'required' },
  messages: { 'state.required': 'State is required.' },
};

export const allCategoriesValidation: ValidationSchema = {
  rules: { cityName: 'required', language: 'required' },
  messages: {
    'cityName.required': 'Location is required.',
    'language.required': 'Language is required.',
  },
};

export const pincodeByStateCityValidation: ValidationSchema = {
  rules: { state: 'required|string', city: 'required|string', language: 'required' },
  messages: {
    'state.required': 'State is required.',
    'state.exists': 'State is invalid.',
    'city.required': 'City is required.',
    'city.exists': 'City is required.',
    'language.required': 'Language is required.',
  },
};

export const tehsilsByStateCityValidation: ValidationSchema = {
  rules: { state: 'required|string', city: 'required|string', pincode: 'required' },
};

export const tehsilsValidation: ValidationSchema = {
  rules: { state: 'required|string', city: 'required|string', language: 'required|in:en,hi' },
  messages: {
    'state.required': 'State is required.',
    'state.exists': 'State does not exist.',
    'city.required': 'City is required.',
    'city.exists': 'City does not exist.',
    'language.required': 'Language is required.',
    'language.in': 'Language must be either en or hi.',
  },
};

export const areaByTehsilsValidation: ValidationSchema = {
  rules: { state: 'required|string', city: 'required|string', language: 'required|in:en,hi', tehsil: 'required' },
  messages: {
    'state.required': 'State is required.',
    'state.exists': 'State does not exist.',
    'city.required': 'City is required.',
    'city.exists': 'City does not exist.',
    'language.required': 'Language is required.',
    'language.in': 'Language must be either en or hi.',
    'tehsil.required': 'Tehsil is required.',
  },
};

export const changeLocationNameValidation: ValidationSchema = {
  rules: { language: 'required|in:en,hi' },
  messages: {
    'language.required': 'Language is required.',
    'language.in': 'Language must be either en or hi.',
  },
};

export const popupAdsValidation: ValidationSchema = {
  rules: { stateName: 'required|string', cityName: 'required|string', language: 'required|in:en,hi', device_id: 'required|string' },
  messages: {
    'cityName.required': 'City is required.',
    'stateName.required': 'State is required.',
    'language.required': 'Language is required.',
    'device_id.required': 'Device ID is required.',
  },
};

export const saveAdViewValidation: ValidationSchema = {
  rules: { device_id: 'required|string', ad_ids: 'required|array', 'ad_ids.*': 'exists:advertisments,id' },
  messages: { 'device_id.required': 'Device ID is required.', 'ad_ids.required': 'Advertisment ID is required.' },
};
