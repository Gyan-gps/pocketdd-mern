// Fixtures: UP locations, categories, a business with popup ads, app version.
import type { Seed } from './types.js';

const now = '2025-06-19 10:30:00';

export const seed: Seed = [
  [
    'pincodes',
    [
      { id: 1, pin_code: '226001', city: 'Lucknow', state: 'Uttar Pradesh', city_hi: 'लखनऊ', state_hi: 'उत्तर प्रदेश', created_at: now, updated_at: now },
      { id: 2, pin_code: '226001', city: 'Lucknow', state: 'Uttar Pradesh', city_hi: 'लखनऊ', state_hi: 'उत्तर प्रदेश', created_at: now, updated_at: now },
      { id: 3, pin_code: '226010', city: 'Lucknow', state: 'Uttar Pradesh', city_hi: 'लखनऊ', state_hi: 'उत्तर प्रदेश', created_at: now, updated_at: now },
      { id: 4, pin_code: '208001', city: 'Kanpur', state: 'Uttar Pradesh', city_hi: 'कानपुर', state_hi: 'उत्तर प्रदेश', created_at: now, updated_at: now },
      { id: 5, pin_code: '302001', city: 'Jaipur', state: 'Rajasthan', city_hi: 'जयपुर', state_hi: 'राजस्थान', created_at: now, updated_at: now },
      { id: 6, pin_code: '000000', city: '#VALUE!', state: 'Uttar Pradesh', city_hi: '#VALUE!', state_hi: 'उत्तर प्रदेश', created_at: now, updated_at: now },
    ],
  ],
  [
    'addresses',
    [
      {
        id: 1, state: 'Uttar Pradesh', city: 'Lucknow', pincode_id: 1, tehsil: 'Sadar', tehsil_hi: 'सदर',
        area: JSON.stringify([{ area_name: 'Hazratganj', area_name_hi: 'हज़रतगंज' }, { area_name: 'Aminabad' }]),
        area_hi: null, price: '10.50', status: 1, created_at: now, updated_at: now,
      },
      {
        id: 2, state: 'Uttar Pradesh', city: 'Lucknow', pincode_id: 3, tehsil: 'Sadar', tehsil_hi: 'सदर',
        area: JSON.stringify({ a: { area_name: 'Gomti Nagar' } }), area_hi: null, price: null, status: 1, created_at: now, updated_at: now,
      },
      {
        id: 3, state: 'Uttar Pradesh', city: 'Lucknow', pincode_id: 3, tehsil: 'Mohanlalganj', tehsil_hi: 'मोहनलालगंज',
        area: null, area_hi: null, price: null, status: 1, created_at: now, updated_at: now,
      },
    ],
  ],
  [
    'business_categories',
    [
      { id: 1, name: 'Doctors', name_hi: 'डॉक्टर', slug: 'doctors', img: 'uploads/cat/doc.png', status: 1, created_at: now, updated_at: now },
      { id: 2, name: 'Bakery', name_hi: 'बेकरी', slug: 'bakery', img: null, status: 1, created_at: now, updated_at: now },
    ],
  ],
  [
    'business_sub_categories',
    [
      { id: 1, name: 'Dentist', business_category_id: 1, parent_id: 1, slug: 'dentist', status: 1, created_at: now, updated_at: now },
      { id: 2, name: 'Surgeon', business_category_id: 1, parent_id: 1, slug: 'surgeon', status: 0, created_at: now, updated_at: now },
    ],
  ],
  [
    'businesses',
    [
      { id: 1, user_id: 1, name: 'Sharma Clinic', business_category_id: 1, state_en: 'Uttar Pradesh', dist_en: 'Lucknow', slug: 'sharma-clinic', status: 1, created_at: now, updated_at: now },
    ],
  ],
  [
    'advertisments',
    [
      { id: 1, client_name: '1', advt_img: 'uploads/ads/a1.png', ads_position: 'home', ads_location: 'Popup', status: 1, created_at: now, updated_at: now },
      { id: 2, client_name: '1', advt_img: null, ads_position: 'home', ads_location: 'Popup', status: 1, created_at: now, updated_at: now },
      { id: 3, client_name: '1', advt_img: 'uploads/ads/a3.png', ads_position: 'home', ads_location: 'Banner', status: 1, created_at: now, updated_at: now },
    ],
  ],
  [
    'app_versions',
    [
      { id: 1, is_show_in_app_update: 1, current_version_code: 14, current_version_name: '1.4.0', is_force_update: 0, description: 'Bug fixes', created_at: now, updated_at: now },
    ],
  ],
];
