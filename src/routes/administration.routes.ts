import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { action } from '../core/http/action.js';
import * as administrationController from '../controllers/administration.controller.js';

const LARAVEL_CONTROLLER = 'Api\\AdministrationController@';
const router = Router();

// Route::middleware(['log.api.failures'])
router.post('/get-office-departments', action(LARAVEL_CONTROLLER + 'getPublicDepartments', administrationController.getPublicDepartments));
router.post('/get-department-officers-details', action(LARAVEL_CONTROLLER + 'getPublicDepartmentOfficers', administrationController.getPublicDepartmentOfficers));

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post('/get-public-department-search', authenticate, action(LARAVEL_CONTROLLER + 'searchOfficeContactDetails', administrationController.searchOfficeContactDetails));

export default router;
