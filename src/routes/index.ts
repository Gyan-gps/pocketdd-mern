import { Router } from 'express';
import auth from '../modules/auth/auth.routes.js';
import adminLookups from '../modules/admin-lookups/admin-lookups.routes.js';
import business from '../modules/business/business.routes.js';
import businessLocation from '../modules/business-location/business-location.routes.js';
import profile from '../modules/profile/profile.routes.js';
import health from '../modules/health/health.routes.js';
import home from '../modules/home/home.routes.js';
import events from '../modules/events/events.routes.js';
import administration from '../modules/administration/administration.routes.js';
import notifications from '../modules/notifications/notifications.routes.js';

// Each Laravel controller becomes a module under src/modules/<name>/,
// mounted here under the same /api/... paths.
export const routes = Router();
routes.use(health);
routes.use(auth);
routes.use(adminLookups);
routes.use(events, administration, notifications);
routes.use(home);
routes.use(business, businessLocation, profile);
