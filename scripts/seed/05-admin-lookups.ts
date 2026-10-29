// Fixtures: admin lookup routes (state "Phase Six State" keeps results isolated from other phases).
import type { Seed } from './types.js';

const now = '2025-06-19 10:30:00';
const S = 'Phase Six State';
const pin = (id: number, pin_code: string, city: string, extra: Record<string, unknown> = {}) => ({
  id, pin_code, city, state: S, city_hi: null, state_hi: 'फेज़ छह', state_code: null, district_code: null,
  created_at: now, updated_at: now, ...extra,
});

export const seed: Seed = [
  [
    'pincodes',
    [
      pin(600, '600001', 'Alpha City', { city_hi: 'अल्फा', state_code: 'P6', district_code: 'AL' }),
      pin(601, '600001', 'Alpha City', { city_hi: 'अल्फा' }), // duplicate pin_code → unique()
      pin(602, '0600002', 'Alpha City'), // Laravel quirk: '0600002' == '600002' (numeric strings)
      pin(603, '600002', 'Alpha City'),
      pin(604, '600010', 'Beta Town', { city_hi: '0', district_code: 'BT' }), // '0' is falsy in PHP
      pin(605, '600020', 'Gamma', { city_hi: '' }),
      pin(606, '600030', 'Delta', { state: '0', state_hi: null }),
      pin(607, '600040', 'Epsilon', { state: 'Phase Six Empty', state_hi: null, city: '0' }),
    ],
  ],
  [
    'addresses',
    [
      // pincode 600: list areas with duplicates/missing keys
      {
        id: 600, state: S, city: 'Alpha City', pincode_id: 600, tehsil: 'Alpha Tehsil', tehsil_hi: 'अल्फा तहसील',
        area: JSON.stringify([
          { area_name: 'North', area_name_hi: 'उत्तर' },
          { area_name: 'North', area_name_hi: 'उत्तर २' },
          { area_name_hi: 'बिना नाम' },
          { area_name: '', area_name_hi: 'खाली' },
          { area_name: 'South', area_name_hi: '0' },
          { area_name: 'East' },
        ]),
        area_hi: null, price: null, status: 1, created_at: now, updated_at: now,
      },
      // second record for the same pincode → get-hindi-area merges both (flatten)
      {
        id: 601, state: S, city: 'Alpha City', pincode_id: 600, tehsil: 'Second', tehsil_hi: null,
        area: JSON.stringify({ x: { area_name: 'West', area_name_hi: 'पश्चिम' }, y: { area_name: 'North', area_name_hi: 'उत्तर' } }),
        area_hi: null, price: null, status: 1, created_at: now, updated_at: now,
      },
      // object-shaped area, empty objects, scalar items
      {
        id: 602, state: S, city: 'Alpha City', pincode_id: 603, tehsil: '0', tehsil_hi: '0',
        area: JSON.stringify({ a: { area_name: 'Ring', area_name_hi: 'रिंग' }, b: {}, c: 'loose', d: null }),
        area_hi: null, price: null, status: 1, created_at: now, updated_at: now,
      },
      // scalar JSON area + null-area record
      {
        id: 603, state: S, city: 'Beta Town', pincode_id: 604, tehsil: null, tehsil_hi: null,
        area: JSON.stringify('just a string'), area_hi: null, price: null, status: 1, created_at: now, updated_at: now,
      },
      {
        id: 604, state: S, city: 'Beta Town', pincode_id: 604, tehsil: 'Beta T', tehsil_hi: 'बीटा',
        area: null, area_hi: null, price: null, status: 1, created_at: now, updated_at: now,
      },
      {
        id: 605, state: S, city: 'Gamma', pincode_id: 605, tehsil: 'G', tehsil_hi: '',
        area: JSON.stringify([]), area_hi: null, price: null, status: 1, created_at: now, updated_at: now,
      },
    ],
  ],
  [
    'business_categories',
    [
      { id: 600, name: 'Phase6 Cat', name_hi: 'फेज़ छह श्रेणी', slug: 'phase6-cat', img: null, status: 1, created_at: now, updated_at: now },
      { id: 601, name: 'Phase6 NoHindi', name_hi: null, slug: 'phase6-nohindi', img: null, status: 1, created_at: now, updated_at: now },
      { id: 602, name: 'Phase6 Zero', name_hi: '0', slug: 'phase6-zero', img: null, status: 1, created_at: now, updated_at: now },
    ],
  ],
  [
    'business_sub_categories',
    [
      { id: 600, name: 'Sub A', name_hi: 'सब ए', business_category_id: 600, parent_id: 600, slug: 'p6-sub-a', status: 1, created_at: now, updated_at: now },
      { id: 601, name: 'Sub B', name_hi: null, business_category_id: 600, parent_id: 600, slug: 'p6-sub-b', status: 0, created_at: now, updated_at: now },
    ],
  ],
];
