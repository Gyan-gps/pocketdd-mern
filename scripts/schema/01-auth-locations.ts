// Api\AuthController
import { TS, type SchemaPatch } from './types.js';

export const patch: SchemaPatch = {
  tables: {
    otp_verifications: { columns: { phone_number: 'VARCHAR(191) NULL', otp: 'VARCHAR(191) NULL', ...TS } },
    app_versions: {
      columns: {
        is_show_in_app_update: 'TINYINT(1) NOT NULL DEFAULT 0',
        current_version_code: 'INT NULL',
        current_version_name: 'VARCHAR(191) NULL',
        is_force_update: 'TINYINT(1) NOT NULL DEFAULT 0',
        description: 'TEXT NULL',
        ...TS,
      },
    },
    ad_user_views: {
      columns: { device_id: 'VARCHAR(191) NULL', ad_id: 'BIGINT UNSIGNED NULL', ...TS },
      // insertOrIgnore() in saveAdView relies on a unique key.
      extra: ['UNIQUE KEY ad_user_views_device_id_ad_id_unique (device_id, ad_id)'],
    },
  },
  columns: {
    users: {
      fcm_token: 'TEXT NULL',
      user_icon: 'VARCHAR(191) NULL',
      is_mobile_user: 'TINYINT NULL',
      state: 'VARCHAR(191) NULL',
      district: 'VARCHAR(191) NULL',
      address_line: 'VARCHAR(191) NULL',
      street_address: 'VARCHAR(191) NULL',
    },
    pincodes: { state_hi: 'VARCHAR(191) NULL', city_hi: 'VARCHAR(191) NULL' },
    business_categories: { name_hi: 'VARCHAR(191) NULL' },
    businesses: { state_en: 'VARCHAR(191) NULL', dist_en: 'VARCHAR(191) NULL' },
    advertisments: { ads_position: 'VARCHAR(191) NULL', ads_location: 'VARCHAR(191) NULL' },
  },
  // verifyMobileOtp() inserts users with only a phone number.
  nullable: { users: ['name', 'email'] },
};
