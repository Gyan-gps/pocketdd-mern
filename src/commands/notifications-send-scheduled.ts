// Port of App\Console\Commands\SendScheduledNotifications (`notifications:send-scheduled`).
import { toRow } from '../db/mongo.js';
import { Advertisement, Business, type AnyModel } from '../models/index.js';
import { nowDb } from '../core/time.js';
import { dispatchJob } from '../jobs/queue.js';
import { errorContext } from '../jobs/job-helpers.js';
import { Log } from '../core/logging/log.js';
import { type CommandIO, FAILURE, SUCCESS } from './command-io.js';

/** whereDate('from_date', today): the stored "YYYY-MM-DD[ HH:MM:SS]" string starts with the date. */
const onDate = (today: string) => ({ from_date: { $regex: `^${today}` } });

/** Model::whereDate(...)->chunkById(100, fn) */
async function chunkById(model: AnyModel, today: string, handleChunk: (rows: Record<string, any>[]) => Promise<void>) {
  let lastId: number | null = null;
  for (;;) {
    const documents = await model
      .find(lastId === null ? onDate(today) : { ...onDate(today), _id: { $gt: lastId } })
      .sort({ _id: 1 })
      .limit(100)
      .lean<Record<string, any>[]>();
    const rows: Record<string, any>[] = documents.map((document) => toRow(document)!);
    if (!rows.length) break;
    await handleChunk(rows);
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

    const totalAds = await Advertisement.countDocuments(onDate(today));
    io.info(`Found ${totalAds} advertisements to notify.`);
    const totalBusinesses = await Business.countDocuments(onDate(today));
    io.info(`Found ${totalBusinesses} businesses to notify.`);

    io.info('Starting scheduled notification dispatch for: ' + today);

    await chunkById(Advertisement, today, async (ads) => {
      for (const ad of ads) {
        // client_name stores the business id
        await dispatchJob('SendAdvertisementNotification', ad.id, ad.client_name);
        adCount++;
      }
    });
    io.info(`Successfully dispatched ${adCount} advertisement notifications.`);

    await chunkById(Business, today, async (businesses) => {
      for (const business of businesses) {
        const notificationData = {
          state_en: business.state_en ?? null,
          dist_en: business.dist_en ?? null,
          business_name_en: business.business_name_en ?? null,
        };
        await dispatchJob('SendBusinessCreatedNotification', business.id, notificationData, business.user_id);
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
  } catch (error) {
    const context = errorContext(error);
    Log.error('SendScheduledNotifications Cron Failed', { message: context.error_message, line: context.line, file: context.file });
    io.error(context.error_message);
    return FAILURE;
  }
}
