import crypto from 'node:crypto';
import zlib from 'node:zlib';
import type { RequestHandler } from 'express';
import { C, TABLE_COLLECTION, col, insertRow, intId, toRow, type Row } from '../../db/mongo.js';
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
  const id = await insertRow(C.tokens, {
    tokenable_type: tokenableType,
    tokenable_id: tokenableId,
    name,
    token: sha256(plain),
    abilities: ['*'],
    last_used_at: null,
    expires_at: null,
    created_at: now,
    updated_at: now,
  });
  return `${id}|${plain}`;
}

/** `$user->tokens()->delete()`. */
export async function deleteAllTokens(tokenableId: number, tokenableType = USER_MORPH): Promise<void> {
  await col(C.tokens).deleteMany({ tokenable_type: tokenableType, tokenable_id: tokenableId });
}

/** Resolve a bearer token to its user row (Sanctum `PersonalAccessToken::findToken` + guard checks). */
export async function userFromToken(raw: string): Promise<{ user: Row; tokenableType: string } | null> {
  const sep = raw.indexOf('|');
  const token = toRow(
    sep === -1
      ? await col(C.tokens).findOne({ token: sha256(raw) })
      : await col(C.tokens).findOne({ _id: intId(raw.slice(0, sep)) } as never),
  );
  if (!token) return null;
  if (sep !== -1) {
    const expected = Buffer.from(String(token.token));
    const given = Buffer.from(sha256(raw.slice(sep + 1)));
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  }
  if (token.expires_at && String(token.expires_at) <= nowDb()) return null;

  const table = TOKENABLE_TABLES[String(token.tokenable_type)];
  if (!table) return null;
  const user = toRow(await col(TABLE_COLLECTION[table]!).findOne({ _id: token.tokenable_id } as never));
  if (!user) return null;

  await col(C.tokens).updateOne({ _id: token.id } as never, { $set: { last_used_at: nowDb(), updated_at: nowDb() } });
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
