import { Router } from 'express';
import { sanctum } from '../../core/auth/sanctum.js';
import { action } from '../../core/http/action.js';
import * as c from './business.controller.js';

const A = 'Api\\BusinessController@';
const router = Router();

// Route::middleware(['log.api.failures'])
router.post('/get-all-business-categories-dropdown', action(A + 'getAllBusinessCategories', c.getAllBusinessCategories));
router.post('/get-all-business-sub-categories-dropdown', action(A + 'getAllBusinessSubCategories', c.getAllBusinessSubCategories));

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post('/add-new-business-request', sanctum, action(A + 'createNewBusinessRequest', c.createNewBusinessRequest));
router.post('/update-business', sanctum, action(A + 'updateUserBusiness', c.updateUserBusiness));
router.post('/get-user-business-details', sanctum, action(A + 'getUserBusinessDetails', c.getUserBusinessDetails));
router.post('/update-user-business', sanctum, action(A + 'updateUserBusiness1', c.updateUserBusiness1));
router.post('/get-business-images', sanctum, action(A + 'getBusinessImages', c.getBusinessImages));
router.post('/add-business-images', sanctum, action(A + 'addBusinessImage', c.addBusinessImage));
router.post('/delete-business-image', sanctum, action(A + 'deleteBusinessImage', c.deleteBusinessImage));
router.post('/update-business-image', sanctum, action(A + 'updateBusinessImage', c.updateBusinessImage));

export default router;
