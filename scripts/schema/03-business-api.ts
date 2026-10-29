// Api\BusinessController, Api\BusinessLocationController, Api\BusinessUserProfileController.
// Columns inferred from the PHP (Business::insertNewBusiness, updateUserBusiness, updateUserProfile, …).
import type { SchemaPatch } from './types.js';

const V = 'VARCHAR(191) NULL';

export const patch: SchemaPatch = {
  columns: {
    businesses: {
      business_name_en: V,
      business_name_hi: V,
      owner_name_en: V,
      owner_name_hi: V,
      address_line_1_en: V,
      pincode_id: 'BIGINT UNSIGNED NULL',
      pincode_hi: V,
      business_email: V,
      owner_email: V,
      owner_number_1: V,
      business_contact_1: V,
      business_contact_2: V,
      business_contact_3: V,
      business_contact_4: V,
      tehsil_en: V,
      tehsil_hi: V,
      state_hi: V,
      dist_hi: V,
      area_en: V,
      area_hi: V,
      receipt_number: V,
      business_request_id: 'BIGINT UNSIGNED NULL',
      is_business_approved: 'TINYINT NOT NULL DEFAULT 0',
      image_1: V,
      image_2: V,
      image_3: V,
      image_4: V,
      social_media_url: 'LONGTEXT NULL',
    },
    users: { about_us: 'TEXT NULL', tehsil: V, pincode: V, post_address: V },
    business_details: { pincode: V },
    pincodes: { state_code: V, district_code: V },
    business_sub_categories: { name_hi: V },
  },
};
