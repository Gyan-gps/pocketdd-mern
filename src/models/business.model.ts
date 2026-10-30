// App\Models\Business — listed businesses. Collection `businesses`, migrated from MySQL table `businesses`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

/** Embedded business_details row; the parent id (`business_id`) is the parent document's `_id`. */
export const businessDetailSchema = new Schema(
  {
    id: column.int(),
    street_address: column.string(),
    post: column.string(),
    tahsil: column.string(),
    district: column.string(),
    state: column.string(),
    business_email: column.string(),
    business_mobile_number: column.string(),
    description: column.string(),
    summaries: column.string(),
    created_at: column.string(),
    updated_at: column.string(),
    pincode: column.string(),
    other_partner_name: column.string(),
    address_line: column.string(),
    pincode_id: column.int(),
  },
  subdocumentOptions,
);

/** Embedded business_iamges row (table name typo kept from Laravel); the parent id (`business_id`) is the parent document's `_id`. */
export const businessImageSchema = new Schema(
  {
    id: column.int(),
    img: column.string(),
    created_at: column.string(),
    updated_at: column.string(),
  },
  subdocumentOptions,
);

/** Embedded business_locations row; the parent id (`business_id`) is the parent document's `_id`. */
export const businessLocationSchema = new Schema(
  {
    id: column.int(),
    location_id: column.int(),
    created_at: column.string(),
    updated_at: column.string(),
  },
  subdocumentOptions,
);

/** Embedded business_owners row; the parent id (`business_id`) is the parent document's `_id`. */
export const businessOwnerSchema = new Schema(
  {
    id: column.int(),
    name: column.string(),
    phone: column.string(),
    created_at: column.string(),
    updated_at: column.string(),
    user_id: column.int(),
  },
  subdocumentOptions,
);

export const businessSchema = new Schema(
  {
    _id: column.int(),
    user_id: column.int(),
    business_category_id: column.int(),
    business_sub_category_id: column.int(),
    name: column.string(),
    lft: column.int(),
    rgt: column.int(),
    depth: column.int(),
    parent_id: column.int(),
    address: column.string(),
    city: column.string(),
    logo: column.string(),
    slug: column.string(),
    status: column.int({ default: '0' }),
    created_at: column.string(),
    updated_at: column.string(),
    state_en: column.string(),
    dist_en: column.string(),
    business_name_en: column.string(),
    business_name_hi: column.string(),
    keywords: column.string(),
    state_hi: column.string(),
    dist_hi: column.string(),
    tehsil_en: column.string(),
    area_en: column.string(),
    area_hi: column.string(),
    address_line_1_en: column.string(),
    address_line_1_hi: column.string(),
    pincode_hi: column.string(),
    to_show: column.int(),
    from_date: column.string(),
    exp_date: column.string(),
    business_contact_1: column.string(),
    business_contact_2: column.string(),
    business_contact_3: column.string(),
    business_contact_4: column.string(),
    about_en: column.string(),
    about_hi: column.string(),
    business_email: column.string(),
    image_1: column.string(),
    image_2: column.string(),
    image_3: column.string(),
    image_4: column.string(),
    social_media_url: column.decodedJson('string'),
    owner_name_en: column.string(),
    owner_name_hi: column.string(),
    pincode_id: column.int(),
    owner_email: column.string(),
    owner_number_1: column.string(),
    tehsil_hi: column.string(),
    receipt_number: column.string(),
    business_request_id: column.int(),
    is_business_approved: column.int({ default: '0' }),
    mediator: column.string(),
    pan: column.string(),
    aadhaar: column.string(),
    gst: column.string(),
    valid_till: column.string(),
    business_payment_mode: column.string(),
    business_fess: column.string(),
    fees_type: column.string(),
    keywords_hi: column.string(),
    details: column.embedded(businessDetailSchema, { table: 'business_details', foreignKey: 'business_id' }),
    images: column.embedded(businessImageSchema, { table: 'business_iamges', foreignKey: 'business_id' }),
    locations: column.embedded(businessLocationSchema, { table: 'business_locations', foreignKey: 'business_id' }),
    owners: column.embedded(businessOwnerSchema, { table: 'business_owners', foreignKey: 'business_id' }),
  },
  legacySchemaOptions('businesses', 'businesses'),
);
businessSchema.index({ slug: 1 });
businessSchema.index({ status: 1, to_show: 1 });
businessSchema.index({ business_category_id: 1 });
businessSchema.index({ business_sub_category_id: 1 });
businessSchema.index({ user_id: 1 });
businessSchema.index({ pincode_id: 1 });
businessSchema.index({ dist_en: 1 });
businessSchema.index({ 'locations.location_id': 1 });
businessSchema.index({ 'details.id': 1 });
businessSchema.index({ 'images.id': 1 });
businessSchema.index({ 'locations.id': 1 });
businessSchema.index({ 'owners.id': 1 });
// Ready for "near me" search once businesses get a `geo: { type: 'Point', coordinates: [lng, lat] }`.
businessSchema.index({ geo: '2dsphere' }, { sparse: true });

export const Business = model('Business', businessSchema);
