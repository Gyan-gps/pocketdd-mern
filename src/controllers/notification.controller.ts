// Port of App\Http\Controllers\Api\NotificationController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
// Note: this controller only READS notifications; it never sends a push (FirebaseService is not used here).
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { errorMessage, sendCatchLog, sendResponse } from '../core/http/response.js';
import { nowDb, toModelJson } from '../core/time.js';
import { validateRequest } from '../core/validation/validator.js';
import { type Row } from '../db/mongo.js';
import { bearerToken, laravelUrl, phpEmpty, phpTruthy } from '../utils/php/compat.js';
import { innerAdsWithBusiness } from '../services/advertisement.service.js';
import {
  countNotifications,
  findAdvertisementById,
  findBusinessById,
  findEventById,
  findNotificationById,
  findTokenByHash,
  findTokenById,
  findUserNotifications,
  markNotificationRead,
} from '../services/notification.service.js';
import { markAsReadValidation, notificationLanguageValidation } from '../validators/notification.validator.js';

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

/**
 * `\Laravel\Sanctum\PersonalAccessToken::findToken($token)` — raw lookup: no expiry, no tokenable check.
 * A missing bearer token is hashed as '' (PHP null → '').
 */
async function findToken(token: string | null): Promise<Row | null> {
  const plainToken = token ?? '';
  const separator = plainToken.indexOf('|');
  if (separator === -1) return findTokenByHash(sha256(plainToken));
  const instance = await findTokenById(plainToken.slice(0, separator));
  if (!instance) return null;
  return String(instance.token) === sha256(plainToken.slice(separator + 1)) ? instance : null;
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
const userWhere = (userId: unknown): Row => {
  if (userId === null || userId === undefined) return { user_id: null };
  const numericId = typeof userId === 'string' && userId.trim() === '' ? NaN : Number(userId);
  return { user_id: Number.isFinite(numericId) ? numericId : userId };
};

/** POST mark-notifications-as-read. */
export async function markAsRead(req: Request, res: Response) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, markAsReadValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const found = await findNotificationById(input.notification_id);
    const where = userWhere(input.user_id);
    const notification = found && (found.user_id ?? null) === where.user_id ? found : null;
    if (!notification) {
      res.status(404);
      return { status: false, message: 'Notification not found.' };
    }

    // $notification->update(['is_read' => 1]) — Eloquent only saves (and touches updated_at) when dirty.
    if (Number(notification.is_read) !== 1) {
      await markNotificationRead(notification.id, nowDb());
    }
    return { status: true, message: 'Notification marked as read.' };
  } catch (error) {
    return sendCatchLog(errorMessage(error));
  }
}

