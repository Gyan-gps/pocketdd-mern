import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { action } from '../core/http/action.js';
import * as homeController from '../controllers/home.controller.js';

/** Laravel action names, stored as `api_failures.api_name` when a request fails. */
const LARAVEL_CONTROLLER = 'Api\\ApiController@';
const router = Router();

// Route::middleware(['log.api.failures'])
router.post('/get-dashboard-data', action(LARAVEL_CONTROLLER + 'getDashboardData', homeController.getDashboardData));
router.post('/get-business-subcategories', action(LARAVEL_CONTROLLER + 'getBusinessSubCategories', homeController.getBusinessSubCategories));
router.post('/get-all-businesses', action(LARAVEL_CONTROLLER + 'getAllBusiness', homeController.getAllBusiness));
router.post('/get-all-business-details', action(LARAVEL_CONTROLLER + 'getBusinessDetails', homeController.getBusinessDetails));
router.post('/get-dashboard-search-categories', action(LARAVEL_CONTROLLER + 'homeCategorySearch', homeController.homeCategorySearch));
router.post('/get-about-us', action(LARAVEL_CONTROLLER + 'aboutUs', homeController.aboutUs));

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post(
  '/search-business-sub-category',
  authenticate,
  action(LARAVEL_CONTROLLER + 'searchBusinessSubCategory', homeController.searchBusinessSubCategory),
);
router.post(
  '/get-all-business-summaries',
  authenticate,
  action(LARAVEL_CONTROLLER + 'getAllBusinessSummaries', homeController.getAllBusinessSummaries),
);

export default router;
