// Port of App\Console\Commands\SendScheduledNotifications (`notifications:send-scheduled`).
import { all, first } from '../db/pool.js';
import { nowDb } from '../core/time.js';
import { dispatchJob } from '../jobs/dispatch.js';
import { errorContext } from '../jobs/common.js';
import { Log } from '../jobs/log.js';
import { type CommandIO, FAILURE, SUCCESS } from './io.js';

/** Model::whereDate(...)->chunkById(100, fn) */
async function chunkById(table: string, today: string, fn: (rows: Record<string, any>[]) => Promise<void>) {
  let lastId: number | null = null;
  for (;;) {
    const rows: Record<string, any>[] = await all(
      `SELECT * FROM \`${table}\` WHERE DATE(\`from_date\`) = ?${lastId === null ? '' : ' AND `id` > ?'} ORDER BY \`id\` ASC LIMIT 100`,
      lastId === null ? [today] : [today, lastId],
    );
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

    const totalAds = (await first('SELECT COUNT(*) AS aggregate FROM `advertisments` WHERE DATE(`from_date`) = ?', [today]))!.aggregate;
    io.info(`Found ${totalAds} advertisements to notify.`);
    const totalBusinesses = (await first('SELECT COUNT(*) AS aggregate FROM `businesses` WHERE DATE(`from_date`) = ?', [today]))!
      .aggregate;
    io.info(`Found ${totalBusinesses} businesses to notify.`);

    io.info('Starting scheduled notification dispatch for: ' + today);

    await chunkById('advertisments', today, async (ads) => {
      for (const ad of ads) {
        // client_name stores the business id
        await dispatchJob('SendAdvertisementNotification', ad.id, ad.client_name);
        adCount++;
      }
    });
    io.info(`Successfully dispatched ${adCount} advertisement notifications.`);

    await chunkById('businesses', today, async (businesses) => {
      for (const b of businesses) {
        const notificationData = { state_en: b.state_en, dist_en: b.dist_en, business_name_en: b.business_name_en };
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
