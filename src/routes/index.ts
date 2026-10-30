import { Router } from 'express';
import auth from './auth.routes.js';
import adminLookups from './admin-lookups.routes.js';
import business from './business.routes.js';
import businessLocation from './business-location.routes.js';
import profile from './profile.routes.js';
import health from './health.routes.js';
import home from './home.routes.js';
import events from './event.routes.js';
import administration from './administration.routes.js';
import notifications from './notification.routes.js';

// Each Laravel controller becomes a module under src/modules/<name>/,
// mounted here under the same /api/... paths.
export const routes = Router();
routes.use(health);
routes.use(auth);
routes.use(adminLookups);
routes.use(events, administration, notifications);
routes.use(home);
routes.use(business, businessLocation, profile);
