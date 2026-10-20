import { all, pool } from '../../src/db/pool.js';
for (const s of process.argv.slice(2)) console.log(JSON.stringify(await all(s)));
await pool.end();
