/**
 * DEV ONLY. Fixtures for parity tests (the local DB is empty). One file per feature area in scripts/seed/ (NN- prefix = run order).
 * Rows are upserted by id; columns that do not exist locally are skipped with a warning.
 *
 *   docker compose exec api npx tsx scripts/dev-seed.ts
 */
import { readdirSync } from 'node:fs';
import { all, exec, pool } from '../src/db/pool.js';
import type { Seed } from './seed/types.js';

const files = readdirSync(new URL('./seed/', import.meta.url))
  .filter((f) => /^\d{2}-.*\.ts$/.test(f))
  .sort();

await exec('SET FOREIGN_KEY_CHECKS = 0');
for (const file of files) {
  const { seed } = (await import(`./seed/${file}`)) as { seed: Seed };
  for (const [table, rows] of seed) {
    const cols = new Set(
      (
        await all(
          'SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
          [table],
        )
      ).map((r) => String(r.c)),
    );
    if (!cols.size) {
      console.warn(`[${file}] table ${table} missing — run dev-schema-patch first`);
      continue;
    }
    for (const row of rows) {
      const entries = Object.entries(row).filter(([k]) => {
        if (!cols.has(k)) console.warn(`[${file}] ${table}.${k} missing, skipped`);
        return cols.has(k);
      });
      const names = entries.map(([k]) => `\`${k}\``).join(', ');
      const updates = entries.map(([k]) => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');
      await exec(`INSERT INTO \`${table}\` (${names}) VALUES (?) ON DUPLICATE KEY UPDATE ${updates}`, [
        entries.map(([, v]) => v),
      ]);
    }
    console.log(`[${file}] ${table}: ${rows.length} rows`);
  }
}
await exec('SET FOREIGN_KEY_CHECKS = 1');
await pool.end();
