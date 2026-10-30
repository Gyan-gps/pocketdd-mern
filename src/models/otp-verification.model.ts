// App\Models\OtpVerification. Collection `otp_verifications`, migrated from MySQL table `otp_verifications`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const otpVerificationSchema = new Schema(
  {
    _id: column.int(),
    phone_number: column.string(),
    otp: column.string(),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('otp_verifications', 'otp_verifications'),
);
otpVerificationSchema.index({ phone_number: 1 });

export const OtpVerification = model('OtpVerification', otpVerificationSchema);
