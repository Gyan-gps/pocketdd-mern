import type { Row } from '../db/mongo.js';
import { serializeDates } from '../core/time.js';

// App\Models\User: $hidden = password, remember_token; casts email_verified_at => datetime.
const HIDDEN = ['password', 'remember_token'];

export function serializeUser(row: Row): Record<string, unknown> {
  const out = Object.fromEntries(Object.entries(row).filter(([k]) => !HIDDEN.includes(k)));
  return serializeDates(out, ['email_verified_at', 'created_at', 'updated_at']);
}

/** A full `users` row in column order, NULL for every column not given (what SELECT * returned after an INSERT). */
export function newUserRow(values: Row): Row {
  const cols = [
    'name', 'email', 'phone', 'email_verified_at', 'password', 'status', 'remember_token', 'created_at', 'updated_at',
    'fcm_token', 'user_icon', 'is_mobile_user', 'state', 'district', 'address_line', 'street_address', 'about_us',
    'tehsil', 'pincode', 'post_address', 'is_business_owner',
  ];
  return Object.fromEntries(cols.map((c) => [c, values[c] ?? null]));
}
