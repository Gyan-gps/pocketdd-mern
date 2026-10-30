// App\Models\BusinessUser — staff profiles. Collection `business_users`, migrated from MySQL table `business_users`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

/** Embedded business_users_location row; the parent id (`business_user_id`) is the parent document's `_id`. */
export const businessUserLocationSchema = new Schema(
  {
    id: column.int(),
    temp_location_id: column.int(),
    location_id: column.int(),
    language: column.string({ default: 'en' }),
    created_at: column.string(),
    updated_at: column.string(),
  },
  subdocumentOptions,
);

export const businessUserSchema = new Schema(
  {
    _id: column.int(),
    user_id: column.int(),
    name: column.string(),
    address_line_1: column.string(),
    street_address: column.string(),
    post: column.string(),
    tahsil: column.string(),
    pincode: column.string(),
    district: column.string(),
    state: column.string(),
    phone: column.string(),
    email: column.string(),
    lft: column.int(),
    rgt: column.int(),
    depth: column.int(),
    parent_id: column.int(),
    password: column.string(),
    profile_img: column.string(),
    description: column.string(),
    status: column.int({ default: '0' }),
    created_at: column.string(),
    updated_at: column.string(),
    pincode_id: column.int(),
    designation: column.string(),
    aadhar_no: column.string(),
    description_hi: column.string(),
    locations: column.embedded(businessUserLocationSchema, { table: 'business_users_location', foreignKey: 'business_user_id' }),
  },
  legacySchemaOptions('business_users', 'business_users'),
);
businessUserSchema.index({ user_id: 1 });
businessUserSchema.index({ 'locations.id': 1 });

export const BusinessUser = model('BusinessUser', businessUserSchema);
