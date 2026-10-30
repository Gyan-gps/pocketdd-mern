// App\Models\User — app users and admins. Collection `users`, migrated from MySQL table `users`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const userSchema = new Schema(
  {
    _id: column.int(),
    name: column.string(),
    email: column.string(),
    phone: column.string(),
    email_verified_at: column.string(),
    password: column.string(),
    status: column.int(),
    remember_token: column.string(),
    created_at: column.string(),
    updated_at: column.string(),
    fcm_token: column.string(),
    user_icon: column.string(),
    is_mobile_user: column.int(),
    state: column.string(),
    district: column.string(),
    address_line: column.string(),
    street_address: column.string(),
    about_us: column.string(),
    tehsil: column.string(),
    pincode: column.string(),
    post_address: column.string(),
    is_business_owner: column.int(),
  },
  legacySchemaOptions('users', 'users'),
);
userSchema.index({ phone: 1 });
userSchema.index({ email: 1 });

export const User = model('User', userSchema);
