// Phase 9D admin entities + custom routes (registered in ./index.ts).
import type { CrudConfig } from './crud.js';
import { aboutUs } from './entities/about-us.js';
import { address } from './entities/address.js';
import { administrator } from './entities/administrator.js';
import { cityHelplineNumber } from './entities/city-helpline-number.js';
import { designation } from './entities/designation.js';
import { pincode } from './entities/pincode.js';

export const phase9dEntities: CrudConfig[] = [designation, administrator, cityHelplineNumber, address, aboutUs, pincode];
export { phase9dRoutes } from './phase9d-routes.js';
