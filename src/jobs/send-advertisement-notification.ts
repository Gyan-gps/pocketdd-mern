// Port of App\Jobs\SendAdvertisementNotification.
import { nowDb } from '../core/time.js';
import { FirebaseService } from '../services/firebase.js';
import { errorContext, find, insertNotifications, jobUrl, phpJsonEncode, usersWithToken } from './job-helpers.js';
import { Log } from '../core/logging/log.js';

export async function SendAdvertisementNotification(advertisementId: unknown, businessId: unknown): Promise<void> {
  try {
    const advertisement = await find('advertisments', advertisementId);
    const business = await find('businesses', businessId);

    if (!advertisement || !business) {
      Log.warning('Advertisement or Business not found.', {
        advertisement_id: advertisementId,
        business_id: businessId,
      });
      return;
    }

    const users = await usersWithToken();

    if (users.length > 0) {
      const firebase = new FirebaseService();
      const tokens = users.map((u) => u.fcm_token);

      const title = '📢 New Advertisement';
      // sprintf('%s', null) → ''
      const message = `${business.business_name_en ?? ''} has published a new advertisement. Check it out now!`;

      const imageUrl = advertisement.advt_img ? jobUrl('uploads/adv_images/' + advertisement.advt_img) : null;

      const payload = {
        advertisement_id: String(advertisement.id),
        business_id: String(business.id),
        type: 'advertisement_created',
      };

      const response = await firebase.sendToMultipleDevices(tokens, title, message, payload, imageUrl);

      Log.info('Advertisement Notification Response', { advertisement_id: advertisement.id, response });

      const notifications = users.map((user) => ({
        user_id: user.id,
        title,
        message,
        data: phpJsonEncode({
          advertisement_id: advertisement.id,
          business_id: business.id,
          type: 'advertisement_created',
        }),
        created_at: nowDb(),
        updated_at: nowDb(),
      }));

      await insertNotifications(notifications);
    }
  } catch (e) {
    // Laravel quirk: the log message names the wrong job.
    Log.error('Job SendBusinessCreatedNotification Failed.', {
      advertisement_id: advertisementId,
      business_id: businessId,
      ...errorContext(e),
    });
    throw e;
  }
}
