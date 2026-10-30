// Parity tests: Laravel reads tokens from MySQL, so tokens are created there and reach MongoDB through
// the per-request re-sync in test/parity/run.ts (same id and hash on both sides).
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { strRandom, USER_MORPH } from '../../src/core/auth/access-tokens.js';
import { nowDb } from '../../src/core/time.js';
import { exec } from '../../src/db/mysql.js';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export async function createToken(tokenableId: number, name: string, tokenableType = USER_MORPH): Promise<string> {
  const entropy = strRandom(40);
  const plain = entropy + zlib.crc32(entropy).toString(16).padStart(8, '0');
  const now = nowDb();
  const res = await exec(
    `INSERT INTO personal_access_tokens
      (tokenable_type, tokenable_id, name, token, abilities, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    [tokenableType, tokenableId, name, sha256(plain), '["*"]', now, now],
  );
  return `${res.insertId}|${plain}`;
}
