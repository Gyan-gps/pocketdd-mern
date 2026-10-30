// App\Models\BusinesseRequest — business change requests. Collection `business_requests`, migrated from MySQL table `businesse_requests`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const businessRequestSchema = new Schema(
  {
    _id: column.int(),
    business_id: column.int(),
    status: column.int({ default: '0' }),
    created_at: column.string(),
    updated_at: column.string(),
    is_business_approved: column.int({ default: '0' }),
    user_id: column.int(),
    business_category_id: column.int(),
    business_sub_category_id: column.int(),
    business_username: column.string(),
    business_name: column.string(),
    address_line: column.string(),
    street_address: column.string(),
    area_name: column.string(),
    tahsil: column.string(),
    pincode: column.string(),
    district: column.string(),
    state: column.string(),
    business_email: column.string(),
    mobile_number: column.string(),
    business_image: column.string(),
  },
  legacySchemaOptions('business_requests', 'businesse_requests'),
);
businessRequestSchema.index({ user_id: 1 });

export const BusinessRequest = model('BusinessRequest', businessRequestSchema);