/** `array` cast: json_decode($value, true). */
function decodeArray(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * The stored `data` column is native now (a string is a decoded JSON string literal).
 */
function storedArray(raw: unknown): unknown {
  return raw ?? null;
}

/** `$decoded[$key] ?? null` on a decoded JSON value. */
const decodedValue = (decoded: unknown, key: string): unknown =>
  decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? ((decoded as Record<string, unknown>)[key] ?? null) : null;

/** POST notifications. */
export async function sendNotification(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, notificationLanguageValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const language = input.language;
    const userId = await tokenUserId(req);

    const rows = await findUserNotifications(userWhere(userId));
    const cutoff = nowDb(new Date(Date.now() - 48 * 3600 * 1000));

    const notifications: Record<string, unknown>[] = [];
    for (const row of rows) {
      const notification: Record<string, unknown> = {
        id: row.id,
        title: row.title,
        message: row.message,
        data: storedArray(row.data),
        is_read: row.is_read,
        created_at: toModelJson(row.created_at as string | null),
      };
      notifications.push(notification);
      const originalNotificationId = row.id;
      // New = unread and created within the last 48 hours (Carbon::parse(null) is "now").
      notification.is_new = Number(row.is_read) == 0 && (row.created_at === null || String(row.created_at) >= cutoff);

      const data = notification.data;
      let decoded: unknown;
      if (typeof data === 'string') decoded = decodeArray(data);
      else if (data && typeof data === 'object') decoded = data;
      else decoded = [];

      const eventId = decodedValue(decoded, 'event_id');
      const advertisementId = decodedValue(decoded, 'advertisement_id');
      const businessId = decodedValue(decoded, 'business_id');
      const type = decodedValue(decoded, 'type');

      if (phpTruthy(eventId)) {
        const event = await findEventById(eventId);
        if (event) {
          notification.type = 'event';
          if (language == 'hi') {
            notification.title = event.name_hi ?? null;
            notification.message = event.event_description_hi ?? null;
            notification.heading = '🎉 नया इवेंट';
          } else {
            notification.title = event.name;
            notification.message = event.short_description;
            notification.heading = '🎉 New Event';
          }
          notification.id = event.id;
          notification.notification_id = originalNotificationId;
          notification.image = !phpEmpty(event.image) ? laravelUrl(req, event.image) : null;
        }
      } else if (phpTruthy(advertisementId)) {
        const advertisement = await findAdvertisementById(advertisementId);
        // Laravel quirk: `$adv->client_name` is read before the `if ($adv)` check → ErrorException.
        if (!advertisement) throw new Error('Attempt to read property "client_name" on null');
        const client = await findBusinessById(advertisement.client_name);
        notification.type = 'advertisement';
        notification.title = language == 'hi' ? (client?.business_name_hi ?? null) : (client?.business_name_en ?? null);
        notification.message = notification.title;
        notification.notification_id = originalNotificationId;
        notification.id = advertisement.id;
        if (!client) throw new Error('Attempt to read property "slug" on null');
        notification.slug = client.slug;
        notification.image = !phpEmpty(advertisement.advt_img) ? laravelUrl(req, advertisement.advt_img) : null;
        notification.heading = language == 'hi' ? '🎉 नया विज्ञापन' : '🎉 New Advertisement';
      } else if (phpTruthy(businessId) && type == 'business_approved') {
        const business = await findBusinessById(businessId);
        if (business) {
          notification.type = 'business_approved';
          notification.title = language == 'hi' ? (business.business_name_hi ?? null) : (business.business_name_en ?? null);
          notification.message =
            language == 'hi'
              ? 'आपका व्यवसाय सफलतापूर्वक स्वीकृत कर दिया गया है।'
              : `Congratulations! Your business "${business.business_name_en ?? ''}" has been approved successfully.`;
          notification.heading = language == 'hi' ? 'व्यवसाय स्वीकृत 🎉' : 'Business Approved 🎉';
          notification.notification_id = originalNotificationId;
          notification.id = business.id;
          notification.slug = business.slug;
          notification.image = !phpEmpty(business.logo) ? laravelUrl(req, business.logo) : null;
        }
      } else if (phpTruthy(businessId)) {
        const business = await findBusinessById(businessId);
        if (business) {
          notification.type = 'business';
          notification.title = language == 'hi' ? (business.business_name_hi ?? null) : (business.business_name_en ?? null);
          notification.message = notification.title;
          notification.notification_id = originalNotificationId;
          notification.id = business.id;
          notification.slug = business.slug;
          notification.image = !phpEmpty(business.logo) ? laravelUrl(req, business.logo) : null;
          notification.heading = language == 'hi' ? '🎉 नया व्यवसाय' : '🎉 New Business';
        }
      }
    }

    let advertisementData: unknown = [];
    if (input.location == 'notifications') advertisementData = await innerAdsWithBusiness(req, 'Notification');

    return sendResponse(true, 'Notification sent successfully', { data: notifications, advertisement: advertisementData });
  } catch (error) {
    console.error('error in sendNotification()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-user-notification-count. */
export async function getUserNotificationCount(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, notificationLanguageValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const userId = await tokenUserId(req);
    const where = userWhere(userId);
    const total = await countNotifications(where);
    const unreadCount = await countNotifications({ ...where, is_read: 0 });

    return sendResponse(true, 'Notification count fetched successfully.', {
      total_notifications: total,
      unread_notifications: unreadCount,
      has_unread: unreadCount > 0,
    });
  } catch (error) {
    console.error('error in getUserNotificationCount()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}
