import { Router } from 'express';
import { sanctum } from '../../core/auth/sanctum.js';
import { action } from '../../core/http/route.js';
import * as c from './business-location.controller.js';

const A = 'Api\BusinessLocationController@';
const router = Router();

// Route::middleware(['auth:sanctum', 'log.api.failures'])
router.post('/get-all-business-locations', sanctum, action(A + 'getAllBusinessLocations', c.getAllBusinessLocations));
router.post('/update-business-location', sanctum, action(A + 'updateBusinessUserLocation', c.updateBusinessUserLocation));

export default router;
