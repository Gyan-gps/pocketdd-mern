// Phase 8 fixtures: a dedicated admin login for tests (the real admin's password is never touched).
import { hashMake } from '../../src/core/auth/hash.js';
import type { Seed } from './types.js';

const now = '2025-06-19 10:30:00';

export const ADMIN_TEST_EMAIL = 'parity-admin@pocketdd.test';
export const ADMIN_TEST_PASSWORD = 'parity-secret-123';

export const seed: Seed = [
  [
    'users',
    [
      {
        id: 800, name: 'Parity Admin', email: ADMIN_TEST_EMAIL, phone: '9000000800',
        password: await hashMake(ADMIN_TEST_PASSWORD), status: 1, created_at: now, updated_at: now,
      },
    ],
  ],
  [
    'departments',
    [
      { id: 800, department_name: 'Police Department', department_name_hi: 'पुलिस विभाग', slug: 'policedepartment', status: 1, created_at: now, updated_at: now },
      { id: 801, department_name: 'Fire Brigade', department_name_hi: 'अग्निशमन', slug: 'firebrigade', status: 0, created_at: now, updated_at: now },
    ],
  ],
];
