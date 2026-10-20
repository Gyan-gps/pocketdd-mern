// Node queue table (replaces Laravel's `jobs` + `failed_jobs` for jobs dispatched by Node).
import type { SchemaPatch } from './types.js';

export const patch: SchemaPatch = {
  tables: {
    node_jobs: {
      columns: {
        uuid: 'VARCHAR(36) NOT NULL',
        queue: 'VARCHAR(191) NOT NULL',
        job: 'VARCHAR(191) NOT NULL',
        args: 'LONGTEXT NOT NULL',
        attempts: 'TINYINT UNSIGNED NOT NULL DEFAULT 0',
        reserved_at: 'INT UNSIGNED NULL',
        reserved_by: 'VARCHAR(36) NULL',
        available_at: 'INT UNSIGNED NOT NULL',
        created_at: 'INT UNSIGNED NOT NULL',
        failed_at: 'TIMESTAMP NULL',
        exception: 'LONGTEXT NULL',
      },
      extra: ['KEY node_jobs_queue_index (queue, failed_at, available_at)', 'UNIQUE KEY node_jobs_uuid_unique (uuid)'],
    },
  },
};
