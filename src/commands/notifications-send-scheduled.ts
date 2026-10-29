// Port of App\Console\Commands\SendScheduledNotifications (`notifications:send-scheduled`).
import { C, col, toRow } from '../db/mongo.js';
import { nowDb } from '../core/time.js';
import { dispatchJob } from '../jobs/queue.js';
import { errorContext } from '../jobs/job-helpers.js';
import { Log } from '../core/logging/log.js';
import { type CommandIO, FAILURE, SUCCESS } from './command-io.js';

/** whereDate('from_date', today): the stored "YYYY-MM-DD[ HH:MM:SS]" string starts with the date. */
const onDate = (today: string) => ({ from_date: { $regex: `^${today}` } });

/** Model::whereDate(...)->chunkById(100, fn) */
async function chunkById(collection: string, today: string, fn: (rows: Record<string, any>[]) => Promise<void>) {
  let lastId: number | null = null;
  for (;;) {
    const docs = await col(collection)
      .find(lastId === null ? onDate(today) : { ...onDate(today), _id: { $gt: lastId } as never })
      .sort({ _id: 1 })
      .limit(100)
      .toArray();
    const rows: Record<string, any>[] = docs.map((d) => toRow(d)!);
    if (!rows.length) break;
    await fn(rows);
    if (rows.length < 100) break;
    lastId = rows[rows.length - 1]!.id;
  }
}

export async function notificationsSendScheduled(io: CommandIO): Promise<number> {
  Log.info('SendScheduledNotifications Cron Started', { date: nowDb().slice(0, 10) });
  try {
    const today = nowDb().slice(0, 10);
    let adCount = 0;
    let businessCount = 0;

    const totalAds = await col(C.advertisements).countDocuments(onDate(today));
    io.info(`Found ${totalAds} advertisements to notify.`);
    const totalBusinesses = await col(C.businesses).countDocuments(onDate(today));
    io.info(`Found ${totalBusinesses} businesses to notify.`);

    io.info('Starting scheduled notification dispatch for: ' + today);

    await chunkById(C.advertisements, today, async (ads) => {
      for (const ad of ads) {
        // client_name stores the business id
        await dispatchJob('SendAdvertisementNotification', ad.id, ad.client_name);
        adCount++;
      }
    });
    io.info(`Successfully dispatched ${adCount} advertisement notifications.`);

    await chunkById(C.businesses, today, async (businesses) => {
      for (const b of businesses) {
        const notificationData = { state_en: b.state_en ?? null, dist_en: b.dist_en ?? null, business_name_en: b.business_name_en ?? null };
        await dispatchJob('SendBusinessCreatedNotification', b.id, notificationData, b.user_id);
        businessCount++;
      }
    });
    io.info(`Successfully dispatched ${businessCount} business notifications.`);

    Log.info('Send notifications Cron Executed', {
      date: today,
      dispatched_ads: adCount,
      dispatched_businesses: businessCount,
    });
    return SUCCESS;
  } catch (e) {
    const c = errorContext(e);
    Log.error('SendScheduledNotifications Cron Failed', { message: c.error_message, line: c.line, file: c.file });
    io.error(c.error_message);
    return FAILURE;
  }
}
