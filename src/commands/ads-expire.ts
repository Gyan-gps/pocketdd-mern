// Port of App\Console\Commands\ExpireAdvertisements (`ads:expire`).
import { C, col } from '../db/mongo.js';
import { nowDb } from '../core/time.js';
import { errorContext } from '../jobs/job-helpers.js';
import { Log } from '../core/logging/log.js';
import { type CommandIO, FAILURE, SUCCESS } from './command-io.js';

export async function adsExpire(io: CommandIO): Promise<number> {
  try {
    const now = nowDb();
    const today = now.slice(0, 10); // Carbon::today() (Asia/Kolkata)

    // Eloquent Builder::update() also sets updated_at.
    // DATE(col) < today on the stored "YYYY-MM-DD[ HH:MM:SS]" strings: a lexical compare against the bare date.
    const ads = await col(C.advertisements).updateMany(
      { status: 1, to_date: { $lt: today } },
      { $set: { status: 0, updated_at: now } },
    );
    const events = await col(C.events).updateMany({ status: 1, date: { $lt: today } }, { $set: { status: 0, updated_at: now } });
    const updatedAds = ads.modifiedCount;
    const updatedEvents = events.modifiedCount;

    Log.info('Expire Advertisements & Events Cron Executed', {
      date: today,
      expired_ads: updatedAds,
      expired_events: updatedEvents,
    });
    io.info(`Expired ads deactivated: ${updatedAds}`);
    io.info(`Expired events deactivated: ${updatedEvents}`);
    return SUCCESS;
  } catch (e) {
    const c = errorContext(e);
    Log.error('ExpireAdvertisements Cron Failed', { message: c.error_message, line: c.line, file: c.file });
    io.error(c.error_message);
    return FAILURE;
  }
}
