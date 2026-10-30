// Request validation for the Staff Management admin screens (BusinessUserRequest / BusinessUserUpdateRequest).
import type { Messages, ValidationSchema } from '../../core/validation/validator.js';

const BUSINESS_USER_COMMON_MESSAGES: Messages = {
  'name.required': 'Name is required',
  'name.min': 'Name must be at least 1 character',
  'name.max': 'Name may not be greater than 255 characters',
  'phone.required': 'Phone is required',
  'phone.unique': 'Phone number must be unique',
  'email.email': 'Email must be a valid email address',
  'email.unique': 'Email must be unique',
  'address_line_1.required': 'Address Line is required',
  'street_address.required': 'Street Address is required',
  'aadhar_no.required': 'Aadhar Number is required',
  'aadhar_no.unique': 'Aadhar Number must be unique',
  'description_hi.required': 'Description in Hindi is required',
  'tahsil.required': 'Tahsil is required',
  'pincode_id.required': 'Pincode is required',
  'district.required': 'District is required',
  'state.required': 'State is required',
  'designation.required': 'Designation is required',
};

export const createBusinessUserValidation: ValidationSchema = {
  rules: {
    name: 'required|min:1|max:255',
    phone: 'required|unique:business_users,phone',
    tahsil: 'required',
    pincode_id: 'required',
    district: 'required',
    state: 'required',
    designation: 'required',
    aadhar_no: 'nullable|unique:business_users,aadhar_no',
  },
  messages: {
    ...BUSINESS_USER_COMMON_MESSAGES,
    'profile_img.image': 'Profile Picture must be an image',
    'description.required': 'User description is required',
  },
};

export const UPDATE_BUSINESS_USER_MESSAGES: Messages = {
  ...BUSINESS_USER_COMMON_MESSAGES,
  'description.required': 'User details are mandatory.',
};

/** BusinessUserUpdateRequest rules; `staffId` is `$this->get('id') ?? request()->route('id')`. */
export const updateBusinessUserRules = (staffId: unknown) => ({
  name: 'required',
  phone: `required|digits:10|unique:business_users,phone,${staffId}`,
  tahsil: 'required',
  district: 'required',
  state: 'required',
  designation: 'required',
  aadhar_no: `nullable|unique:business_users,aadhar_no,${staffId}`,
});
