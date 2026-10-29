import { Router } from 'express';
import { action } from '../../core/http/action.js';
import * as c from './notifications.controller.js';

const A = 'Api\\NotificationController@';
const router = Router();

// Route::middleware(['log.api.failures'])
router.post('/notifications', action(A + 'sendNotification', c.sendNotification));
router.post('/mark-notifications-as-read', action(A + 'markAsRead', c.markAsRead));
router.post('/get-user-notification-count', action(A + 'getUserNotificationCount', c.getUserNotificationCount));

export default router;
