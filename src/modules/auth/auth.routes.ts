import { Router } from 'express';
import { sanctum } from '../../core/auth/sanctum.js';
import { action } from '../../core/http/action.js';
import { serializeUser } from '../../models/user.js';
import * as c from './auth.controller.js';

const A = 'Api\\AuthController@';
const router = Router();

// Route::get('/user', fn (Request $request) => $request->user())->middleware('auth:sanctum')
router.get('/user', sanctum, action('Closure', (req) => serializeUser(req.user!), { logFailures: false }));

// Route::middleware(['log.api.failures'])
router.post('/auth/send-login-otp', action(A + 'sendLoginOtp', c.sendLoginOtp));
router.post('/verify-mobile-otp', action(A + 'verifyMobileOtp', c.verifyMobileOtp));
router.post('/change-location-name-as-per-language', action(A + 'changeLocationNameAsPerLanguage', c.changeLocationNameAsPerLanguage));
router.post('/get-all-states', action(A + 'getAllStates', c.getAllStates));
router.post('/get-all-states-cities', action(A + 'getAllStatesCities', c.getAllStatesCities));
router.post('/get-pincode-by-state-city', action(A + 'getPinCodeByStateCity', c.getPinCodeByStateCity));
router.post('/get-tehsils-by-state-city', action(A + 'getTehsilsByStateCity', c.getTehsilsByStateCity));
router.post('/get-tehsils', action(A + 'getTehsils', c.getTehsils));
router.post('/get-area-by-tehsils', action(A + 'getAreaByTehsils', c.getAreaByTehsils));
router.post('/get-all-categories', action(A + 'getAllCategories', c.getAllCategories));
router.post('/store-device-id', action(A + 'storeDeviceId', c.storeDeviceId));
router.get('/install-count', action(A + 'getInstallCount', c.getInstallCount));
router.post('/get-app-info', action(A + 'checkAppVersion', c.checkAppVersion));
router.post('/popup-ads', action(A + 'getPopupAds', c.getPopupAds));
router.post('/save-ad-view', action(A + 'saveAdView', c.saveAdView));

// Route::get('/test-api-error', ...)->name('api.test.error')
router.get(
  '/test-api-error',
  action('api.test.error', () => {
    throw new Error('This is a test API error');
  }),
);

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post('/user-logout', sanctum, action(A + 'userLogout', c.userLogout));

export default router;
