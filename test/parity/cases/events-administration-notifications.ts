// EventController, AdministrationController, NotificationController.
// No push notifications are involved (these endpoints only read user_notifications); fixture users 501–503 have no fcm_token.
import { nowDb } from '../../../src/core/time.js';
import { exec } from '../../../src/db/mysql.js';
import type { ParityCase } from '../types.js';

const T501 = 'phase5-token-501';
const T502 = 'phase5-token-502';
const T503 = 'phase5-token-503';
const UP = 'Uttar Pradesh';
const UP_HI = 'उत्तर प्रदेश';

const eventToday = async () => {
  await exec('UPDATE events SET date = ? WHERE id = 502', [nowDb().slice(0, 10)]);
};
const freshNotification = async () => {
  await exec('UPDATE user_notifications SET created_at = ? WHERE id = 501', [nowDb()]);
};
const resetRead = async () => {
  await exec('UPDATE user_notifications SET is_read = 0, updated_at = ? WHERE id = 505', ['2025-06-19 10:30:00']);
};

const ev = (body: Record<string, unknown>) => ({ path: '/api/get-all-business-events', body, before: eventToday });

export const cases: ParityCase[] = [
  // --- get-all-business-events
  { name: 'events missing all', path: '/api/get-all-business-events', body: {} },
  { name: 'events missing location', path: '/api/get-all-business-events', body: { stateName: UP, cityName: 'Lucknow', language: 'en' } },
  { name: 'events bad language', path: '/api/get-all-business-events', body: { stateName: UP, cityName: 'Lucknow', language: 'fr', location: 'x' } },
  { name: 'events state not string', path: '/api/get-all-business-events', body: { stateName: 5, cityName: 'Lucknow', language: 'en', location: 'x' } },
  { name: 'events en (no ads)', ...ev({ stateName: UP, cityName: 'Lucknow', language: 'en', location: 'home' }) },
  { name: 'events en event_page ads', ...ev({ stateName: UP, cityName: 'Lucknow', language: 'en', location: 'event_page' }) },
  { name: 'events hi', ...ev({ stateName: UP_HI, cityName: 'लखनऊ', language: 'hi', location: 'event_page' }) },
  { name: 'events hi form', as: 'form', ...ev({ stateName: UP_HI, cityName: 'कानपुर', language: 'hi', location: 'home' }) },
  { name: 'events hi city not found', ...ev({ stateName: UP_HI, cityName: 'नहीं', language: 'hi', location: 'home' }) },
  { name: 'events none', ...ev({ stateName: 'Nowhere', cityName: 'Nocity', language: 'en', location: 'home' }) },

  // --- get-business-event-details
  { name: 'event details missing', path: '/api/get-business-event-details', body: {} },
  { name: 'event details int id (string rule)', path: '/api/get-business-event-details', body: { event_id: 501, cityName: 'x', stateName: 'y', language: 'en', location: 'z' } },
  { name: 'event details not exists', path: '/api/get-business-event-details', body: { event_id: '599', cityName: 'x', stateName: 'y', language: 'en', location: 'z' } },
  { name: 'event details missing location', path: '/api/get-business-event-details', body: { event_id: '501', cityName: 'x', stateName: 'y', language: 'en' } },
  { name: 'event details en', path: '/api/get-business-event-details', body: { event_id: '501', cityName: 'x', stateName: 'y', language: 'en', location: 'z' } },
  { name: 'event details hi + ads', path: '/api/get-business-event-details', body: { event_id: '501', cityName: 'x', stateName: 'y', language: 'hi', location: 'event_details' } },
  { name: 'event details no image/time (url(null))', path: '/api/get-business-event-details', as: 'form', body: { event_id: '505', cityName: 'x', stateName: 'y', language: 'en', location: 'event_details' } },
  { name: 'event details hi nulls', path: '/api/get-business-event-details', body: { event_id: '502', cityName: 'x', stateName: 'y', language: 'hi', location: 'z' } },

  // --- get-office-departments
  { name: 'departments missing city', path: '/api/get-office-departments', body: { language: 'en' } },
  { name: 'departments bad language', path: '/api/get-office-departments', body: { cityName: 'Lucknow', language: 'xx' } },
  { name: 'departments en + helpline', path: '/api/get-office-departments', body: { cityName: ' Lucknow ', language: 'en' } },
  { name: 'departments hi + helpline', path: '/api/get-office-departments', body: { cityName: 'लखनऊ', language: 'hi' } },
  { name: 'departments hi city not found', path: '/api/get-office-departments', body: { cityName: 'नहीं', language: 'hi' } },
  { name: 'departments null helpline (foreach error)', path: '/api/get-office-departments', body: { cityName: 'Kanpur', language: 'en' } },
  { name: 'departments object helpline (key 0)', path: '/api/get-office-departments', body: { cityName: 'जयपुर', language: 'hi' } },
  { name: 'departments no helpline row', path: '/api/get-office-departments', body: { cityName: 'Nocity', language: 'en' } },

  // --- get-department-officers-details
  { name: 'officers missing', path: '/api/get-department-officers-details', body: {} },
  { name: 'officers bad slug', path: '/api/get-department-officers-details', body: { department_slug: 'nope-599', cityName: 'Lucknow', language: 'en' } },
  { name: 'officers en', path: '/api/get-department-officers-details', body: { department_slug: 'p5-police', cityName: 'Lucknow', stateName: UP, language: 'en' } },
  { name: 'officers hi with state', path: '/api/get-department-officers-details', body: { department_slug: 'p5-police', cityName: 'लखनऊ', stateName: UP_HI, language: 'hi' } },
  { name: 'officers hi no state', path: '/api/get-department-officers-details', body: { department_slug: 'p5-police', cityName: 'कानपुर', language: 'hi' } },
  { name: 'officers hi not found', path: '/api/get-department-officers-details', body: { department_slug: 'p5-police', cityName: 'नहीं', language: 'hi' } },
  { name: 'officers en no state (empty)', path: '/api/get-department-officers-details', body: { department_slug: 'p5-police', cityName: 'Lucknow', language: 'en' } },
  { name: 'officers other language', path: '/api/get-department-officers-details', body: { department_slug: 'p5-fire', cityName: 'Lucknow', stateName: UP, language: 'fr' } },
  { name: 'officers array city (TypeError 500)', path: '/api/get-department-officers-details', body: { department_slug: 'p5-police', cityName: ['a'], language: 'en' } },

  // --- get-public-department-search (auth:sanctum)
  { name: 'dept search no token', path: '/api/get-public-department-search', body: { search: 'P5' } },
  { name: 'dept search empty', path: '/api/get-public-department-search', body: {}, token: T501 },
  { name: 'dept search "0"', path: '/api/get-public-department-search', as: 'form', body: { search: '0' }, token: T501 },
  { name: 'dept search rank match + location', path: '/api/get-public-department-search', body: { search: 'P5Zed' }, token: T501 },
  { name: 'dept search number match', path: '/api/get-public-department-search', body: { search: '555' }, token: T501 },
  { name: 'dept search no location user', path: '/api/get-public-department-search', body: { search: 'SP' }, token: T502 },

  // --- notifications
  { name: 'notifications missing', path: '/api/notifications', body: {} },
  { name: 'notifications bad language', path: '/api/notifications', body: { stateName: UP, cityName: 'Lucknow', language: 'de' } },
  {
    name: 'notifications en',
    path: '/api/notifications',
    body: { stateName: UP, cityName: 'Lucknow', language: 'en' },
    token: T501,
    before: freshNotification,
    volatile: ['data.*.created_at'],
  },
  {
    name: 'notifications hi + ads',
    path: '/api/notifications',
    body: { stateName: UP, cityName: 'Lucknow', language: 'hi', location: 'notifications' },
    token: T501,
    before: freshNotification,
    volatile: ['data.*.created_at'],
  },
  { name: 'notifications missing advert (error)', path: '/api/notifications', body: { stateName: UP, cityName: 'Lucknow', language: 'en' }, token: T502 },
  { name: 'notifications advert without client (error)', path: '/api/notifications', body: { stateName: UP, cityName: 'Lucknow', language: 'hi' }, token: T503 },
  { name: 'notifications pipe token wrong', path: '/api/notifications', body: { stateName: UP, cityName: 'Lucknow', language: 'en' }, token: '501|nope' },
  { name: 'notifications no token (user_id IS NULL)', path: '/api/notifications', body: { stateName: UP, cityName: 'Lucknow', language: 'en', location: 'notifications' }, volatile: ['data.*.created_at'] },

  // --- get-user-notification-count
  { name: 'count missing', path: '/api/get-user-notification-count', body: { stateName: UP } },
  { name: 'count user 501', path: '/api/get-user-notification-count', body: { stateName: UP, cityName: 'Lucknow', language: 'en' }, token: T501, before: resetRead },
  { name: 'count no token', path: '/api/get-user-notification-count', body: { stateName: UP, cityName: 'Lucknow', language: 'hi' } },

  // --- mark-notifications-as-read
  { name: 'mark missing id', path: '/api/mark-notifications-as-read', body: {} },
  { name: 'mark not found (no user_id → IS NULL)', path: '/api/mark-notifications-as-read', body: { notification_id: 505 } },
  { name: 'mark wrong user', path: '/api/mark-notifications-as-read', body: { notification_id: 505, user_id: 502 } },
  { name: 'mark ok', path: '/api/mark-notifications-as-read', as: 'form', body: { notification_id: '505', user_id: '501' }, before: resetRead },
  { name: 'mark already read', path: '/api/mark-notifications-as-read', body: { notification_id: 503, user_id: 501 } },
];
