/**
 * DEV ONLY. The local DB is older than production: tables/columns the Laravel code uses were added on
 * the server without migrations. This script adds what is missing (reconstructed from the PHP code,
 * one file per feature area in scripts/schema/, NN- prefix = run order), so both apps can run locally. It only CREATEs tables /
 * ADDs nullable columns / relaxes NOT NULL — never drops or narrows anything. Replace with a production `mysqldump --no-data`
 * when available.
 *
 *   docker compose exec api npx tsx scripts/dev-schema-patch.ts
 */
import { readdirSync } from 'node:fs';
import { all, exec, first, pool } from '../src/db/mysql.js';
import type { SchemaPatch } from './schema/types.js';

async function existingColumns(table: string): Promise<Set<string> | null> {
  const rows = await all(
    'SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  );
  return rows.length ? new Set(rows.map((r) => String(r.c))) : null;
}

const files = readdirSync(new URL('./schema/', import.meta.url)).filter((f) => /^\d{2}-.*\.ts$/.test(f)).sort();
const changes: string[] = [];

for (const file of files) {
  const { patch } = (await import(`./schema/${file}`)) as { patch: SchemaPatch };

  for (const [table, def] of Object.entries(patch.tables ?? {})) {
    if (await existingColumns(table)) continue;
    const cols = Object.entries(def.columns).map(([n, t]) => `\`${n}\` ${t}`);
    await exec(
      `CREATE TABLE \`${table}\` (\`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, ${[...cols, ...(def.extra ?? [])].join(', ')})
       ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    changes.push(`[${file}] created ${table}`);
  }

  for (const [table, cols] of Object.entries(patch.columns ?? {})) {
    const have = await existingColumns(table);
    if (!have) {
      changes.push(`[${file}] SKIPPED ${table} (table missing — add it under "tables")`);
      continue;
    }
    for (const [name, type] of Object.entries(cols)) {
      if (have.has(name)) continue;
      await exec(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${type}`);
      changes.push(`[${file}] added ${table}.${name}`);
    }
  }

  for (const [table, names] of Object.entries(patch.nullable ?? {})) {
    for (const name of names) {
      const col = await first(
        `SELECT IS_NULLABLE n, COLUMN_TYPE t FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, name],
      );
      if (!col || col.n === 'YES') continue;
      await exec(`ALTER TABLE \`${table}\` MODIFY \`${name}\` ${col.t} NULL`);
      changes.push(`[${file}] ${table}.${name} now nullable`);
    }
  }
}

console.log(changes.length ? changes.join('\n') : 'schema already up to date');
await pool.end();
