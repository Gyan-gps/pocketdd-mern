// Port of App\Jobs\SendBusinessApproveNotification.
import { insertRow } from '../db/mongo.js';
import { UserNotification } from '../models/index.js';
import { nowDb } from '../core/time.js';
import { FirebaseService } from '../services/firebase.service.js';
import { decodeOnce, errorContext, find, phpJsonEncode } from './job-helpers.js';
import { Log } from '../core/logging/log.js';

const phpEmpty = (value: unknown) => value === null || value === undefined || value === '' || value === '0';

export async function SendBusinessApproveNotification(businessId: unknown): Promise<void> {
  try {
    Log.info('--- Job Started: SendBusinessApproveNotification for Business ID: ' + String(businessId ?? '') + ' ---');
    const business = await find('businesses', businessId);
    if (!business) return;

    const user = await find('users', business.user_id);
    Log.info(
      'Fetching business details for User ID: ' + String(business.user_id ?? '') + ' and Business ID: ' + String(businessId ?? ''),
    );
    if (!user) return;

    const title = 'Business Approved 🎉';
    const message =
      'Congratulations! Your business "' + (business.business_name_en ?? '') + '" has been approved successfully.';

    if (!phpEmpty(user.fcm_token)) {
      const firebase = new FirebaseService();
      const response = await firebase.sendToMultipleDevices([user.fcm_token], title, message, {
        business_id: String(business.id),
        type: 'business_approved',
      });
      Log.info('Firebase API Response of Business Approval: ', response);
    }

    // UserNotification::create(): `data` is json_encode()d here AND by the model's 'array' cast.
    // Laravel quirk: the stored value is a double-encoded JSON string.
    const now = nowDb();
    await insertRow(UserNotification.collection.collectionName, {
      user_id: user.id,
      title,
      message,
      data: decodeOnce(phpJsonEncode(phpJsonEncode({ business_id: business.id, type: 'business_approved' }))),
      is_read: 0,
      updated_at: now,
      created_at: now,
    });
    Log.info('Database notifications inserted successfully for Business ID: ' + String(businessId ?? ''));
  } catch (error) {
    Log.error('Job SendBusinessApproveNotification Failed.', { business_id: businessId, ...errorContext(error) });
    throw error;
  }
}
