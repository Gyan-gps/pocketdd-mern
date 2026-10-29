// directory admin admin entities + custom routes (registered in ./index.ts).
import type { CrudConfig } from '../crud.js';
import { aboutUs } from '../entities/about-us.js';
import { address } from '../entities/address.js';
import { administrator } from '../entities/administrator.js';
import { cityHelplineNumber } from '../entities/city-helpline-number.js';
import { designation } from '../entities/designation.js';
import { pincode } from '../entities/pincode.js';

export const directoryEntities: CrudConfig[] = [designation, administrator, cityHelplineNumber, address, aboutUs, pincode];
export { dashboardRoutes } from '../routes/dashboard.js';
