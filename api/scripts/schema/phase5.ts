// Phase 5 — Api\EventController, Api\AdministrationController, Api\NotificationController
import type { SchemaPatch } from './types.js';

export const patch: SchemaPatch = {
  columns: {
    events: {
      name_hi: 'VARCHAR(191) NULL',
      short_description: 'TEXT NULL',
      event_description_hi: 'TEXT NULL',
      state: 'VARCHAR(191) NULL',
      district: 'VARCHAR(191) NULL',
    },
    departments: {
      slug: 'VARCHAR(191) NULL',
      department_name: 'VARCHAR(191) NULL',
      department_name_hi: 'VARCHAR(191) NULL',
    },
    administrators: {
      city: 'VARCHAR(191) NULL',
      state: 'VARCHAR(191) NULL',
      officer_rank_name: 'TEXT NULL',
    },
    city_helpline_numbers: { city: 'VARCHAR(191) NULL' },
    businesses: { business_name_en: 'VARCHAR(191) NULL', business_name_hi: 'VARCHAR(191) NULL' },
  },
};
