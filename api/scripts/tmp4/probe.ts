import { createToken } from '../../src/core/auth/sanctum.js';
import { exec, pool } from '../../src/db/pool.js';
const [uid, path, body, base] = process.argv.slice(2);
const t = await createToken(Number(uid), 'parity');
const r = await fetch((base ?? 'http://laravel.test') + path, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: body ?? '{}' });
console.log(r.status, await r.text());
await exec("DELETE FROM personal_access_tokens WHERE name = 'parity'");
await pool.end();
