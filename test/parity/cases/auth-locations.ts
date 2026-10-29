import { exec } from '../../../src/db/mysql.js';
import type { ParityCase } from '../types.js';

const TEST_PHONE = '9000000001';

const resetLogin = async () => {
  await exec(
    "DELETE FROM personal_access_tokens WHERE tokenable_id IN (SELECT id FROM users WHERE phone = ?) AND tokenable_type = 'App\\\\Models\\\\User'",
    [TEST_PHONE],
  );
  await exec('DELETE FROM users WHERE phone = ?', [TEST_PHONE]);
  await exec('DELETE FROM otp_verifications WHERE phone_number = ?', [TEST_PHONE]);
  await exec("INSERT INTO otp_verifications (phone_number, otp, created_at, updated_at) VALUES (?, '54321', NOW(), NOW())", [TEST_PHONE]);
};

export const cases: ParityCase[] = [
  // --- auth / otp (no successful send-login-otp: it would send a real SMS)
  { name: 'send-login-otp missing phone', path: '/api/auth/send-login-otp', body: {} },
  { name: 'send-login-otp short phone', path: '/api/auth/send-login-otp', body: { phone: '12345' } },
  { name: 'send-login-otp blank phone (form)', path: '/api/auth/send-login-otp', as: 'form', body: { phone: '   ' } },
  { name: 'verify-otp missing otp', path: '/api/verify-mobile-otp', body: { phone: TEST_PHONE } },
  { name: 'verify-otp wrong otp', path: '/api/verify-mobile-otp', body: { phone: TEST_PHONE, client_otp: '11111' }, before: resetLogin },
  { name: 'verify-otp numeric otp (strict !==)', path: '/api/verify-mobile-otp', body: { phone: TEST_PHONE, client_otp: 54321 }, before: resetLogin },
  {
    name: 'verify-otp new user login',
    path: '/api/verify-mobile-otp',
    as: 'form',
    body: { phone: TEST_PHONE, client_otp: '54321', fcm_token: 'fcm-abc' },
    before: resetLogin,
    volatile: ['token', 'user.id', 'user.created_at', 'user.updated_at'],
  },
  { name: 'logout without token', path: '/api/user-logout' },
  { name: 'logout with token', path: '/api/user-logout', token: '$TOKEN' },
  { name: 'GET /user with token', method: 'GET', path: '/api/user', token: '$TOKEN', volatile: ['updated_at'] },
  { name: 'GET /user bad token', method: 'GET', path: '/api/user', token: '999999|nope' },

  // --- locations
  { name: 'states en (default)', path: '/api/get-all-states', body: {} },
  { name: 'states hi', path: '/api/get-all-states', body: { language: 'hi' } },
  { name: 'cities missing state', path: '/api/get-all-states-cities', body: {} },
  { name: 'cities en', path: '/api/get-all-states-cities', body: { state: 'Uttar' } },
  { name: 'cities hi', path: '/api/get-all-states-cities', body: { state: 'उत्तर', language: 'hi' } },
  { name: 'pincodes missing language', path: '/api/get-pincode-by-state-city', body: { state: 'Uttar Pradesh', city: 'Lucknow' } },
  { name: 'pincodes en (unique)', path: '/api/get-pincode-by-state-city', body: { state: 'Uttar Pradesh', city: 'Lucknow', language: 'en' } },
  { name: 'pincodes hi', path: '/api/get-pincode-by-state-city', body: { state: 'उत्तर प्रदेश', city: 'लखनऊ', language: 'hi' } },
  { name: 'pincodes state not string', path: '/api/get-pincode-by-state-city', body: { state: 5, city: 'Lucknow', language: 'en' } },
  { name: 'tehsil by pincode en', path: '/api/get-tehsils-by-state-city', body: { state: 'Uttar Pradesh', city: 'Lucknow', pincode: 1, language: 'en' } },
  { name: 'tehsil by pincode hi', path: '/api/get-tehsils-by-state-city', body: { state: 'उत्तर प्रदेश', city: 'लखनऊ', pincode: 3, language: 'hi' } },
  { name: 'tehsil by pincode not found', path: '/api/get-tehsils-by-state-city', body: { state: 'Uttar Pradesh', city: 'Lucknow', pincode: 99, language: 'en' } },
  { name: 'tehsil missing pincode', path: '/api/get-tehsils-by-state-city', body: { state: 'Uttar Pradesh', city: 'Lucknow' } },
  { name: 'tehsils en', path: '/api/get-tehsils', body: { state: 'Uttar Pradesh', city: 'Lucknow', language: 'en' } },
  { name: 'tehsils hi', path: '/api/get-tehsils', body: { state: 'उत्तर प्रदेश', city: 'लखनऊ', language: 'hi' } },
  { name: 'tehsils bad language', path: '/api/get-tehsils', body: { state: 'x', city: 'y', language: 'fr' } },
  { name: 'areas list + object JSON', path: '/api/get-area-by-tehsils', body: { state: 'Uttar Pradesh', city: 'Lucknow', tehsil: 'Sadar', language: 'en' } },
  { name: 'areas null JSON', path: '/api/get-area-by-tehsils', body: { state: 'Uttar Pradesh', city: 'Lucknow', tehsil: 'Mohanlalganj', language: 'en' } },
  { name: 'areas missing tehsil', path: '/api/get-area-by-tehsils', body: { state: 'Uttar Pradesh', city: 'Lucknow', language: 'en' } },
  { name: 'location name en→hi', path: '/api/change-location-name-as-per-language', body: { language: 'hi', stateName: 'Uttar Pradesh', cityName: 'Lucknow' } },
  { name: 'location name hi→en', path: '/api/change-location-name-as-per-language', body: { language: 'en', stateName: 'उत्तर प्रदेश', cityName: 'लखनऊ' } },
  { name: 'location name padded', path: '/api/change-location-name-as-per-language', as: 'form', body: { language: 'en', stateName: '  Uttar Pradesh ', cityName: ' Lucknow' } },
  { name: 'location not found', path: '/api/change-location-name-as-per-language', body: { language: 'en', stateName: 'X', cityName: 'Y' } },

  // --- categories (always throws in Laravel)
  { name: 'all categories', path: '/api/get-all-categories', body: { cityName: 'Lucknow', language: 'en' } },

  // --- device / app / ads
  { name: 'store device missing id', path: '/api/store-device-id', body: {} },
  {
    name: 'store device new',
    path: '/api/store-device-id',
    body: { device_id: 'dev-parity-1', device_model: 'Pixel', android_version: '14', app_version: '1.4.0' },
    before: () => exec("DELETE FROM device_ids WHERE device_id = 'dev-parity-1'").then(() => undefined),
  },
  { name: 'store device existing', path: '/api/store-device-id', body: { device_id: 'dev-parity-1', device_model: 'Pixel 8' } },
  { name: 'install count', method: 'GET', path: '/api/install-count' },
  { name: 'app info', path: '/api/get-app-info' },
  { name: 'popup ads missing fields', path: '/api/popup-ads', body: { stateName: 'Uttar Pradesh' } },
  {
    name: 'popup ads unseen',
    path: '/api/popup-ads',
    body: { stateName: 'Uttar Pradesh', cityName: 'Lucknow', language: 'en', device_id: 'dev-parity-ads' },
    before: () => exec("DELETE FROM ad_user_views WHERE device_id = 'dev-parity-ads'").then(() => undefined),
  },
  { name: 'popup ads no businesses', path: '/api/popup-ads', body: { stateName: 'Rajasthan', cityName: 'Jaipur', language: 'en', device_id: 'x' } },
  { name: 'save ad view not array', path: '/api/save-ad-view', body: { device_id: 'dev-parity-ads', ad_ids: 1 } },
  { name: 'save ad view unknown ad', path: '/api/save-ad-view', body: { device_id: 'dev-parity-ads', ad_ids: [1, 999] } },
  {
    name: 'save ad view ok',
    path: '/api/save-ad-view',
    body: { device_id: 'dev-parity-ads', ad_ids: [1] },
    before: () => exec("DELETE FROM ad_user_views WHERE device_id = 'dev-parity-ads'").then(() => undefined),
  },
  {
    name: 'popup ads after view',
    path: '/api/popup-ads',
    body: { stateName: 'Uttar Pradesh', cityName: 'Lucknow', language: 'en', device_id: 'dev-parity-ads' },
  },
];
