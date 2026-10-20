// Phase 9A admin entities: Business* CrudControllers.
import type { CrudConfig } from './crud.js';
import { business } from './entities/phase9a-business.js';
import { businessDetail, businessDetailExtraRoutes } from './entities/phase9a-business-detail.js';
import { businessImage } from './entities/phase9a-business-image.js';
import { businessLocation } from './entities/phase9a-business-location.js';
import { businessOwner } from './entities/phase9a-business-owner.js';
import { businessRequestManagment } from './entities/phase9a-business-request.js';

export const phase9aEntities: CrudConfig[] = [business, businessLocation, businessDetail, businessImage, businessRequestManagment, businessOwner];
/** GET admin/business-detail/fetch/pincode (custom route outside Route::crud). */
export const phase9aRoutes = businessDetailExtraRoutes;
