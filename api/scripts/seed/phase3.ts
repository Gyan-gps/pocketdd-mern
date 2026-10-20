// Phase 3 fixtures (ids 300–399): categories, sub-categories, businesses, ads, about-us, business users.
import crypto from 'node:crypto';
import type { Seed } from './types.js';

const now = '2025-06-19 10:30:00';
const ts = { created_at: now, updated_at: now };
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const pw = '$2y$12$abcdefghijklmnopqrstuuJ0E7S8xI8gQm4yYQ0p0eQ4b0J1y6aK'; // never checked

const biz = (row: Record<string, unknown>) => ({
  user_id: null, business_category_id: 300, business_sub_category_id: 300, business_name_en: null, business_name_hi: null,
  keywords: null, state_en: 'Uttar Pradesh', dist_en: 'Lucknow', state_hi: 'उत्तर प्रदेश', dist_hi: 'लखनऊ', tehsil_en: 'Sadar',
  area_en: null, area_hi: null, address_line_1_en: null, address_line_1_hi: null, pincode_hi: null, to_show: 1,
  from_date: '2025-01-01', exp_date: '2099-12-31', business_contact_1: null, business_contact_2: null, business_contact_3: null,
  business_contact_4: null, about_en: null, about_hi: null, business_email: null, image_1: null, image_2: null, image_3: null,
  image_4: null, social_media_url: null, logo: null, status: 1, ...ts, ...row,
});

