import { Router } from 'express';
import { sanctum } from '../../core/auth/sanctum.js';
import { action } from '../../core/http/action.js';
import * as c from './profile.controller.js';

const A = 'Api\BusinessUserProfileController@';
const router = Router();

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post('/business-user-profile-details', sanctum, action(A + 'getBusinessUserProfile', c.getBusinessUserProfile));
router.post('/get-user-and-business-details', sanctum, action(A + 'getUserAndBusinessDetails', c.getUserAndBusinessDetails));
router.post('/update-user-profile', sanctum, action(A + 'updateUserProfile', c.updateUserProfile));

export default router;
