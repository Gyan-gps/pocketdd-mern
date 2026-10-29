// business admin admin entities: Business* CrudControllers.
import type { CrudConfig } from '../crud.js';
import { business } from '../entities/business.js';
import { businessDetail, businessDetailExtraRoutes } from '../entities/business-detail.js';
import { businessImage } from '../entities/business-image.js';
import { businessLocation } from '../entities/business-location.js';
import { businessOwner } from '../entities/business-owner.js';
import { businessRequestManagement } from '../entities/business-request.js';

export const businessEntities: CrudConfig[] = [business, businessLocation, businessDetail, businessImage, businessRequestManagement, businessOwner];
/** GET admin/business-detail/fetch/pincode (custom route outside Route::crud). */
export const businessRoutes = businessDetailExtraRoutes;
