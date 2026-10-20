// Phase 9C fixtures (ids 940–959): staff (business_users) + events admin screens. Users have no fcm_token,
// so SendEventNotification never reaches FCM.
import { hashMake } from '../../src/core/auth/hash.js';
import type { Seed } from './types.js';

const now = '2025-06-19 10:30:00';
const ST = 'Ninefour State';
const CT = 'Ninefour City';

export const P9C = { state: ST, city: CT, tehsil: 'Ninefour Tehsil' };

export const seed: Seed = [
  [
    'pincodes',
    [
      { id: 940, pin_code: '940001', city: CT, state: ST, created_at: now, updated_at: now },
      { id: 941, pin_code: '940001', city: CT, state: ST, created_at: now, updated_at: now },
      { id: 942, pin_code: '940002', city: CT, state: ST, created_at: now, updated_at: now },
      { id: 943, pin_code: '940003', city: 'Ninefour Town', state: ST, created_at: now, updated_at: now },
    ],
  ],
  [
    'addresses',
    [{ id: 940, state: ST, city: CT, pincode_id: 940, tehsil: 'Ninefour Tehsil', status: 1, created_at: now, updated_at: now }],
  ],
  [
    'users',
    [
      {
        id: 940, name: 'Zz Parity Staff A', email: 'staff-a@p9c.test', phone: '9400000940', password: await hashMake('9400000940'),
        status: 1, user_icon: 'uploads/user_images/', state: ST, district: CT, pincode: '940', tehsil: 'Ninefour Tehsil',
        created_at: now, updated_at: now,
      },
    ],
  ],
  [
    'business_users',
    [
      {
        id: 940, user_id: 940, name: 'Zz Parity Staff A', phone: '9400000940', email: 'staff-a@p9c.test', state: ST, district: CT,
        pincode_id: 940, tahsil: 'Ninefour Tehsil', address_line_1: 'Line A', street_address: 'Street A', designation: 'staff',
        aadhar_no: null, description: 'Old Desc', description_hi: null, profile_img: null, status: 1, lft: 941, rgt: 941, depth: 1,
        created_at: now, updated_at: now,
      },
      {
        id: 941, user_id: null, name: 'Zz Parity Staff B', phone: '9400000941', email: null, state: ST, district: 'Ninefour Town',
        pincode_id: 943, tahsil: null, designation: 'manager', aadhar_no: '940094009400', status: 0,
        created_at: '2025-06-18 10:30:00', updated_at: now,
      },
    ],
  ],
  ['locations', [{ id: 940, location_name: '{"en":"Ninefour Zone","hi":"नाइनफोर"}', status: 1, created_at: now, updated_at: now }]],
  ['business_users_location', [{ id: 940, business_user_id: 940, location_id: 940, created_at: now, updated_at: now }]],
  [
    'events',
    [
      {
        id: 940, name: 'Zz Parity Event', name_hi: 'घटना', date: '2025-07-01', event_time: '10:30:00', charge: '100.00',
        image: 'uploads/event_images/p9c-old-abcd.png', status: 1, state: ST, district: CT, pincode_id: 940, tahsil: 'Ninefour Tehsil',
        short_description: 'Parity Desc', event_description_hi: 'विवरण', created_at: now, updated_at: now,
      },
      {
        id: 941, name: 'Zz Parity Event Off', date: '2025-07-02', status: 0, state: ST, district: 'Ninefour Town', pincode_id: null,
        short_description: 'Off', event_description_hi: 'बंद', created_at: '2025-06-18 10:30:00', updated_at: now,
      },
    ],
  ],
  ['event_details', [{ id: 940, event_id: 940, event_details: '<p>Parity details</p>', created_at: now, updated_at: now }]],
  ['event_locations', [{ id: 940, event_id: 940, location_id: 940, created_at: now, updated_at: now }]],
];
