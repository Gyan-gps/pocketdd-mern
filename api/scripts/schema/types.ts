export type Columns = Record<string, string>;

export interface SchemaPatch {
  /** Tables created when missing (`id` BIGINT PK is added automatically). */
  tables?: Record<string, { columns: Columns; extra?: string[] }>;
  /** Columns added to existing tables when missing. */
  columns?: Record<string, Columns>;
  /** Existing NOT NULL columns that production evidently allows to be NULL (only relaxes constraints). */
  nullable?: Record<string, string[]>;
}

export const TS: Columns = { created_at: 'TIMESTAMP NULL', updated_at: 'TIMESTAMP NULL' };
