// Phase 9B fixtures (ids 920–939): category / sub-category / advertisement / slider / location admin screens.
// No users are seeded (the advertisement job only pushes to users with an fcm_token); tests that need the
// SendAdvertisementNotification dispatch use a non-existent business id so the job never pushes.
import type { Seed } from './types.js';

const now = '2025-06-19 10:30:00';
const ts = { created_at: now, updated_at: now };

export const P9B = { categoryId: 920, inactiveCategoryId: 921, subCategoryId: 920, businessId: 920, adId: 920, sliderId: 920, locationId: 920 };

export const seed: Seed = [
  ['businesses', [{ id: 920, business_name_en: 'P9b Ad Business', status: 1, is_business_approved: 1, slug: 'p9b-ad-business-920', ...ts }]],
  [
    'business_categories',
    [
      { id: 920, name: 'P9b Alpha Cat', name_hi: 'पी अल्फा', img: 'uploads/category_images/p9b-alpha.png', slug: 'p9balphacat', lft: 921, rgt: 921, depth: 1, parent_id: null, status: 1, ...ts },
      { id: 921, name: 'P9b Beta Cat', name_hi: 'पी बीटा', img: null, slug: 'p9bbetacat', lft: 922, rgt: 922, depth: 1, parent_id: null, status: 0, created_at: '2025-06-20 10:30:00', updated_at: now },
      // a "category" row with a parent: hidden from the category list (whereNull parent_id)
      { id: 922, name: 'P9b Child Row', name_hi: 'पी चाइल्ड', slug: 'p9bchildrow', parent_id: 920, status: 1, ...ts },
    ],
  ],
  [
    'business_sub_categories',
    [
      { id: 920, name: 'P9b Sub One', name_hi: 'पी सब वन', parent_id: 920, img: 'uploads/sub-category_images/p9b-one.png', slug: 'p9bsubone', lft: 921, rgt: 921, depth: 1, status: 1, ...ts },
      { id: 921, name: 'P9b Sub Two', name_hi: 'पी सब टू', parent_id: 920, slug: 'p9bsubtwo', status: 0, ...ts },
    ],
  ],
  [
    'advertisments',
    [
      {
        id: 920, client_name: '920', advt_img: 'uploads/adv_images/p9b-ad.png', from_date: '2025-06-01 00:00:00', to_date: '2025-07-01 00:00:00',
        amount: '1500.00', lft: 921, rgt: 921, depth: 1, status: 1, ads_position: 'home', ads_location: 'TOP',
        sub_category_name: null, fees_type: 'Cash', ...ts,
      },
    ],
  ],
  [
    'sliders',
    [
      { id: 920, client_name: 'P9b Slider Client', slider_img: 'uploads/user_images/p9b-slider.png', from_date: '2025-06-01 00:00:00', to_date: '2025-06-30 00:00:00', amount: '100.00', lft: 2, rgt: 3, depth: 1, page_location: 'home', url: null, status: 1, ...ts },
      { id: 921, client_name: 'P9b Second Client', slider_img: null, from_date: '2025-05-01 00:00:00', to_date: '2025-05-30 00:00:00', amount: null, lft: 1, rgt: 4, depth: 1, page_location: 'event_page', status: 0, ...ts },
    ],
  ],
  [
    'locations',
    [
      { id: 920, location_name: '{"en":"P9b City","hi":"पी नगर"}', status: 1, ...ts },
      { id: 921, location_name: 'P9b Plain', status: 0, ...ts },
    ],
  ],
];
