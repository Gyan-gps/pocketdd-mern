import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { action } from '../core/http/action.js';
import * as businessController from '../controllers/business.controller.js';

const LARAVEL_CONTROLLER = 'Api\\BusinessController@';
const router = Router();

// Route::middleware(['log.api.failures'])
router.post('/get-all-business-categories-dropdown', action(LARAVEL_CONTROLLER + 'getAllBusinessCategories', businessController.getAllBusinessCategories));
router.post('/get-all-business-sub-categories-dropdown', action(LARAVEL_CONTROLLER + 'getAllBusinessSubCategories', businessController.getAllBusinessSubCategories));

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post('/add-new-business-request', authenticate, action(LARAVEL_CONTROLLER + 'createNewBusinessRequest', businessController.createNewBusinessRequest));
router.post('/update-business', authenticate, action(LARAVEL_CONTROLLER + 'updateUserBusiness', businessController.updateUserBusiness));
router.post('/get-user-business-details', authenticate, action(LARAVEL_CONTROLLER + 'getUserBusinessDetails', businessController.getUserBusinessDetails));
router.post('/update-user-business', authenticate, action(LARAVEL_CONTROLLER + 'updateUserBusiness1', businessController.updateUserBusiness1));
router.post('/get-business-images', authenticate, action(LARAVEL_CONTROLLER + 'getBusinessImages', businessController.getBusinessImages));
router.post('/add-business-images', authenticate, action(LARAVEL_CONTROLLER + 'addBusinessImage', businessController.addBusinessImage));
router.post('/delete-business-image', authenticate, action(LARAVEL_CONTROLLER + 'deleteBusinessImage', businessController.deleteBusinessImage));
router.post('/update-business-image', authenticate, action(LARAVEL_CONTROLLER + 'updateBusinessImage', businessController.updateBusinessImage));

export default router;
