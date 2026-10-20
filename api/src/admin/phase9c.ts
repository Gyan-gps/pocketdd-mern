// Phase 9C: Staff (BusinessUser*) + Event* admin screens and their custom routes.
import { Router } from 'express';
import { adminAuth } from './auth.js';
import type { CrudConfig } from './crud.js';
import { businessUser } from './entities/business-user.js';
import { businessUserLocation } from './entities/business-user-location.js';
import { event } from './entities/event.js';
import { eventDetail } from './entities/event-detail.js';
import { eventLocation } from './entities/event-location.js';

export const phase9cEntities: CrudConfig[] = [businessUser, businessUserLocation, event, eventLocation, eventDetail];

export const phase9cRoutes = Router();
// routes/backpack/custom.php: Route::get('admin/business-user/fetch/pincode', [BusinessUserCrudController, 'fetchPincode'])
// Laravel quirk: the controller has no fetchPincode() → BadMethodCallException (500) for every call.
phase9cRoutes.get('/admin/business-user/fetch/pincode', adminAuth, (_req, res) => {
  res.status(500).json({
    message: 'Method App\\Http\\Controllers\\Admin\\BusinessUserCrudController::fetchPincode does not exist.',
    exception: 'BadMethodCallException',
  });
});
