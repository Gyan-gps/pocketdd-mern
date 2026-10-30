// Request validation for the BusinessImage admin screens (BusinessImageRequest / BusinessImageUpdateRequest).
import type { ValidationSchema } from '../../core/validation/validator.js';

export const createBusinessImageValidation: ValidationSchema = {
  rules: { img: 'required|mimetypes:image/png,image/jpg,image/jpeg,image/svg', business_id: 'required' },
  messages: { 'img.mimetypes': 'Please upload the image in PNG, JPEG, or JPG format.' },
};

export const updateBusinessImageValidation: ValidationSchema = {
  rules: { img: 'required', business_id: 'required' },
};
