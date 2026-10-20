// Port of App\Http\Controllers\Api\NotificationController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
// Note: this controller only READS notifications; it never sends a push (FirebaseService is not used here).
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { errorMessage, sendCatchLog, sendResponse } from '../../core/http/respond.js';
import { nowDb, toModelJson } from '../../core/time.js';
import { validate } from '../../core/validation/validator.js';
import { all, exec, first, type Row } from '../../db/pool.js';
import { bearerToken, laravelUrl, phpEmpty, phpTruthy } from '../../helpers/php-compat.js';
import { innerAdsWithBusiness } from '../../models/advertisment.js';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

/**
 * `\Laravel\Sanctum\PersonalAccessToken::findToken($token)` — raw lookup: no expiry, no tokenable check.
 * A missing bearer token is hashed as '' (PHP null → '').
 */
async function findToken(token: string | null): Promise<Row | null> {
  const t = token ?? '';
  const sep = t.indexOf('|');
  if (sep === -1) return first('SELECT * FROM personal_access_tokens WHERE token = ? LIMIT 1', [sha256(t)]);
  const instance = await first('SELECT * FROM personal_access_tokens WHERE id = ? LIMIT 1', [t.slice(0, sep)]);
  if (!instance) return null;
  return String(instance.token) === sha256(t.slice(sep + 1)) ? instance : null;
}

/**
 * `$request->user()` on these public routes uses the default `web` guard (no session in the api
 * group) and is always null, so the user comes from the bearer token via findToken().
 */
async function tokenUserId(req: Request): Promise<unknown> {
  const token = await findToken(bearerToken(req));
  return token?.tokenable_id ?? null;
}

/** Eloquent `where('user_id', $v)`: null becomes `whereNull`. */
const userWhere = (userId: unknown): [string, unknown[]] =>
  userId === null || userId === undefined ? ['user_id IS NULL', []] : ['user_id = ?', [userId]];

const LANG_MESSAGES = {
  'stateName.required': 'State is required.',
  'cityName.required': 'City is required.',
  'language.required': 'Language is required.',
  'language.in': 'Language must be either en or hi.',
};
const LANG_RULES = { stateName: 'required|string', cityName: 'required|string', language: 'required|in:en,hi' };

/** POST mark-notifications-as-read. */
export async function markAsRead(req: Request, res: Response) {
  try {
    const input = req.input;
    const v = await validate(input, { notification_id: 'required' });
    if (v.fails()) return sendResponse(false, v.first());

    const [where, params] = userWhere(input.user_id);
    const notification = await first(`SELECT * FROM user_notifications WHERE id = ? AND ${where} LIMIT 1`, [
      input.notification_id,
      ...params,
    ]);
    if (!notification) {
      res.status(404);
      return { status: false, message: 'Notification not found.' };
    }

    // $notification->update(['is_read' => 1]) — Eloquent only saves (and touches updated_at) when dirty.
    if (Number(notification.is_read) !== 1) {
      await exec('UPDATE user_notifications SET is_read = ?, updated_at = ? WHERE id = ?', [1, nowDb(), notification.id]);
    }
    return { status: true, message: 'Notification marked as read.' };
  } catch (e) {
    return sendCatchLog(errorMessage(e));
  }
}

