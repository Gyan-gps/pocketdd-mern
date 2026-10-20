// Port of App\Jobs\SendBusinessCreatedNotification.
import { all } from '../db/pool.js';
import { nowDb } from '../core/time.js';
import { FirebaseService } from '../services/firebase.js';
import { errorContext, find, insertNotifications, jobUrl, phpJsonEncode } from './common.js';
import { Log } from './log.js';

/** PHP truthiness for `if ($this->excludeUserId)`. */
const truthy = (v: unknown) => !(v === null || v === undefined || v === false || v === 0 || v === '' || v === '0');

export async function SendBusinessCreatedNotification(
  businessId: unknown,
  _notificationData: Record<string, unknown>,
  excludeUserId: unknown = null,
): Promise<void> {
  try {
    const businessData = await find('businesses', businessId);
    if (!businessData) {
      Log.warning('Business not found.', { business_id: businessId });
      return;
    }

    let sql = 'SELECT * FROM `users` WHERE `fcm_token` IS NOT NULL';
    const params: unknown[] = [];
    if (truthy(excludeUserId)) {
      sql += ' AND `id` != ?';
      params.push(excludeUserId);
    }
    const users = await all(sql, params);

    if (users.length > 0) {
      const firebase = new FirebaseService();
      const tokens = users.map((u) => u.fcm_token);
      const title = '🎉 New Business Added';
      const message = `${businessData.business_name_en ?? ''} has joined PocketDD. Explore the business now!`;
      const imageUrl = businessData.logo ? jobUrl(businessData.logo) : null;
      const payload = { business_id: String(businessData.id), type: 'business_created' };

      const response = await firebase.sendToMultipleDevices(tokens, title, message, payload, imageUrl);
      Log.info('Business Notification Sent', { business_id: businessData.id, response });

      const now = nowDb();
      const notifications = users.map((user) => ({
        user_id: user.id,
        title,
        message,
        // Laravel quirk: uses the raw dispatched id (keeps its PHP type, e.g. "12" vs 12), not $businessData->id.
        data: phpJsonEncode({ business_id: businessId, type: 'business_created' }),
        created_at: now,
        updated_at: now,
      }));
      await insertNotifications(notifications);
      Log.info('Business notifications saved.', { count: notifications.length });
    }
  } catch (e) {
    Log.error('Job SendBusinessCreatedNotification Failed.', { business_id: businessId, ...errorContext(e) });
    throw e;
  }
}
