// Phase 3 — Api\ApiController (home / dashboard / business listing). All types inferred from usage.
import type { SchemaPatch } from './types.js';

export const patch: SchemaPatch = {
  columns: {
    business_sub_categories: { name_hi: 'VARCHAR(191) NULL' },
    businesses: {
      business_name_en: 'VARCHAR(191) NULL',
      business_name_hi: 'VARCHAR(191) NULL',
      keywords: 'TEXT NULL',
      state_hi: 'VARCHAR(191) NULL',
      dist_hi: 'VARCHAR(191) NULL',
      tehsil_en: 'VARCHAR(191) NULL',
      area_en: 'VARCHAR(191) NULL',
      area_hi: 'VARCHAR(191) NULL',
      address_line_1_en: 'VARCHAR(191) NULL',
      address_line_1_hi: 'VARCHAR(191) NULL',
      pincode_hi: 'VARCHAR(191) NULL',
      to_show: 'TINYINT NULL',
      from_date: 'DATE NULL',
      exp_date: 'DATE NULL',
      business_contact_1: 'VARCHAR(191) NULL',
      business_contact_2: 'VARCHAR(191) NULL',
      business_contact_3: 'VARCHAR(191) NULL',
      business_contact_4: 'VARCHAR(191) NULL',
      about_en: 'TEXT NULL',
      about_hi: 'TEXT NULL',
      business_email: 'VARCHAR(191) NULL',
      image_1: 'VARCHAR(191) NULL',
      image_2: 'VARCHAR(191) NULL',
      image_3: 'VARCHAR(191) NULL',
      image_4: 'VARCHAR(191) NULL',
      social_media_url: 'TEXT NULL',
    },
    advertisments: { sub_category_name: 'JSON NULL' },
  },
};
