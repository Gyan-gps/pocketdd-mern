// Fixtures: jobs + scheduled commands. FCM tokens are fake ("phase7-fake-*") — never real devices.
// Dates are relative to "today" in Asia/Kolkata at seed time; test/jobs.test.ts re-applies this seed itself.
import type { Seed } from './types.js';

const IST = 5.5 * 3600 * 1000;
const day = (offset: number) => new Date(Date.now() + IST + offset * 86400000).toISOString().slice(0, 10);
export const TODAY = day(0);
const now = '2025-06-19 10:30:00';

export const seed: Seed = [
  [
    'users',
    [
      { id: 700, name: 'Phase7 Owner', email: 'p7owner@example.test', phone: '7000000700', password: 'x', status: 1, fcm_token: 'phase7-fake-token-a', created_at: now, updated_at: now },
      { id: 701, name: 'Phase7 Fan', email: 'p7fan@example.test', phone: '7000000701', password: 'x', status: 1, fcm_token: 'phase7-fake-token-b', created_at: now, updated_at: now },
      { id: 702, name: 'Phase7 NoToken', email: 'p7none@example.test', phone: '7000000702', password: 'x', status: 1, fcm_token: null, created_at: now, updated_at: now },
      // empty-string token: whereNotNull includes it, empty() skips it in the approve job
      { id: 703, name: 'Phase7 Empty', email: 'p7empty@example.test', phone: '7000000703', password: 'x', status: 1, fcm_token: '', created_at: now, updated_at: now },
    ],
  ],
  [
    'businesses',
    [
      { id: 700, user_id: 700, business_name_en: 'Phase7 Sweets', logo: 'uploads/business_logo/p7.png', status: 1, from_date: TODAY, is_business_approved: 0, created_at: now, updated_at: now },
      { id: 701, user_id: 702, business_name_en: 'Phase7 Tools', logo: 'https://cdn.example.test/p7.png', status: 1, from_date: day(-1), is_business_approved: 0, created_at: now, updated_at: now },
      { id: 702, user_id: 703, business_name_en: null, logo: null, status: 1, from_date: day(1), is_business_approved: 0, created_at: now, updated_at: now },
    ],
  ],
  [
    'advertisments',
    [
      { id: 700, client_name: '700', advt_img: 'p7ad.png', from_date: `${TODAY} 08:00:00`, to_date: `${day(-1)} 23:59:59`, status: 1, created_at: now, updated_at: now },
      { id: 701, client_name: '701', advt_img: null, from_date: `${day(-3)} 00:00:00`, to_date: `${TODAY} 00:00:00`, status: 1, created_at: now, updated_at: now },
      { id: 702, client_name: '799', advt_img: null, from_date: `${day(-3)} 00:00:00`, to_date: `${day(-5)} 00:00:00`, status: 0, created_at: now, updated_at: now },
      { id: 703, client_name: '700', advt_img: null, from_date: `${day(-3)} 00:00:00`, to_date: null, status: 1, created_at: now, updated_at: now },
    ],
  ],
  [
    'events',
    [
      { id: 700, name: 'Phase7 Mela', date: day(-1), image: 'p7ev.png', status: 1, short_description: 'Fun fair', created_at: now, updated_at: now },
      { id: 701, name: 'Phase7 Future', date: TODAY, image: null, status: 1, short_description: null, created_at: now, updated_at: now },
    ],
  ],
  [
    'pincodes',
    [
      { id: 700, pin_code: '799001', city: 'Phaseseven Nagar', state: 'Phase Seven State', city_hi: null, created_at: now, updated_at: now },
      { id: 701, pin_code: '799002', city: 'Phaseseven Nagar', state: 'Phase Seven State', city_hi: null, created_at: now, updated_at: now },
      { id: 702, pin_code: '799003', city: 'Phaseseven Pur', state: 'Phase Seven State', city_hi: 'x', created_at: now, updated_at: now },
    ],
  ],
];
