// Artisan command registry + in-process scheduler (Laravel `schedule:run`, app timezone Asia/Kolkata).
import { nowDb } from '../core/time.js';
import { Log } from '../core/logging/log.js';
import { adsExpire } from './ads-expire.js';
import { type CommandIO, consoleIO } from './command-io.js';
import { notificationsSendScheduled } from './notifications-send-scheduled.js';
import { translateCitiesHindi } from './translate-cities-hindi.js';

export const COMMANDS: Record<string, (io: CommandIO) => Promise<number>> = {
  'ads:expire': adsExpire,
  'notifications:send-scheduled': notificationsSendScheduled,
  'translate:cities-hindi': (io) => translateCitiesHindi(io),
};

/**
 * Effective Laravel schedule (`php artisan schedule:list`): routes/console.php only. App\Console\Kernel
 * (ads:expire daily, translate:cities-hindi 02:00) is never loaded in Laravel 12's bootstrap/app.php, and the
 * translate entry in routes/console.php is commented out → translate:cities-hindi is NOT scheduled.
 */
export const SCHEDULE: Array<{ command: string; at: string }> = [
  { command: 'ads:expire', at: '00:00' },
  { command: 'notifications:send-scheduled', at: '10:00' },
];

let timer: NodeJS.Timeout | null = null;
const lastRun = new Map<string, string>();

/** Checks once per minute (IST wall clock); each entry runs at most once per day-minute. */
export function startScheduler() {
  if (timer) return;
  const tick = async () => {
    const now = nowDb(); // IST "YYYY-MM-DD HH:mm:ss"
    const hm = now.slice(11, 16);
    const key = now.slice(0, 16);
    for (const { command, at } of SCHEDULE) {
      if (at !== hm || lastRun.get(command) === key) continue;
      lastRun.set(command, key);
      try {
        await COMMANDS[command]!(consoleIO);
      } catch (e) {
        Log.error(`Scheduled command ${command} crashed`, { message: e instanceof Error ? e.message : String(e) });
      }
    }
  };
  const schedule = () => {
    timer = setTimeout(async () => {
      await tick();
      schedule();
    }, 60_000 - (Date.now() % 60_000) + 500);
  };
  schedule();
}

export function stopScheduler() {
  if (timer) clearTimeout(timer);
  timer = null;
}
