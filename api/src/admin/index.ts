import { Router } from 'express';
import { adminAuthRoutes } from './auth.js';
import { crudRouter, type CrudConfig } from './crud.js';
import { department } from './entities/department.js';
import { businessCategory } from './entities/business-category.js';
import { businessSubCategory } from './entities/business-sub-category.js';
import { advertisment } from './entities/advertisment.js';
import { slider } from './entities/slider.js';
import { location } from './entities/location.js';
import { catalogImportRoutes } from './routes/catalog-imports.js';
import { staffEventEntities, staffEventRoutes } from './modules/staff-events.js';
import { businessEntities, businessRoutes } from './modules/business.js';
import { directoryEntities, dashboardRoutes } from './modules/directory.js';

// One entry per Route::crud(...) in pocketdd-admin/routes/backpack/custom.php (see admin/modules/*).
const ENTITIES: CrudConfig[] = [department, businessCategory, businessSubCategory, advertisment, slider, location, ...staffEventEntities, ...businessEntities, ...directoryEntities];

export const adminRoutes = Router();
adminRoutes.use('/auth', adminAuthRoutes);
adminRoutes.use(catalogImportRoutes); // imports + slider/reorder (before the CRUD '/:id' routes)
adminRoutes.use(staffEventRoutes); // admin/business-user/fetch/pincode
adminRoutes.use(businessRoutes); // admin/business-detail/fetch/pincode
adminRoutes.use(dashboardRoutes); // charts/*, dashboard, import-pincode-data, insertPinCodeData
for (const cfg of ENTITIES) adminRoutes.use(`/${cfg.route}`, crudRouter(cfg));

/**
 * Fields whose FormRequest rules start with or contain `required` — Backpack marks these with a red
 * asterisk. Only static rule sets can be inspected; rule closures are skipped.
 */
function requiredFields(rules: unknown): string[] {
  if (!rules || typeof rules !== 'object') return [];
  return Object.entries(rules as Record<string, string>)
    .filter(([name, r]) => !name.includes('*') && typeof r === 'string' && r.split('|').includes('required'))
    .map(([name]) => name);
}

/** Entity list for the panel's navigation, plus the required fields per form. */
adminRoutes.get('/entities', (_req, res) => {
  res.json(
    ENTITIES.map((e) => ({
      route: e.route,
      operations: e.operations,
      required: {
        create: requiredFields(e.validation?.create?.rules),
        update: requiredFields(e.validation?.update?.rules),
      },
    })),
  );
});
