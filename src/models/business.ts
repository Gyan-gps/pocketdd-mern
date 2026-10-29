// Eloquent JSON for App\Models\Business, BusinessImage, BusinessCategory/SubCategory, Location.
import { serializeDates } from '../core/time.js';
import { appUrl } from '../core/url.js';
import type { Row } from '../db/mongo.js';
import { phpJsonDecodeAssoc } from '../utils/php/values.js';
import { phpTruthy } from '../utils/php/compat.js';

/** `env('APP_URL') . '/' . $path` when the attribute is truthy (business_icon, photo_url, category_icon…). */
export const appUrlOrNull = (v: unknown): string | null => (phpTruthy(v) ? appUrl(String(v)) : null);

/**
 * Business: casts social_media_url => array, timestamps → ISO, $appends = ['business_icon'].
 * Attributes appear in row order (columns first, then attributes set by the controller).
 */
export function serializeBusiness(row: Row | Record<string, unknown>, hidden: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (hidden.includes(k)) continue;
    out[k] = k === 'social_media_url' ? phpJsonDecodeAssoc(v) : v;
  }
  const dated = serializeDates(out, ['created_at', 'updated_at'].filter((k) => k in out));
  dated.business_icon = appUrlOrNull(row.logo);
  return dated;
}

/** BusinessImage: every column + photo_url. */
export function serializeBusinessImage(row: Row): Record<string, unknown> {
  return { ...serializeDates({ ...row }), photo_url: appUrlOrNull(row.img) };
}

/** BusinessCategory/BusinessSubCategory getCategoryNameAttribute(). */
export function categoryNameAttr(name: unknown): unknown {
  if (typeof name === 'string') return name;
  if (Array.isArray(name)) return '';
  if (name && typeof name === 'object') return (name as Record<string, unknown>).en ?? '';
  // json_decode(null|number) → no 'en' offset
  return '';
}

/** Category / sub-category select rows + $appends = ['category_icon', 'category_name']. */
export function serializeCategory(row: Row): Record<string, unknown> {
  return { ...row, category_icon: appUrlOrNull(row.img), category_name: categoryNameAttr(row.name) };
}

/**
 * Location (HasTranslations, translatable location_name): the JSON shows the decoded translations
 * (non-JSON → null) and location_city = the 'en' translation ('' when missing).
 */
export function serializeLocation(row: Row): Record<string, unknown> {
  const decoded = phpJsonDecodeAssoc(row.location_name);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = k === 'location_name' ? decoded : v;
  const dated = serializeDates(out, ['created_at', 'updated_at'].filter((k) => k in out));
  let city: unknown = '';
  if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
    const t = (decoded as Record<string, unknown>).en;
    if (typeof t === 'string') city = t;
    else if (t && typeof t === 'object') city = JSON.stringify(t); // Backpack json_encodes array translations
  }
  dated.location_city = city;
  return dated;
}
