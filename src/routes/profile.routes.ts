import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { action } from '../core/http/action.js';
import * as profileController from '../controllers/profile.controller.js';

const LARAVEL_CONTROLLER = 'Api\BusinessUserProfileController@';
const router = Router();

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post('/business-user-profile-details', authenticate, action(LARAVEL_CONTROLLER + 'getBusinessUserProfile', profileController.getBusinessUserProfile));
router.post('/get-user-and-business-details', authenticate, action(LARAVEL_CONTROLLER + 'getUserAndBusinessDetails', profileController.getUserAndBusinessDetails));
router.post('/update-user-profile', authenticate, action(LARAVEL_CONTROLLER + 'updateUserProfile', profileController.updateUserProfile));

export default router;
