import { Router } from 'express';
import { adminAuthRoutes } from './auth.js';
import { crudRouter, type CrudConfig } from './crud.js';
import { department } from './entities/department.js';
import { businessCategory } from './entities/business-category.js';
import { businessSubCategory } from './entities/business-sub-category.js';
import { advertisment } from './entities/advertisment.js';
import { slider } from './entities/slider.js';
import { location } from './entities/location.js';
import { phase9bRoutes } from './phase9b-routes.js';
import { phase9cEntities, phase9cRoutes } from './phase9c.js';
import { phase9aEntities, phase9aRoutes } from './phase9a.js';
import { phase9dEntities, phase9dRoutes } from './phase9d.js';

// One entry per Route::crud(...) in pocketdd-admin/routes/backpack/custom.php (ported in Phase 9).
const ENTITIES: CrudConfig[] = [department, businessCategory, businessSubCategory, advertisment, slider, location, ...phase9cEntities, ...phase9aEntities, ...phase9dEntities];

export const adminRoutes = Router();
adminRoutes.use('/auth', adminAuthRoutes);
adminRoutes.use(phase9bRoutes); // imports + slider/reorder (before the CRUD '/:id' routes)
adminRoutes.use(phase9cRoutes); // admin/business-user/fetch/pincode
adminRoutes.use(phase9aRoutes); // admin/business-detail/fetch/pincode
adminRoutes.use(phase9dRoutes); // charts/*, dashboard, import-pincode-data, insertPinCodeData
for (const cfg of ENTITIES) adminRoutes.use(`/${cfg.route}`, crudRouter(cfg));

/** Entity list for the panel's navigation (routes that exist on the API). */
adminRoutes.get('/entities', (_req, res) => {
  res.json(ENTITIES.map((e) => ({ route: e.route, operations: e.operations })));
});