export const seed: Seed = [
  [
    'users',
    [300, 301, 302, 303, 304].map((id) => ({ id, name: `P3 User ${id}`, email: `p3u${id}@example.test`, phone: `90000003${String(id).slice(1)}`, password: pw, status: 1, ...ts })),
  ],
  [
    'personal_access_tokens',
    [300, 301, 302, 303, 304].map((id) => ({
      id, tokenable_type: 'App\\Models\\User', tokenable_id: id, name: 'p3', token: sha(`p3tok${id}`), abilities: '["*"]', ...ts,
    })),
  ],
  [
    'locations',
    [
      { id: 300, location_name: JSON.stringify({ en: 'Lucknow', hi: 'लखनऊ' }), status: 1, ...ts },
      { id: 301, location_name: 'Plain Location', status: 1, ...ts },
    ],
  ],
  [
    'business_users',
    [
      { id: 300, user_id: 300, name: 'BU 300', status: 1, ...ts },
      { id: 302, user_id: 302, name: 'BU 302', status: 1, ...ts },
      { id: 303, user_id: 303, name: 'BU 303', status: 1, ...ts },
    ],
  ],
  [
    'business_users_location',
    [
      { id: 300, business_user_id: 300, location_id: 300, language: 'en', ...ts },
      { id: 303, business_user_id: 303, location_id: 301, language: 'hi', ...ts },
    ],
  ],
  [
    'business_categories',
    [
      { id: 300, name: 'Electricians', name_hi: 'बिजली मिस्त्री', slug: 'p3-electricians', img: 'uploads/cat/e.png', parent_id: null, status: 1, ...ts },
      { id: 301, name: 'aardvark care', name_hi: 'आर्डवार्क', slug: 'p3-aardvark', img: null, parent_id: 7, status: 1, ...ts },
      { id: 302, name: 'Zinc Works', name_hi: 'जस्ता', slug: 'p3-zinc', img: null, status: 0, ...ts },
      { id: 303, name: 'Empty Cat', name_hi: null, slug: 'p3-empty', img: '', status: 1, ...ts },
    ],
  ],
  [
    'business_sub_categories',
    [
      { id: 300, name: 'House Wiring', name_hi: 'घर वायरिंग', business_category_id: 300, parent_id: 300, slug: 'p3-house-wiring', img: 'uploads/sub/hw.png', status: 1, ...ts },
      { id: 301, name: 'AC Repair', name_hi: null, business_category_id: 300, parent_id: 300, slug: 'p3-ac-repair', img: null, status: 1, ...ts },
      { id: 302, name: 'Old Wiring', name_hi: 'पुरानी', business_category_id: 300, parent_id: 300, slug: 'p3-old-wiring', img: null, status: 0, ...ts },
      { id: 303, name: 'Empty Sub', name_hi: 'खाली', business_category_id: 303, parent_id: 303, slug: 'p3-empty-sub', img: null, status: 0, ...ts },
      { id: 304, name: 'Orphan Sub', name_hi: null, business_category_id: null, parent_id: null, slug: 'p3-orphan', img: null, status: 1, ...ts },
    ],
  ],
  [
    'businesses',
    [
      biz({
        id: 300, user_id: 300, business_name_en: 'Bright Electric', business_name_hi: 'ब्राइट इलेक्ट्रिक', keywords: 'wiring,fan',
        area_en: 'Hazratganj', area_hi: 'हज़रतगंज', address_line_1_en: 'Shop 4, ', address_line_1_hi: 'दुकान 4', pincode_hi: '226001',
        business_contact_1: '9000000300', business_contact_3: '', business_contact_4: '9000000301', about_en: 'We wire', about_hi: 'हम',
        business_email: 'bright@example.test', image_1: 'uploads/b/1.png', image_3: '0', image_4: 'http://cdn.example.test/4.png',
        social_media_url: JSON.stringify([{ platform: 'fb', url: 'http://fb.test' }, { platform: 'x' }, 'str', { platform: 'ig', url: null }]),
        logo: 'uploads/logo/b.png', slug: 'p3-bright-electric',
      }),
      biz({
        id: 301, user_id: 302, business_name_en: 'Alpha Wiring', business_name_hi: 'अल्फा', tehsil_en: 'Mohanlalganj', area_en: 'Aminabad',
        pincode_hi: '0', social_media_url: JSON.stringify(JSON.stringify({ a: { platform: 'yt', url: 'http://yt.test' } })), slug: 'p3-alpha-wiring',
      }),
      biz({ id: 302, business_name_en: 'Pocket DD Desk', business_name_hi: 'पॉकेट डीडी डेस्क', slug: 'p3-desk' }),
      biz({ id: 303, business_name_en: 'Expired Electric', business_name_hi: 'समाप्त', exp_date: '2020-01-01', slug: 'p3-expired' }),
      biz({
        id: 304, user_id: 303, business_category_id: 301, business_sub_category_id: null, business_name_en: 'Aardvark Shop',
        business_name_hi: 'आर्डवार्क दुकान', slug: 'p3-aardvark-shop', logo: 'uploads/logo/a.png', social_media_url: 'not json',
      }),
      biz({ id: 305, user_id: 304, business_sub_category_id: 301, business_name_en: 'Kanpur AC', dist_en: 'Kanpur', dist_hi: 'कानपुर', slug: 'p3-kanpur-ac' }),
    ],
  ],
  [
    'business_details',
    [
      {
        id: 300, business_id: 300,
        summaries: JSON.stringify({ en: [{ description: 'We wire homes' }, { title: 'x' }, { description: 5 }, 'plain', { description: 'Second' }] }),
        ...ts,
      },
      { id: 304, business_id: 304, summaries: JSON.stringify({ en: JSON.stringify([{ description: 'Str one' }]) }), ...ts },
      { id: 305, business_id: 305, summaries: null, ...ts },
    ],
  ],
  [
    'advertisments',
    [
      { id: 300, client_name: '300', advt_img: 'uploads/ads/top.png', ads_position: 'home', ads_location: 'TOP', status: 1, ...ts },
      { id: 301, client_name: 'abc', advt_img: null, ads_position: 'home', ads_location: 'BOTTOM', status: 1, ...ts },
      { id: 302, client_name: '305', advt_img: 'uploads/ads/menu.png', ads_position: 'inner', ads_location: 'Menu', status: 1, ...ts },
      { id: 303, client_name: null, advt_img: 'uploads/ads/sub.png', ads_position: 'inner', ads_location: 'All Subcategory Page', status: 1, ...ts },
      {
        id: 304, client_name: '300', advt_img: 'uploads/ads/same.png', ads_position: 'inner', ads_location: 'Same Category/Subcategory Page',
        from_date: '2025-06-01 15:00:00', to_date: '2025-12-31 00:00:00', amount: '99.50', status: 1, ...ts,
      },
      {
        id: 305, client_name: null, advt_img: 'uploads/ads/multi.png', ads_position: 'inner', ads_location: 'Multiple Category/Subcategory Page',
        sub_category_name: JSON.stringify(['House Wiring', 'AC Repair']), status: 1, ...ts,
      },
      { id: 306, client_name: '304', advt_img: null, ads_position: 'inner', ads_location: 'Same Category/Subcategory Page', status: 1, ...ts },
      { id: 307, client_name: '300', advt_img: 'uploads/ads/off.png', ads_position: 'home', ads_location: 'TOP', status: 0, ...ts },
    ],
  ],
  [
    'about_uses',
    [
      {
        id: 300, state: 'Uttar Pradesh', city: 'Lucknow', about_mediator: 'Mediator EN', about_mediator_hi: 'मध्यस्थ', know_your_city: 'City EN',
        know_your_city_hi: 'शहर',
        tourist_places: JSON.stringify([
          { place_name: 'Imambara', place_name_hi: 'इमामबाड़ा', place_description: 'Old', place_description_hi: 'पुराना', place_image: 'uploads/tp/a.jpg' },
          { place_name: 'Zoo', place_image: '/zoo.jpg' },
          'junk',
          { place_image: 5, place_name: null },
        ]),
        status: 1, ...ts,
      },
      { id: 301, state: 'Uttar Pradesh', city: 'Kanpur', about_mediator: 'K', know_your_city: null, tourist_places: null, status: 1, ...ts },
    ],
  ],
];
