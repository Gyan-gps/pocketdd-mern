import { Router } from 'express';
import { action } from '../core/http/action.js';
import * as eventController from '../controllers/event.controller.js';

/** Laravel action names, stored as `api_failures.api_name` when a request fails. */
const LARAVEL_CONTROLLER = 'Api\\EventController@';
const router = Router();

// Route::middleware(['log.api.failures'])
router.post('/get-all-business-events', action(LARAVEL_CONTROLLER + 'getAllBusinessEvents', eventController.getAllBusinessEvents));
router.post('/get-business-event-details', action(LARAVEL_CONTROLLER + 'getBusinessEventDetails', eventController.getBusinessEventDetails));

export default router;
