// Admin API (auth + Department CRUD) against the running server + seeded fixtures (scripts/seed/07-admin-auth.ts).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { exec, first, pool } from '../src/db/pool.js';
import { ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD } from '../scripts/seed/07-admin-auth.js';

const BASE = process.env.NODE_URL ?? 'http://localhost:4000';
let token = '';

async function api(method: string, path: string, body?: unknown, auth = true) {
  const res = await fetch(`${BASE}/api/admin${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* plain text */
  }
  return { status: res.status, json: json as Record<string, any> };
}

before(async () => {
  await exec("DELETE FROM departments WHERE department_name LIKE 'Parity %'");
});
after(async () => {
  await exec("DELETE FROM departments WHERE department_name LIKE 'Parity %'");
  await exec("DELETE FROM personal_access_tokens WHERE tokenable_id = 800 AND name = 'admin-panel'");
  await pool.end();
});

describe('admin auth', () => {
  it('rejects wrong password with auth.failed (no lang files in the Laravel app)', async () => {
    const r = await api('POST', '/auth/login', { email: ADMIN_TEST_EMAIL, password: 'nope' }, false);
    assert.equal(r.status, 422);
    assert.equal(r.json.message, 'auth.failed');
  });
  it('requires auth for CRUD routes (Unauthorized. / 401)', async () => {
    const r = await api('GET', '/department', undefined, false);
    assert.equal(r.status, 401);
    assert.equal(r.json, 'Unauthorized.');
  });
  it('logs in and returns the user without password', async () => {
    const r = await api('POST', '/auth/login', { email: ADMIN_TEST_EMAIL, password: ADMIN_TEST_PASSWORD }, false);
    assert.equal(r.status, 200);
    assert.match(r.json.token, /^\d+\|[A-Za-z0-9]{48}$/);
    assert.equal(r.json.user.email, ADMIN_TEST_EMAIL);
    assert.ok(!('password' in r.json.user));
    token = r.json.token;
    assert.equal((await api('GET', '/auth/me')).json.id, 800);
  });
});

describe('department CRUD (DepartmentCrudController)', () => {
  it('lists ordered by department_name asc with search + pagination', async () => {
    const r = await api('GET', '/department?search=e&length=25');
    assert.equal(r.status, 200);
    const names = r.json.data.map((d: any) => d.department_name);
    assert.deepEqual(names, [...names].sort((a: string, b: string) => a.localeCompare(b)));
    const s = await api('GET', '/department?search=Brigade');
    assert.deepEqual(s.json.data.map((d: any) => d.id), [801]);
  });
  it('create validation: custom required messages (DepartmentRequest)', async () => {
    const r = await api('POST', '/department', { department_name_hi: 'कुछ' });
    assert.equal(r.status, 422);
    assert.equal(r.json.message, 'Please enter the department name (English)');
  });
  it('create validation: unique', async () => {
    const r = await api('POST', '/department', { department_name: 'Police Department', department_name_hi: 'नया' });
    assert.equal(r.json.message, 'The department name (English) already exists');
  });
  it('creates with only declared fields; blank slug → NULL; checkbox → 0/1', async () => {
    const r = await api('POST', '/department', {
      department_name: 'Parity Health',
      department_name_hi: 'स्वास्थ्य',
      slug: '',
      status: '1',
      designation_id: 'ignored',
    });
    assert.equal(r.status, 201);
    const row = await first('SELECT * FROM departments WHERE id = ?', [r.json.id]);
    assert.equal(row!.slug, null);
    assert.equal(row!.status, 1);
    assert.equal(row!.designation_id, null);
    assert.match(String(row!.created_at), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
  it('update rules: min:5 (raw key, as Laravel returns it here)', async () => {
    const r = await api('PUT', '/department/800', { department_name: 'Pol', department_name_hi: 'पुलिस विभाग' });
    assert.equal(r.status, 422);
    assert.equal(r.json.message, 'validation.min.string');
  });
  it('updates only dirty columns and keeps updated_at when nothing changed', async () => {
    const before = await first('SELECT updated_at FROM departments WHERE id = 801');
    const same = await api('PUT', '/department/801', {
      department_name: 'Fire Brigade',
      department_name_hi: 'अग्निशमन',
      slug: 'firebrigade',
      status: '0',
    });
    assert.equal(same.status, 200);
    assert.equal((await first('SELECT updated_at FROM departments WHERE id = 801'))!.updated_at, before!.updated_at);
  });
  it('has no delete operation', async () => {
    assert.equal((await api('DELETE', '/department/801')).status, 404);
  });
});
