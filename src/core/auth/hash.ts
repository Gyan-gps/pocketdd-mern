import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';

/** `Hash::make()` — bcrypt with PHP's `$2y$` prefix so Laravel can still verify it. */
export async function hashMake(value: string): Promise<string> {
  const hash = await bcrypt.hash(value, env.bcryptRounds);
  return hash.replace(/^\$2[ab]\$/, '$2y$');
}

/** `Hash::check()` — accepts `$2y$` hashes written by Laravel. */
export async function hashCheck(value: string, hashed: string | null | undefined): Promise<boolean> {
  if (!hashed) return false;
  return bcrypt.compare(value, hashed.replace(/^\$2y\$/, '$2b$'));
}
