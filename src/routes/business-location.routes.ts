import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { action } from '../core/http/action.js';
import * as businessLocationController from '../controllers/business-location.controller.js';

const LARAVEL_CONTROLLER = 'Api\BusinessLocationController@';
const router = Router();

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post('/get-all-business-locations', authenticate, action(LARAVEL_CONTROLLER + 'getAllBusinessLocations', businessLocationController.getAllBusinessLocations));
router.post('/update-business-location', authenticate, action(LARAVEL_CONTROLLER + 'updateBusinessUserLocation', businessLocationController.updateBusinessUserLocation));

export default router;
