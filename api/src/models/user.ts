import type { Row } from '../db/pool.js';
import { serializeDates } from '../core/time.js';

// App\Models\User: $hidden = password, remember_token; casts email_verified_at => datetime.
const HIDDEN = ['password', 'remember_token'];

export function serializeUser(row: Row): Record<string, unknown> {
  const out = Object.fromEntries(Object.entries(row).filter(([k]) => !HIDDEN.includes(k)));
  return serializeDates(out, ['email_verified_at', 'created_at', 'updated_at']);
}
