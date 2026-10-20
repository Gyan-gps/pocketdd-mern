import { all, pool } from '../../src/db/pool.js';
for (const t of process.argv.slice(2)) {
  try {
    const r = await all(`SHOW COLUMNS FROM \`${t}\``);
    console.log(t + ': ' + r.map((c: any) => `${c.Field}:${c.Type}${c.Null === 'NO' ? '!' : ''}${c.Default !== null ? '=' + c.Default : ''}`).join(', '));
  } catch (e: any) { console.log(t + ': MISSING ' + e.message.slice(0, 80)); }
}
await pool.end();
