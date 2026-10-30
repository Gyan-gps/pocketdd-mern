// App\Models\UserNotification. Collection `user_notifications`, migrated from MySQL table `user_notifications`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const userNotificationSchema = new Schema(
  {
    _id: column.int(),
    user_id: column.int(),
    title: column.string(),
    message: column.string(),
    data: column.decodedJson('string'),
    is_read: column.int({ default: '0' }),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('user_notifications', 'user_notifications'),
);
userNotificationSchema.index({ user_id: 1, created_at: -1 });

export const UserNotification = model('UserNotification', userNotificationSchema);
