// Phase 8 — admin framework reference entity (Admin\DepartmentCrudController).
import type { SchemaPatch } from './types.js';

export const patch: SchemaPatch = {
  columns: {
    departments: {
      department_name: 'VARCHAR(191) NULL',
      department_name_hi: 'VARCHAR(191) NULL',
      slug: 'VARCHAR(191) NULL',
      department_mobile_number: 'LONGTEXT NULL',
    },
  },
};
