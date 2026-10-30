import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { action } from '../core/http/action.js';
import { serializeUser } from '../serializers/user.serializer.js';
import * as authController from '../controllers/auth.controller.js';

const LARAVEL_CONTROLLER = 'Api\\AuthController@';
const router = Router();

// Route::get('/user', fn (Request $request) => $request->user())->middleware('auth:sanctum')
router.get('/user', authenticate, action('Closure', (req) => serializeUser(req.user!), { logFailures: false }));

// Route::middleware(['log.api.failures'])
router.post('/auth/send-login-otp', action(LARAVEL_CONTROLLER + 'sendLoginOtp', authController.sendLoginOtp));
router.post('/verify-mobile-otp', action(LARAVEL_CONTROLLER + 'verifyMobileOtp', authController.verifyMobileOtp));
router.post('/change-location-name-as-per-language', action(LARAVEL_CONTROLLER + 'changeLocationNameAsPerLanguage', authController.changeLocationNameAsPerLanguage));
router.post('/get-all-states', action(LARAVEL_CONTROLLER + 'getAllStates', authController.getAllStates));
router.post('/get-all-states-cities', action(LARAVEL_CONTROLLER + 'getAllStatesCities', authController.getAllStatesCities));
router.post('/get-pincode-by-state-city', action(LARAVEL_CONTROLLER + 'getPinCodeByStateCity', authController.getPinCodeByStateCity));
router.post('/get-tehsils-by-state-city', action(LARAVEL_CONTROLLER + 'getTehsilsByStateCity', authController.getTehsilsByStateCity));
router.post('/get-tehsils', action(LARAVEL_CONTROLLER + 'getTehsils', authController.getTehsils));
router.post('/get-area-by-tehsils', action(LARAVEL_CONTROLLER + 'getAreaByTehsils', authController.getAreaByTehsils));
router.post('/get-all-categories', action(LARAVEL_CONTROLLER + 'getAllCategories', authController.getAllCategories));
router.post('/store-device-id', action(LARAVEL_CONTROLLER + 'storeDeviceId', authController.storeDeviceId));
router.get('/install-count', action(LARAVEL_CONTROLLER + 'getInstallCount', authController.getInstallCount));
router.post('/get-app-info', action(LARAVEL_CONTROLLER + 'checkAppVersion', authController.checkAppVersion));
router.post('/popup-ads', action(LARAVEL_CONTROLLER + 'getPopupAds', authController.getPopupAds));
router.post('/save-ad-view', action(LARAVEL_CONTROLLER + 'saveAdView', authController.saveAdView));

// Route::get('/test-api-error', ...)->name('api.test.error')
router.get(
  '/test-api-error',
  action('api.test.error', () => {
    throw new Error('This is a test API error');
  }),
);

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post('/user-logout', authenticate, action(LARAVEL_CONTROLLER + 'userLogout', authController.userLogout));

export default router;
