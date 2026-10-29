// staff & events admin — Staff (BusinessUser) + Event admin screens. Columns the PHP writes/validates that the local DB lacks:
// BusinessUserRequest `unique:business_users,aadhar_no`, fields designation / description_hi (Backpack saves
// every declared field), Event field `tahsil` (EventUpdateRequest requires it, show column `tahsil`).
import type { SchemaPatch } from './types.js';

export const patch: SchemaPatch = {
  columns: {
    business_users: {
      designation: 'VARCHAR(191) NULL',
      aadhar_no: 'VARCHAR(191) NULL',
      description_hi: 'TEXT NULL',
    },
    events: {
      tahsil: 'VARCHAR(191) NULL',
    },
  },
};
