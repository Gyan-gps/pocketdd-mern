import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { after, describe, it } from 'node:test';
import { pool } from '../src/db/pool.js';
import { hashCheck, hashMake } from '../src/core/auth/hash.js';
import { strRandom } from '../src/core/auth/sanctum.js';
import { sendCatchLog, sendResponse } from '../src/core/http/respond.js';
import { nowDb, toModelJson } from '../src/core/time.js';
import { validate } from '../src/core/validation/validator.js';

describe('respond (ApiBaseController)', () => {
  it('omits empty data and merges the rest after status/message', () => {
    assert.deepEqual(sendResponse(true, 'ok'), { status: true, message: 'ok' });
    assert.deepEqual(Object.keys(sendResponse(true, 'ok', { states: [] })), ['status', 'message', 'states']);
  });
  it('catch log payload', () => {
    assert.deepEqual(sendCatchLog('boom'), {
      status: false,
      message: 'Some error occurred.Please Try again later',
      error: 'boom',
    });
  });
});

describe('validator (messages via language_lines; empty → raw key like Laravel)', () => {
  it('uses custom messages and stops at required', async () => {
    const v = await validate({}, { phone: 'required|digits:10' }, { 'phone.required': 'Phone number is required.' });
    assert.equal(v.first(), 'Phone number is required.');
  });
  it('falls back to the translation key', async () => {
    assert.equal((await validate({}, { client_otp: 'required' })).first(), 'validation.required');
    assert.equal((await validate({}, { cityName: 'required' })).first(), 'validation.required');
    assert.equal((await validate({ phone: '123' }, { phone: 'required|digits:10' })).first(),
      'validation.digits');
    assert.equal((await validate({ language: 'fr' }, { language: 'required|in:en,hi' })).first(),
      'validation.in');
    assert.equal((await validate({ state: 5 }, { state: 'required|string' })).first(),
      'validation.string');
    assert.equal((await validate({ ad_ids: 'x' }, { ad_ids: 'required|array' })).first(),
      'validation.array');
  });
  it('first error follows rule declaration order', async () => {
    const v = await validate({ phone: '9999999999' }, { phone: 'required|digits:10', client_otp: 'required', x: 'required' });
    assert.equal(v.first(), 'validation.required');
  });
  it('digits accepts numbers, rejects non-digits', async () => {
    assert.ok(!(await validate({ phone: 9876543210 }, { phone: 'digits:10' })).fails());
    assert.ok((await validate({ phone: '98765abcd0' }, { phone: 'digits:10' })).fails());
  });
  it('skips non-implicit rules for absent fields; nullable allows null', async () => {
    assert.ok(!(await validate({}, { name: 'string|max:5' })).fails());
    assert.ok(!(await validate({ name: null }, { name: 'nullable|string' })).fails());
    assert.ok((await validate({ name: null }, { name: 'string' })).fails());
  });
  it('max/min messages pick the size kind', async () => {
    assert.equal((await validate({ n: 'abcdef' }, { n: 'string|max:5' })).first(),
      'validation.max.string');
    assert.equal((await validate({ n: '9' }, { n: 'numeric|max:5' })).first(),
      'validation.max.numeric');
  });
});

describe('time', () => {
  it('serializes IST DB strings like Eloquent', () => {
    assert.equal(toModelJson('2025-06-19 10:30:00'), '2025-06-19T05:00:00.000000Z');
    assert.equal(toModelJson('2025-06-19 02:00:00'), '2025-06-18T20:30:00.000000Z');
    assert.equal(toModelJson(null), null);
  });
  it('nowDb is IST', () => {
    assert.equal(nowDb(new Date('2026-01-01T00:00:00Z')), '2026-01-01 05:30:00');
  });
});

describe('sanctum / hash', () => {
  it('Str::random is alphanumeric with the right length', () => {
    assert.match(strRandom(40), /^[A-Za-z0-9]{40}$/);
  });
  it('crc32b matches PHP hash("crc32b")', () => {
    // php -r 'echo hash("crc32b", "The quick brown fox jumped over the lazy dog.");' → 82a34642
    assert.equal(zlib.crc32('The quick brown fox jumped over the lazy dog.').toString(16).padStart(8, '0'), '82a34642');
  });
  it('bcrypt hashes use $2y$ and verify both ways', async () => {
    const h = await hashMake('9876543210');
    assert.match(h, /^\$2y\$12\$/);
    assert.ok(await hashCheck('9876543210', h));
    assert.ok(!(await hashCheck('nope', h)));
  });
});

// The validator looks messages up in `language_lines`, which opens the pool.
after(() => pool.end());
