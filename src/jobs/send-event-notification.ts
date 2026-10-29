// Port of App\Jobs\SendEventNotification.
import { nowDb } from '../core/time.js';
import { FirebaseService } from '../services/firebase.js';
import { errorContext, find, insertNotifications, jobUrl, phpJsonEncode, usersWithToken } from './job-helpers.js';
import { Log } from '../core/logging/log.js';

const phpEmpty = (v: unknown) =>
  v === null || v === undefined || v === false || v === 0 || v === '' || v === '0' || (Array.isArray(v) && !v.length);

export async function SendEventNotification(
  eventId: unknown,
  _state: unknown,
  _district: unknown,
  eventName: unknown,
  shortDescription: unknown,
): Promise<void> {
  const eventData = await find('events', eventId);
  if (!eventData) {
    Log.warning('Event not found.', { event_id: eventId });
    return;
  }

  const users = await usersWithToken();

  if (users.length > 0) {
    try {
      const firebase = new FirebaseService();
      const tokens = users.map((u) => u.fcm_token);
      const title = '🎉 New Event';
      // Laravel quirk: $message stays null when the name is null and there is no description.
      let message = eventName as string | null;
      if (!phpEmpty(shortDescription)) message = String(message ?? '') + ' - ' + String(shortDescription);

      const imageUrl = eventData.image ? jobUrl('uploads/event_images/' + eventData.image) : null;
      const payload = { event_id: String(eventData.id), type: 'event_created' };

      const response = await firebase.sendToMultipleDevices(tokens, title, message as string, payload, imageUrl);
      Log.info('Firebase API Response: ', response);

      Log.info('Preparing database notifications array...');
      const notifications = users.map((user) => ({
        user_id: user.id,
        title,
        message: message as string,
        // Laravel quirk: raw dispatched id, no type key.
        data: phpJsonEncode({ event_id: eventId }),
        created_at: nowDb(),
        updated_at: nowDb(),
      }));
      await insertNotifications(notifications);
      Log.info('Event notifications saved.', { count: notifications.length });
    } catch (e) {
      Log.error('SendEventNotification Failed.', { event_id: eventId, ...errorContext(e) });
      throw e;
    }
  } else {
    Log.info('Skipping Firebase/DB logic because user count is 0.');
  }

  Log.info('--- Job Completed: SendEventNotification for Event ID: ' + String(eventId ?? '') + ' ---');
}
