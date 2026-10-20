// Port of App\Console\Commands\ExpireAdvertisements (`ads:expire`).
import { exec } from '../db/pool.js';
import { nowDb } from '../core/time.js';
import { errorContext } from '../jobs/common.js';
import { Log } from '../jobs/log.js';
import { type CommandIO, FAILURE, SUCCESS } from './io.js';

export async function adsExpire(io: CommandIO): Promise<number> {
  try {
    const now = nowDb();
    const today = now.slice(0, 10); // Carbon::today() (Asia/Kolkata)

    // Eloquent Builder::update() also sets updated_at.
    const ads = await exec(
      'UPDATE `advertisments` SET `status` = ?, `advertisments`.`updated_at` = ? WHERE `status` = ? AND DATE(`to_date`) < ?',
      [0, now, 1, today],
    );
    const events = await exec(
      'UPDATE `events` SET `status` = ?, `events`.`updated_at` = ? WHERE `status` = ? AND DATE(`date`) < ?',
      [0, now, 1, today],
    );
    const updatedAds = ads.affectedRows;
    const updatedEvents = events.affectedRows;

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
