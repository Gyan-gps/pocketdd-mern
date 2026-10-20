// Phase 9A fixtures (ids 900–919): Admin\Business*CrudController screens.
// Users here have no fcm_token, so notification jobs never push.
import type { Seed } from './types.js';

const now = '2025-06-19 10:30:00';
const ts = { created_at: now, updated_at: now };

export const P9A = {
  state: 'Paritystate',
  city: 'Paritycity',
  pincodeId: 900,
  categoryId: 900,
  subCategoryId: 900,
  mediatorId: 900,
  ownerUserId: 900,
};

export const BUSINESSES: Array<Record<string, unknown>> = [
  {
    id: 900, user_id: 900, business_category_id: 900, business_sub_category_id: 900, business_name_en: 'Parity Alpha Store',
    business_name_hi: 'पैरिटी अल्फा', owner_name_en: 'Parity Owner', owner_number_1: '9000000900', business_contact_1: '9000000901',
    business_contact_2: '9000000902', mediator: '900', status: 1, is_business_approved: 1, state_en: 'Paritystate', dist_en: 'Paritycity',
    pincode_id: 900, address_line_1_en: 'Parity Road 1', receipt_number: 'PS0125AA900', business_payment_mode: 'Fees', business_fess: '500',
    fees_type: 'Cash', from_date: '2025-06-19', exp_date: '2026-06-19', valid_till: '1_year', slug: 'parity-alpha-store-900',
    logo: 'uploads/business_logo/p9a-logo.png', lft: 901, rgt: 901, depth: 1, ...ts,
  },
  {
    id: 901, user_id: 900, business_category_id: 900, business_sub_category_id: 900, business_name_en: 'Parity Beta Mart',
    owner_name_en: 'Parity Owner', owner_number_1: '9000000900', business_contact_1: '9000000911', mediator: '999', status: 0,
    is_business_approved: 1, state_en: 'Paritystate', dist_en: 'Paritycity', pincode_id: 900, address_line_1_en: 'Parity Road 2',
    receipt_number: 'PS0125AA901', business_payment_mode: 'Free', from_date: '2025-06-18', slug: 'parity-beta-mart-901',
    created_at: '2025-06-18 10:30:00', updated_at: now,
  },
  {
    id: 902, user_id: 900, business_category_id: 900, business_sub_category_id: 900, business_name_en: 'Parity Gamma Pending',
    owner_name_en: 'Parity Owner', owner_number_1: '9000000900', business_contact_1: '9000000921', mediator: '900', status: 0,
    is_business_approved: 0, state_en: 'Paritystate', dist_en: 'Paritycity', pincode_id: 900, address_line_1_en: 'Parity Road 3',
    business_payment_mode: 'Free', from_date: '2025-06-17', exp_date: '2026-06-17', valid_till: '1_year', ...ts,
  },
];

export const seed: Seed = [
  [
    'pincodes',
    [
      { id: 900, pin_code: '999001', city: 'Paritycity', state: 'Paritystate', state_hi: 'पैरिटीराज्य', city_hi: 'पैरिटीनगर', state_code: 'PS', district_code: '01', ...ts },
      { id: 901, pin_code: '999002', city: 'Paritycity', state: 'Paritystate', state_hi: 'पैरिटीराज्य', city_hi: 'पैरिटीनगर', state_code: 'PS', district_code: '01', ...ts },
    ],
  ],
  ['business_categories', [{ id: 900, name: 'Parity Cat', name_hi: 'पैरिटी श्रेणी', slug: 'parity-cat', status: 1, ...ts }]],
  [
    'business_sub_categories',
    [{ id: 900, name: 'Parity Sub', name_hi: 'पैरिटी उप', business_category_id: 900, parent_id: 900, slug: 'parity-sub', status: 1, ...ts }],
  ],
  ['business_users', [{ id: 900, name: 'Parity Mediator', designation: 'mediator', status: 1, phone: '9000000990', ...ts }]],
  ['users', [{ id: 900, name: 'Parity Owner', email: 'parity-owner@pocketdd.test', phone: '9000000900', password: 'not-a-login', status: 1, ...ts }]],
  ['locations', [{ id: 900, location_name: 'Parity Location', status: 1, ...ts }]],
  ['businesses', BUSINESSES],
  [
    'business_owners',
    [
      { id: 900, business_id: 900, user_id: 900, name: 'Parity Owner', phone: '9000000900', ...ts },
      { id: 901, business_id: 901, user_id: 900, name: 'Parity Aardvark', phone: '9000000909', ...ts },
    ],
  ],
  [
    'business_details',
    [
      {
        id: 900, business_id: 900, business_email: 'alpha@parity.test', business_mobile_number: '9000000930', pincode: '999001',
        district: 'Paritycity', state: 'Paritystate', ...ts,
      },
    ],
  ],
  ['business_iamges', [{ id: 900, business_id: 900, img: 'uploads/user_images/p9a-img.png', ...ts }]],
  ['business_locations', [{ id: 900, business_id: 900, location_id: 900, ...ts }]],
  [
    'businesse_requests',
    [
      {
        id: 900, business_id: 902, user_id: 900, business_category_id: 900, business_sub_category_id: 900, business_name: 'Parity Gamma Pending',
        business_email: 'gamma@parity.test', mobile_number: '9000000921', is_business_approved: 0, status: 0, ...ts,
      },
      {
        id: 901, business_id: 900, user_id: 900, business_category_id: 900, business_sub_category_id: null, business_name: 'Parity Alpha Store',
        is_business_approved: 1, status: 0, ...ts,
      },
    ],
  ],
];
