import { Router } from 'express';
import { sanctum } from '../../core/auth/sanctum.js';
import { action } from '../../core/http/action.js';
import * as c from './administration.controller.js';

const A = 'Api\\AdministrationController@';
const router = Router();

// Route::middleware(['log.api.failures'])
router.post('/get-office-departments', action(A + 'getPublicDepartments', c.getPublicDepartments));
router.post('/get-department-officers-details', action(A + 'getPublicDepartmentOfficers', c.getPublicDepartmentOfficers));

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post('/get-public-department-search', sanctum, action(A + 'searchOfficeContactDetails', c.searchOfficeContactDetails));

export default router;
