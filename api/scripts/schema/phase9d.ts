// Phase 9D — admin CRUD (Administrator, Designation, CityHelplineNumber, Address, AboutUs, PinCode) + dashboard.
import type { SchemaPatch } from './types.js';

export const patch: SchemaPatch = {
  columns: {
    // CityHelplineNumberCrudController writes `state` (create form), filters and lists by it, and
    // CityHelplineNumberRequest requires it — the local table predates that column.
    city_helpline_numbers: { state: 'VARCHAR(191) NULL' },
  },
};