/** `array` cast: json_decode($value, true). */
function decodeArray(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/** `$decoded[$key] ?? null` on a decoded JSON value. */
const get = (decoded: unknown, key: string): unknown =>
  decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? ((decoded as Record<string, unknown>)[key] ?? null) : null;

/** POST notifications. */
export async function sendNotification(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, LANG_RULES, LANG_MESSAGES);
    if (v.fails()) return sendResponse(false, v.first());

    const language = input.language;
    const userId = await tokenUserId(req);

    const [where, params] = userWhere(userId);
    const rows = await all(
      `SELECT id, title, message, data, is_read, created_at FROM user_notifications WHERE ${where} ORDER BY created_at DESC`,
      params,
    );
    const cutoff = nowDb(new Date(Date.now() - 48 * 3600 * 1000));

    const notifications: Record<string, unknown>[] = [];
    for (const row of rows) {
      const n: Record<string, unknown> = {
        id: row.id,
        title: row.title,
        message: row.message,
        data: decodeArray(row.data),
        is_read: row.is_read,
        created_at: toModelJson(row.created_at as string | null),
      };
      notifications.push(n);
      const originalNotificationId = row.id;
      // New = unread and created within the last 48 hours (Carbon::parse(null) is "now").
      n.is_new = Number(row.is_read) == 0 && (row.created_at === null || String(row.created_at) >= cutoff);

      const data = n.data;
      let decoded: unknown;
      if (typeof data === 'string') decoded = decodeArray(data);
      else if (data && typeof data === 'object') decoded = data;
      else decoded = [];

      const eventId = get(decoded, 'event_id');
      const advId = get(decoded, 'advertisement_id');
      const businessId = get(decoded, 'business_id');
      const type = get(decoded, 'type');

      if (phpTruthy(eventId)) {
        const event = await first('SELECT * FROM events WHERE id = ? LIMIT 1', [eventId]);
        if (event) {
          n.type = 'event';
          if (language == 'hi') {
            n.title = event.name_hi ?? null;
            n.message = event.event_description_hi ?? null;
            n.heading = '🎉 नया इवेंट';
          } else {
            n.title = event.name;
            n.message = event.short_description;
            n.heading = '🎉 New Event';
          }
          n.id = event.id;
          n.notification_id = originalNotificationId;
          n.image = !phpEmpty(event.image) ? laravelUrl(req, event.image) : null;
        }
      } else if (phpTruthy(advId)) {
        const adv = await first('SELECT * FROM advertisments WHERE id = ? LIMIT 1', [advId]);
        // Laravel quirk: `$adv->client_name` is read before the `if ($adv)` check → ErrorException.
        if (!adv) throw new Error('Attempt to read property "client_name" on null');
        const client = await first('SELECT * FROM businesses WHERE id = ? LIMIT 1', [adv.client_name]);
        n.type = 'advertisement';
        n.title = language == 'hi' ? (client?.business_name_hi ?? null) : (client?.business_name_en ?? null);
        n.message = n.title;
        n.notification_id = originalNotificationId;
        n.id = adv.id;
        if (!client) throw new Error('Attempt to read property "slug" on null');
        n.slug = client.slug;
        n.image = !phpEmpty(adv.advt_img) ? laravelUrl(req, adv.advt_img) : null;
        n.heading = language == 'hi' ? '🎉 नया विज्ञापन' : '🎉 New Advertisement';
      } else if (phpTruthy(businessId) && type == 'business_approved') {
        const business = await first('SELECT * FROM businesses WHERE id = ? LIMIT 1', [businessId]);
        if (business) {
          n.type = 'business_approved';
          n.title = language == 'hi' ? (business.business_name_hi ?? null) : (business.business_name_en ?? null);
          n.message =
            language == 'hi'
              ? 'आपका व्यवसाय सफलतापूर्वक स्वीकृत कर दिया गया है।'
              : `Congratulations! Your business "${business.business_name_en ?? ''}" has been approved successfully.`;
          n.heading = language == 'hi' ? 'व्यवसाय स्वीकृत 🎉' : 'Business Approved 🎉';
          n.notification_id = originalNotificationId;
          n.id = business.id;
          n.slug = business.slug;
          n.image = !phpEmpty(business.logo) ? laravelUrl(req, business.logo) : null;
        }
      } else if (phpTruthy(businessId)) {
        const business = await first('SELECT * FROM businesses WHERE id = ? LIMIT 1', [businessId]);
        if (business) {
          n.type = 'business';
          n.title = language == 'hi' ? (business.business_name_hi ?? null) : (business.business_name_en ?? null);
          n.message = n.title;
          n.notification_id = originalNotificationId;
          n.id = business.id;
          n.slug = business.slug;
          n.image = !phpEmpty(business.logo) ? laravelUrl(req, business.logo) : null;
          n.heading = language == 'hi' ? '🎉 नया व्यवसाय' : '🎉 New Business';
        }
      }
    }

    let advertisementData: unknown = [];
    if (input.location == 'notifications') advertisementData = await innerAdsWithBusiness(req, 'Notification');

    return sendResponse(true, 'Notification sent successfully', { data: notifications, advertisement: advertisementData });
  } catch (e) {
    console.error('error in sendNotification()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-user-notification-count. */
export async function getUserNotificationCount(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, LANG_RULES, LANG_MESSAGES);
    if (v.fails()) return sendResponse(false, v.first());

    const userId = await tokenUserId(req);
    const [where, params] = userWhere(userId);
    const total = await first(`SELECT COUNT(*) AS c FROM user_notifications WHERE ${where}`, params);
    const unread = await first(`SELECT COUNT(*) AS c FROM user_notifications WHERE ${where} AND is_read = ?`, [...params, 0]);
    const unreadCount = Number(unread?.c ?? 0);

    return sendResponse(true, 'Notification count fetched successfully.', {
      total_notifications: Number(total?.c ?? 0),
      unread_notifications: unreadCount,
      has_unread: unreadCount > 0,
    });
  } catch (e) {
    console.error('error in getUserNotificationCount()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}
