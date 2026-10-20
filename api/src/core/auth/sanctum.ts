import crypto from 'node:crypto';
import zlib from 'node:zlib';
import type { RequestHandler } from 'express';
import { exec, first, type Row } from '../../db/pool.js';
import { nowDb } from '../time.js';

export const USER_MORPH = 'App\\Models\\User';

// Morph class → table for tokenable models.
const TOKENABLE_TABLES: Record<string, string> = {
  [USER_MORPH]: 'users',
};

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Laravel `Str::random()`. */
export function strRandom(length: number): string {
  let out = '';
  while (out.length < length) out += ALNUM[crypto.randomInt(ALNUM.length)];
  return out;
}

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

/** `$user->createToken($name)->plainTextToken` (Sanctum 4: 40 random chars + crc32b, prefix ''). */
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

/** `$user->tokens()->delete()`. */
export async function deleteAllTokens(tokenableId: number, tokenableType = USER_MORPH): Promise<void> {
  await exec('DELETE FROM personal_access_tokens WHERE tokenable_type = ? AND tokenable_id = ?', [
    tokenableType,
    tokenableId,
  ]);
}

/** Resolve a bearer token to its user row (Sanctum `PersonalAccessToken::findToken` + guard checks). */
export async function userFromToken(raw: string): Promise<{ user: Row; tokenableType: string } | null> {
  const sep = raw.indexOf('|');
  const token =
    sep === -1
      ? await first('SELECT * FROM personal_access_tokens WHERE token = ? LIMIT 1', [sha256(raw)])
      : await first('SELECT * FROM personal_access_tokens WHERE id = ? LIMIT 1', [raw.slice(0, sep)]);
  if (!token) return null;
  if (sep !== -1) {
    const expected = Buffer.from(String(token.token));
    const given = Buffer.from(sha256(raw.slice(sep + 1)));
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  }
  if (token.expires_at && String(token.expires_at) <= nowDb()) return null;

  const table = TOKENABLE_TABLES[String(token.tokenable_type)];
  if (!table) return null;
  const user = await first(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [token.tokenable_id]);
  if (!user) return null;

  await exec('UPDATE personal_access_tokens SET last_used_at = ?, updated_at = ? WHERE id = ?', [
    nowDb(),
    nowDb(),
    token.id,
  ]);
  return { user, tokenableType: String(token.tokenable_type) };
}

/** `auth:sanctum` — unauthenticated requests get HTTP 200 (bootstrap/app.php exception renderer). */
export const sanctum: RequestHandler = async (req, res, next) => {
  try {
    const header = req.get('authorization') ?? '';
    const raw = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
    const auth = raw ? await userFromToken(raw) : null;
    if (!auth) {
      res.status(200).json({ message: 'Unauthentic user', status: false });
      return;
    }
    req.user = auth.user;
    req.tokenableType = auth.tokenableType;
    next();
  } catch (e) {
    next(e);
  }
};
