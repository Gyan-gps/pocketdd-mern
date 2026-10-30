/**
 * Parity harness: sends every case to Laravel and to the Node API, then diffs HTTP status + JSON
 * (values, and key order of objects).
 * Laravel uses MySQL, Node uses MongoDB. Fixtures are written to MySQL, then copied to MongoDB
 * (scripts/migrate-from-mysql.ts) before every Node request, so both answer from the same data.
 * Run the API against the test database: MONGODB_URI=$MONGODB_URI_TEST (see README).
 *
 *   docker compose exec api npx tsx test/parity/run.ts [fileFilter]
 */
import { readdirSync } from 'node:fs';
import { createToken } from '../support/mysql-token.js';
import { migrate } from '../../scripts/migrate-from-mysql.js';
import { closeMongo } from '../../scripts/lib/raw-collections.js';
import { exec, first, pool } from '../../src/db/mysql.js';
import type { ParityCase } from './types.js';

const LARAVEL = process.env.LARAVEL_URL ?? 'http://localhost';
const NODE = process.env.NODE_URL ?? 'http://localhost:4000';
const filter = process.argv[2];

const ROOTS = [LARAVEL, NODE, 'http://localhost'];

/** url()/APP_URL produce different hosts per app; replace them so only real differences remain. */
function normalize(v: unknown): unknown {
  if (typeof v === 'string') {
    for (const r of ROOTS) {
      if (v === r) return 'HOST'; // url('') → bare root
      if (v.startsWith(`${r}/`)) return `HOST/${v.slice(r.length + 1)}`;
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalize(x)]));
  }
  return v;
}

function maskVolatile(v: unknown, patterns: RegExp[], prefix = ''): unknown {
  if (v && typeof v === 'object') {
    const entries = Object.entries(v).map(([k, x]) => {
      const p = prefix ? `${prefix}.${k}` : k;
      const hit = patterns.some((re) => re.test(p));
      return [k, hit ? `<${x === null ? 'null' : typeof x}>` : maskVolatile(x, patterns, p)] as const;
    });
    return Array.isArray(v) ? entries.map(([, x]) => x) : Object.fromEntries(entries);
  }
  return v;
}

const toRegex = (path: string) =>
  new RegExp(`^${path.split('.').map((s) => (s === '*' ? '[^.]+' : s.replace(/[$^()[\]{}+?|\\]/g, '\\$&'))).join('\\.')}$`);

function diff(a: unknown, b: unknown, path = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const here = path || '<root>';
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    const out: string[] = [];
    if (!Array.isArray(a) && ka.join() !== kb.join() && [...ka].sort().join() === [...kb].sort().join()) {
      out.push(`${here}: key order laravel=[${ka}] node=[${kb}]`);
    }
    for (const k of new Set([...ka, ...kb])) {
      out.push(
        ...diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k),
      );
    }
    return out;
  }
  return [`${here}: laravel=${JSON.stringify(a)} node=${JSON.stringify(b)}`];
}

async function call(base: string, c: ParityCase, token?: string) {
  const headers: Record<string, string> = { Accept: 'application/json', ...c.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | FormData | undefined;
  if (c.method !== 'GET' && c.files) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(c.body ?? {})) {
      if (Array.isArray(v)) v.forEach((x) => fd.append(`${k}[]`, String(x)));
      else if (v !== undefined) fd.append(k, v === null ? '' : String(v));
    }
    for (const [k, f] of Object.entries(c.files)) fd.append(k, new Blob([f.content], { type: f.type }), f.name);
    body = fd; // fetch sets the multipart Content-Type boundary
  } else if (c.method !== 'GET' && c.body) {
    if (c.as === 'form') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(c.body)) {
        if (Array.isArray(v)) v.forEach((x) => p.append(`${k}[]`, String(x)));
        else if (v !== undefined) p.append(k, v === null ? '' : String(v));
      }
      body = p.toString();
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(c.body);
    }
  }
  const res = await fetch(base + c.path, { method: c.method ?? 'POST', headers, body });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { __non_json__: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

async function freshToken(): Promise<string> {
  const u = await first('SELECT id FROM users ORDER BY id LIMIT 1');
  return createToken(Number(u!.id), 'parity');
}

const files = readdirSync(new URL('./cases/', import.meta.url))
  .filter((f) => f.endsWith('.ts') && (!filter || f.includes(filter)))
  .sort();

let pass = 0;
let fail = 0;
for (const file of files) {
  const { cases } = (await import(`./cases/${file}`)) as { cases: ParityCase[] };
  console.log(`\n=== ${file}`);
  for (const c of cases) {
    await c.before?.();
    const l = await call(LARAVEL, c, c.token === '$TOKEN' ? await freshToken() : c.token);
    await c.before?.();
    const nodeToken = c.token === '$TOKEN' ? await freshToken() : c.token;
    await migrate({ refresh: true });
    const n = await call(NODE, c, nodeToken);
    // APP_DEBUG-only exception details (file/line/trace) are never reproduced by Node.
    if (l.status === 500 && l.json && typeof l.json === 'object') {
      for (const k of ['file', 'line', 'trace']) delete (l.json as Record<string, unknown>)[k];
    }
    const patterns = (c.volatile ?? []).map(toRegex);
    const lj = maskVolatile(normalize(l.json), patterns);
    const nj = maskVolatile(normalize(n.json), patterns);
    const d = [...(l.status !== n.status ? [`HTTP laravel=${l.status} node=${n.status}`] : []), ...diff(lj, nj)];
    if (d.length) {
      fail++;
      console.log(`  ✗ ${c.name}\n${d.slice(0, 12).map((x) => `      ${x}`).join('\n')}`);
    } else {
      pass++;
      console.log(`  ✓ ${c.name}`);
    }
  }
}
await exec("DELETE FROM personal_access_tokens WHERE name = 'parity'");
console.log(`\n${pass} passed, ${fail} failed`);
await pool.end();
await closeMongo();
process.exit(fail ? 1 : 0);
