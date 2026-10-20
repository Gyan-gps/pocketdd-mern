// Phase 9A — Admin\Business*CrudController (business, detail, image, location, owner, request management).
// Types inferred from the PHP: form field types / FormRequest rules / writes in store()/update().
import type { SchemaPatch } from './types.js';

const V = 'VARCHAR(191) NULL';

export const patch: SchemaPatch = {
  columns: {
    businesses: {
      mediator: V, // select2_from_array of BusinessUser ids; searched with LIKE
      pan: V,
      aadhaar: V,
      gst: V,
      valid_till: V, // '3_months' … '10_years'
      business_payment_mode: V, // Fees | Advertisement | Free
      business_fess: V,
      fees_type: V,
      keywords_hi: 'TEXT NULL',
    },
    business_users: { designation: V }, // BusinessUser::where('designation', 'mediator')
    users: { is_business_owner: 'TINYINT NULL' }, // User::insertGetId([... 'is_business_owner' => '1'])
    business_owners: { user_id: 'BIGINT UNSIGNED NULL' },
    business_details: { other_partner_name: V, address_line: V, pincode_id: 'BIGINT UNSIGNED NULL' },
  },
};
