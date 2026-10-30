// Port of App\Console\Commands\ExpireAdvertisements (`ads:expire`).
import { Advertisement, Event } from '../models/index.js';
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
    const ads = await Advertisement.updateMany(
      { status: 1, to_date: { $lt: today } },
      { $set: { status: 0, updated_at: now } },
    );
    const events = await Event.updateMany({ status: 1, date: { $lt: today } }, { $set: { status: 0, updated_at: now } });
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
  } catch (error) {
    const context = errorContext(error);
    Log.error('ExpireAdvertisements Cron Failed', { message: context.error_message, line: context.line, file: context.file });
    io.error(context.error_message);
    return FAILURE;
  }
}
