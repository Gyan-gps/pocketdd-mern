// ADMIN PANEL lookup routes (Admin CRUD controllers' getStateCities / getPincodeByStateCity / ...).
import type { SchemaPatch } from './types.js';

export const patch: SchemaPatch = {
  columns: {
    // PinCodeCrudController::getCodes
    pincodes: { state_code: 'VARCHAR(191) NULL', district_code: 'VARCHAR(191) NULL' },
    // BusinessCrudController::getBusinessSubCategories
    business_sub_categories: { name_hi: 'VARCHAR(191) NULL' },
    // <X>::pluck('pincode_id') in getPincodeByStateCity
    business_users: { pincode_id: 'BIGINT UNSIGNED NULL' },
    city_helpline_numbers: { pincode_id: 'BIGINT UNSIGNED NULL' },
    events: { pincode_id: 'BIGINT UNSIGNED NULL' },
    administrators: { pincode_id: 'BIGINT UNSIGNED NULL' },
  },
};
