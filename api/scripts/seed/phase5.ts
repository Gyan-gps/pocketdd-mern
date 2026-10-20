// Phase 5 fixtures: events, departments/officers, helplines, notifications (ids 500–599).
// Users 501–503 have NO fcm_token (nothing here may ever be a push target).
import crypto from 'node:crypto';
import type { Seed } from './types.js';

const now = '2025-06-19 10:30:00';
const ts = { created_at: now, updated_at: now };
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const ranks = (list: unknown) => JSON.stringify(list);

export const seed: Seed = [
  [
    'users',
    [501, 502, 503].map((id) => ({
      id, name: `Phase5 User ${id}`, email: `p5-${id}@example.test`, phone: `9000000${id}`,
      password: '$2y$12$abcdefghijklmnopqrstuuR5Wn3n6Hn4qZ3l0hQ9QbLQ7Jt0K4Wc2', status: 1, fcm_token: null, ...ts,
    })),
  ],
  [
    'personal_access_tokens',
    [501, 502, 503].map((id) => ({
      id, tokenable_type: 'App\\Models\\User', tokenable_id: id, name: 'phase5',
      token: sha(`phase5-token-${id}`), abilities: '["*"]', expires_at: null, ...ts,
    })),
  ],
  ['locations', [{ id: 501, location_name: JSON.stringify({ en: 'Hazratganj Zone', hi: 'हज़रतगंज ज़ोन' }), status: 1, ...ts }]],
  ['business_users', [{ id: 501, user_id: 501, name: 'P5 Owner', status: 1, ...ts }]],
  ['business_users_location', [{ id: 501, business_user_id: 501, temp_location_id: 0, location_id: 501, language: 'en', ...ts }]],
  [
    'businesses',
    [
      { id: 501, user_id: 501, name: 'P5 Bakery', business_name_en: 'P5 Bakery', business_name_hi: 'पी5 बेकरी', slug: 'p5-bakery', logo: 'uploads/biz/p5.png', status: 1, ...ts },
      { id: 502, user_id: 502, name: 'P5 Hindi', business_name_en: null, business_name_hi: 'केवल हिंदी', slug: 'p5-hindi', logo: null, status: 1, ...ts },
    ],
  ],
  [
    'advertisments',
    [
      { id: 501, client_name: '501', advt_img: 'uploads/ads/p5-event.png', ads_position: 'inner', ads_location: 'Event', status: 1, ...ts },
      { id: 502, client_name: '599', advt_img: null, ads_position: 'inner', ads_location: 'Event', status: 1, ...ts },
      { id: 503, client_name: '502', advt_img: 'uploads/ads/p5-details.png', ads_position: 'inner', ads_location: 'Event Details', status: 1, ...ts },
      { id: 504, client_name: '501', advt_img: 'uploads/ads/p5-notif.png', ads_position: 'inner', ads_location: 'Notification', status: 1, ...ts },
      { id: 505, client_name: '501', advt_img: 'uploads/ads/p5-off.png', ads_position: 'inner', ads_location: 'Notification', status: 0, ...ts },
      { id: 506, client_name: '598', advt_img: null, ads_position: 'p5', ads_location: 'p5', status: 1, ...ts },
    ],
  ],
  [
    'events',
    [
      { id: 501, name: 'Alpha Fest', name_hi: 'अल्फा उत्सव', short_description: 'Alpha short', event_description_hi: 'अल्फा विवरण', date: '2030-01-15', event_time: '14:30:00', image: 'uploads/events/alpha.png', state: 'Uttar Pradesh', district: 'Lucknow', status: 1, ...ts },
      // date is moved to "today" (IST) by the parity case before-hook
      { id: 502, name: 'Beta Mela', name_hi: 'बीटा मेला', short_description: null, event_description_hi: null, date: '2030-01-16', event_time: null, image: null, state: 'Uttar Pradesh', district: 'Lucknow', status: 1, ...ts },
      { id: 503, name: 'Old Show', name_hi: 'पुराना शो', date: '2020-01-01', event_time: '09:00:00', image: null, state: 'Uttar Pradesh', district: 'Lucknow', status: 1, ...ts },
      { id: 504, name: 'Hidden Show', name_hi: 'छिपा शो', date: '2030-01-01', event_time: '09:00:00', image: null, state: 'Uttar Pradesh', district: 'Lucknow', status: 0, ...ts },
      { id: 505, name: 'Gamma Expo', name_hi: null, short_description: 'Gamma', date: null, event_time: '07:05:00', image: null, state: 'Uttar Pradesh', district: 'Lucknow', status: 1, ...ts },
      { id: 506, name: 'Kanpur Fair', name_hi: 'कानपुर मेला', date: '2030-03-01', event_time: '18:00:00', image: 'uploads/events/k.png', state: 'Uttar Pradesh', district: 'Kanpur', status: 1, ...ts },
    ],
  ],
  [
    'departments',
    [
      { id: 501, name: 'P5 Police', slug: 'p5-police', department_name: 'P5 Police', department_name_hi: 'पी5 पुलिस', status: 1, ...ts },
      { id: 502, name: 'P5 Closed', slug: 'p5-closed', department_name: 'P5 Closed', department_name_hi: 'पी5 बंद', status: 0, ...ts },
      { id: 503, name: 'P5 Fire', slug: 'p5-fire', department_name: 'P5 Fire', department_name_hi: 'पी5 अग्नि', status: 1, ...ts },
    ],
  ],
  ['designations', [{ id: 501, name: JSON.stringify({ en: 'P5Inspector', hi: 'पी5' }), status: 1, ...ts }, { id: 502, name: 'Plain SP Desk', status: 1, ...ts }]],
  [
    'administrators',
    [
      {
        id: 501, department_id: 501, designation_id: 501, officer_mobile_number: '9111111111', city: 'Lucknow', state: 'Uttar Pradesh', status: 1,
        officer_rank_name: ranks([{ officer_rank: 'SP', officer_rank_hi: 'एसपी', officer_number: '100' }, { officer_rank: 'DSP' }, 'junk']), ...ts,
      },
      {
        id: 502, department_id: 501, designation_id: null, city: 'Lucknow', state: 'Uttar Pradesh', status: 1,
        officer_rank_name: ranks({ a: { officer_rank: 'CO', officer_rank_hi: 'सीओ', officer_number: 200 } }), ...ts,
      },
      { id: 503, department_id: 501, designation_id: 501, city: 'Lucknow', state: 'Uttar Pradesh', status: 0, officer_rank_name: ranks([{ officer_rank: 'Off' }]), ...ts },
      { id: 504, department_id: 501, designation_id: 501, officer_mobile_number: null, city: 'Kanpur', state: 'Uttar Pradesh', status: 1, officer_rank_name: '{"officer_rank":"P5Zed","officer_number":"555"}', ...ts },
      { id: 506, department_id: 503, designation_id: 502, officer_mobile_number: '9222', city: 'Agra', state: 'Uttar Pradesh', status: 1, officer_rank_name: ranks([{ officer_rank: 'SP2' }]), ...ts },
      { id: 505, department_id: 501, designation_id: 501, city: 'Lucknow', state: 'Uttar Pradesh', status: 1, officer_rank_name: null, ...ts },
    ],
  ],
  [
    'city_helpline_numbers',
    [
      {
        id: 501, city: 'Lucknow',
        city_helpline: JSON.stringify([{ name: 'ambulance_no', ambulance_number: '108', fire_safety_number: '101', women_helpline: '1090' }, { police_headquarters: 'x' }]), ...ts,
      },
      { id: 502, city: 'Kanpur', city_helpline: null, ...ts },
      { id: 503, city: 'Jaipur', city_helpline: JSON.stringify({ a: { ambulance_number: '1' } }), ...ts },
    ],
  ],
  [
    'user_notifications',
    [
      { id: 501, user_id: 501, title: 't', message: 'm', data: JSON.stringify({ event_id: 501 }), is_read: 0, created_at: '2025-06-19 10:00:01', updated_at: now },
      { id: 502, user_id: 501, title: 't', message: 'm', data: JSON.stringify({ advertisement_id: 504 }), is_read: 0, created_at: '2025-06-19 10:00:02', updated_at: now },
      { id: 503, user_id: 501, title: 't', message: 'm', data: JSON.stringify({ business_id: 501, type: 'business_approved' }), is_read: 1, created_at: '2025-06-19 10:00:03', updated_at: now },
      { id: 504, user_id: 501, title: 't', message: 'm', data: JSON.stringify({ business_id: 502 }), is_read: 0, created_at: '2025-06-19 10:00:04', updated_at: now },
      { id: 505, user_id: 501, title: 'plain', message: 'plain msg', data: null, is_read: 0, created_at: '2025-06-19 10:00:05', updated_at: now },
      { id: 506, user_id: 501, title: 'gone', message: 'gone', data: JSON.stringify({ event_id: 599 }), is_read: 0, created_at: '2025-06-19 10:00:06', updated_at: now },
      { id: 507, user_id: 501, title: 'biz hi', message: 'x', data: JSON.stringify({ business_id: 502, type: 'business_approved' }), is_read: 0, created_at: '2025-06-19 10:00:07', updated_at: now },
      { id: 508, user_id: 501, title: 'img ev', message: 'x', data: JSON.stringify({ event_id: 502 }), is_read: 0, created_at: '2025-06-19 10:00:08', updated_at: now },
      { id: 509, user_id: 501, title: 'str', message: 'x', data: JSON.stringify(JSON.stringify({ business_id: 501 })), is_read: 0, created_at: '2025-06-19 10:00:09', updated_at: now },
      { id: 520, user_id: 502, title: 'bad adv', message: 'x', data: JSON.stringify({ advertisement_id: 597 }), is_read: 0, created_at: now, updated_at: now },
      { id: 530, user_id: 503, title: 'adv no client', message: 'x', data: JSON.stringify({ advertisement_id: 506 }), is_read: 0, created_at: now, updated_at: now },
    ],
  ],
];
