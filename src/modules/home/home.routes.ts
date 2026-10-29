import { Router } from 'express';
import { sanctum } from '../../core/auth/sanctum.js';
import { action } from '../../core/http/action.js';
import * as c from './home.controller.js';

const A = 'Api\\ApiController@';
const router = Router();

// Route::middleware(['log.api.failures'])
router.post('/get-dashboard-data', action(A + 'getDashboardData', c.getDashboardData));
router.post('/get-business-subcategories', action(A + 'getBusinessSubCategories', c.getBusinessSubCategories));
router.post('/get-all-businesses', action(A + 'getAllBusiness', c.getAllBusiness));
router.post('/get-all-business-details', action(A + 'getBusinessDetails', c.getBusinessDetails));
router.post('/get-dashboard-search-categories', action(A + 'homeCategorySearch', c.homeCategorySearch));
router.post('/get-about-us', action(A + 'aboutUs', c.aboutUs));

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post('/search-business-sub-category', sanctum, action(A + 'searchBusinessSubCategory', c.searchBusinessSubCategory));
router.post('/get-all-business-summaries', sanctum, action(A + 'getAllBusinessSummaries', c.getAllBusinessSummaries));

export default router;
