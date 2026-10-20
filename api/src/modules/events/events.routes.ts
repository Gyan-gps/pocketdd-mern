import { Router } from 'express';
import { action } from '../../core/http/route.js';
import * as c from './events.controller.js';

const A = 'Api\\EventController@';
const router = Router();

// Route::middleware(['log.api.failures'])
router.post('/get-all-business-events', action(A + 'getAllBusinessEvents', c.getAllBusinessEvents));
router.post('/get-business-event-details', action(A + 'getBusinessEventDetails', c.getBusinessEventDetails));

export default router;
