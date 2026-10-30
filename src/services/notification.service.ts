// Queries used by the notification endpoints (Api\NotificationController).
import { toRow, toRows, type Row } from '../db/mongo.js';
import { Advertisement } from '../models/advertisement.model.js';
import { Business } from '../models/business.model.js';
import { Event } from '../models/event.model.js';
import { PersonalAccessToken } from '../models/personal-access-token.model.js';
import { UserNotification } from '../models/user-notification.model.js';
import type { AnyModel } from '../models/index.js';

/** `WHERE id = ? LIMIT 1` — MySQL compared '5' with 5 numerically. */
async function findById(model: AnyModel, id: unknown): Promise<Row | null> {
  const numericId = typeof id === 'string' && id.trim() === '' ? NaN : Number(id);
  if (id === null || id === undefined || !Number.isFinite(numericId)) return null;
  return toRow(await model.findOne({ _id: numericId }).lean<Row>());
}

export async function findTokenByHash(hashedToken: string): Promise<Row | null> {
  return toRow(await PersonalAccessToken.findOne({ token: hashedToken }).lean<Row>());
}

export const findTokenById = (tokenId: unknown) => findById(PersonalAccessToken, tokenId);
export const findNotificationById = (notificationId: unknown) => findById(UserNotification, notificationId);
export const findEventById = (eventId: unknown) => findById(Event, eventId);
export const findAdvertisementById = (advertisementId: unknown) => findById(Advertisement, advertisementId);
export const findBusinessById = (businessId: unknown) => findById(Business, businessId);

/** `$notification->update(['is_read' => 1])`. */
export function markNotificationRead(notificationId: unknown, updatedAt: string) {
  return UserNotification.updateOne({ _id: notificationId }, { $set: { is_read: 1, updated_at: updatedAt } });
}

/** A user's notifications, newest first. */
export async function findUserNotifications(userWhere: Row): Promise<Row[]> {
  return toRows(
    await UserNotification.find(
      userWhere,
      { title: 1, message: 1, data: 1, is_read: 1, created_at: 1 },
      { sort: { created_at: -1, _id: 1 } },
    ).lean<Row[]>(),
  );
}

export const countNotifications = (filter: Row) => UserNotification.countDocuments(filter);
