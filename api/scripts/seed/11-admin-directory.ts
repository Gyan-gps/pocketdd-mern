// directory admin fixtures (ids 960–999): administrator / designation / city-helpline-number / address / about-us /
// pincode admin screens. All names carry the "P9D" marker so list searches are deterministic.
import type { Seed } from './types.js';

const now = '2025-06-19 10:30:00';
const ts = { created_at: now, updated_at: now };

export const seed: Seed = [
  [
    'pincodes',
    [
      { id: 960, pin_code: '996001', state: 'P9D State', state_hi: 'पी राज्य', city: 'P9D City', city_hi: 'पी शहर', state_code: 'PD', district_code: '96', ...ts },
      { id: 961, pin_code: '996002', state: 'P9D State', state_hi: 'पी राज्य', city: 'P9D City', city_hi: 'पी शहर', state_code: 'PD', district_code: '96', ...ts },
      { id: 962, pin_code: '996003', state: 'P9D State', state_hi: 'पी राज्य', city: 'P9D Town', city_hi: null, state_code: 'PD', district_code: '97', ...ts },
      // duplicate pin_code: the list's "PinCode Area" column resolves through the FIRST row with that pin.
      { id: 963, pin_code: '996001', state: 'P9D State', state_hi: 'पी राज्य', city: 'P9D City', city_hi: 'पी शहर', state_code: 'PD', district_code: '96', ...ts },
      // excluded from the list by whereNotNull(['pin_code', 'city', 'state'])
      { id: 964, pin_code: '996004', state: 'P9D State', state_hi: null, city: null, city_hi: null, state_code: null, district_code: null, ...ts },
      // update-test row in its own state, so the mass updates only touch it
      { id: 965, pin_code: '996005', state: 'P9D Upd State', state_hi: 'अपडेट', city: 'P9D Upd City', city_hi: 'अपडेट शहर', state_code: 'UA', district_code: '11', ...ts },
    ],
  ],
  [
    'departments',
    [{ id: 960, department_name: 'P9D Dept', department_name_hi: 'पी विभाग', slug: 'p9ddept', status: 1, ...ts }],
  ],
  [
    'designations',
    [
      { id: 960, name: '{"en":"P9D Officer","hi":"अधिकारी"}', status: 1, ...ts },
      { id: 961, name: 'P9D Plain', status: 0, ...ts },
    ],
  ],
  [
    'administrators',
    [
      {
        id: 960, department_id: 960, state: 'P9D State', city: 'P9D City', pincode_id: 960, status: 1,
        officer_rank_name: '[{"officer_rank":"P9D SP","officer_rank_hi":"\\u090f\\u0938\\u092a\\u0940","officer_number":"9876543210"},{"officer_rank":"P9D DSP","officer_rank_hi":"\\u0921\\u0940","officer_number":"0141-1234567"}]',
        ...ts,
      },
      { id: 961, department_id: 800, state: 'P9D State', city: 'P9D Town', pincode_id: null, status: 0, officer_rank_name: null, ...ts },
      { id: 962, department_id: 960, state: 'P9D State', city: 'P9D City', pincode_id: 964, status: 1, officer_rank_name: '{"officer_rank":"P9D X","officer_number":"1"}', ...ts },
    ],
  ],
  [
    'city_helpline_numbers',
    [
      {
        id: 960, state: 'P9D State', city: 'P9D City', pincode_id: 960,
        city_helpline: '[{"ambulance_number":"108","fire_safety_number":"101","women_helpline":"1090","police_headquarters":"100"}]',
        ...ts,
      },
      { id: 961, state: 'P9D State', city: 'P9D Town', pincode_id: null, city_helpline: '{"a":{"ambulance_number":"1"}}', ...ts },
    ],
  ],
  [
    'addresses',
    [
      {
        id: 960, state: 'P9D State', city: 'P9D City', pincode_id: 960, tehsil: 'P9D Tehsil', tehsil_hi: 'पी तहसील',
        area: '[{"area_name":"P9D North","area_name_hi":"उत्तर"},{"area_name":"P9D South Very Long Local Area Name","area_name_hi":"दक्षिण"}]',
        status: 1, ...ts,
      },
      { id: 961, state: 'P9D State', city: 'P9D City', pincode_id: 961, tehsil: 'P9D Second', tehsil_hi: null, area: null, status: 1, ...ts },
    ],
  ],
  [
    'about_uses',
    [
      {
        id: 960, state: 'P9D State', city: 'P9D City', about_mediator: 'P9D Mediator', about_mediator_hi: 'मध्यस्थ',
        know_your_city: 'P9D City Info', know_your_city_hi: 'शहर',
        tourist_places: '[{"place_name":"P9D Fort","place_name_hi":"\\u0915\\u093f\\u0932\\u093e","place_description":"Old fort","place_description_hi":"\\u092a\\u0941\\u0930\\u093e\\u0928\\u093e","place_image":"uploads\\/tourist_place_images\\/p9d-fort-AbCd.png"},"junk"]',
        status: 1, ...ts,
      },
      { id: 961, state: 'P9D State', city: 'P9D Town', about_mediator: 'P9D Other', tourist_places: '[]', status: 1, ...ts },
    ],
  ],
];
