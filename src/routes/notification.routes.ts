import { Router } from 'express';
import { action } from '../core/http/action.js';
import * as notificationController from '../controllers/notification.controller.js';

/** Laravel action names, stored as `api_failures.api_name` when a request fails. */
const LARAVEL_CONTROLLER = 'Api\\NotificationController@';
const router = Router();

// Route::middleware(['log.api.failures'])
router.post('/notifications', action(LARAVEL_CONTROLLER + 'sendNotification', notificationController.sendNotification));
router.post('/mark-notifications-as-read', action(LARAVEL_CONTROLLER + 'markAsRead', notificationController.markAsRead));
router.post(
  '/get-user-notification-count',
  action(LARAVEL_CONTROLLER + 'getUserNotificationCount', notificationController.getUserNotificationCount),
);

export default router;
