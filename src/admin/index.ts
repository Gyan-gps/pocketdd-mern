// Admin panel API (mounted at /api/admin) — replaces Laravel Backpack (pocketdd-admin).
//
// Layout of src/admin:
//  - index.ts    this router: auth, custom routes, one CRUD router per entity, and GET /entities (panel navigation).
//  - auth.ts     admin login/logout/me and the `adminAuth` middleware (Sanctum token with Backpack's session timeout).
//  - crud.ts     the generic CRUD engine: list/show/create/update/delete driven by a `CrudConfig`.
//  - entities/   one `CrudConfig` per Backpack XCrudController (route, operations, list/search/filters, fields,
//                validation schemas from src/validators/admin, hooks).
//  - sections/   groups of entities + their extra routes (business, directory, staff/events) registered below.
//  - routes/     non-CRUD endpoints (Excel imports, slider reorder, dashboard/charts).
//  - support/    helpers shared by entities (MySQL column coercion, Backpack filters, list helpers).
//  - uploads.ts / xlsx.ts  Backpack upload fields and the minimal .xlsx reader/writer used by the imports.
import { Router } from 'express';
import { adminAuthRoutes } from './auth.js';
import { crudRouter, type CrudConfig } from './crud.js';
import { department } from './entities/department.js';
import { businessCategory } from './entities/business-category.js';
import { businessSubCategory } from './entities/business-sub-category.js';
import { advertisement } from './entities/advertisement.js';
import { slider } from './entities/slider.js';
import { location } from './entities/location.js';
import { catalogImportRoutes } from './routes/catalog-imports.js';
import { staffEventEntities, staffEventRoutes } from './sections/staff-events.js';
import { businessEntities, businessRoutes } from './sections/business.js';
import { directoryEntities, dashboardRoutes } from './sections/directory.js';

// One entry per Route::crud(...) in pocketdd-admin/routes/backpack/custom.php (see admin/modules/*).
const ENTITIES: CrudConfig[] = [department, businessCategory, businessSubCategory, advertisement, slider, location, ...staffEventEntities, ...businessEntities, ...directoryEntities];

export const adminRoutes = Router();
adminRoutes.use('/auth', adminAuthRoutes);
adminRoutes.use(catalogImportRoutes); // imports + slider/reorder (before the CRUD '/:id' routes)
adminRoutes.use(staffEventRoutes); // admin/business-user/fetch/pincode
adminRoutes.use(businessRoutes); // admin/business-detail/fetch/pincode
adminRoutes.use(dashboardRoutes); // charts/*, dashboard, import-pincode-data, insertPinCodeData
for (const entity of ENTITIES) adminRoutes.use(`/${entity.route}`, crudRouter(entity));

/**
 * Fields whose FormRequest rules start with or contain `required` — Backpack marks these with a red
 * asterisk. Only static rule sets can be inspected; rule closures are skipped.
 */
function requiredFields(rules: unknown): string[] {
  if (!rules || typeof rules !== 'object') return [];
  return Object.entries(rules as Record<string, string>)
    .filter(([name, rule]) => !name.includes('*') && typeof rule === 'string' && rule.split('|').includes('required'))
    .map(([name]) => name);
}

/** Entity list for the panel's navigation, plus the required fields per form. */
adminRoutes.get('/entities', (_req, res) => {
  res.json(
    ENTITIES.map((entity) => ({
      route: entity.route,
      operations: entity.operations,
      required: {
        create: requiredFields(entity.validation?.create?.rules),
        update: requiredFields(entity.validation?.update?.rules),
      },
    })),
  );
});
