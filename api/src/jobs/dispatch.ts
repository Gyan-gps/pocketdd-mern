// Node replacement for Laravel's `database` queue (QUEUE_CONNECTION=database) used by the 4 notification jobs.
// Jobs are stored in `node_jobs` (NOT Laravel's `jobs` table: that holds PHP-serialized payloads and Laravel's
// worker would pick ours up). Semantics mirror `php artisan queue:work` defaults:
//   - tries = 1 (no job defines $tries), backoff = 0, retry_after = 90s (config/queue.php),
//   - success → row deleted; exception → row kept with failed_at/exception (the failed_jobs equivalent),
//   - a reservation older than retry_after is re-run; once attempts > tries it fails with
//     MaxAttemptsExceededException, like Laravel.
import { randomUUID } from 'node:crypto';
import { all, exec, first } from '../db/pool.js';
import { nowDb } from '../core/time.js';
import { SendAdvertisementNotification } from './SendAdvertisementNotification.js';
import { SendBusinessApproveNotification } from './SendBusinessApproveNotification.js';
import { SendBusinessCreatedNotification } from './SendBusinessCreatedNotification.js';
import { SendEventNotification } from './SendEventNotification.js';
import { Log } from './log.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const JOBS: Record<string, (...args: any[]) => Promise<void>> = {
  SendAdvertisementNotification,
  SendBusinessApproveNotification,
  SendBusinessCreatedNotification,
  SendEventNotification,
};
export type JobName = keyof typeof JOBS | string;

const TRIES = 1;
const BACKOFF = 0;
const RETRY_AFTER = Number(process.env.NODE_QUEUE_RETRY_AFTER ?? 90);
// Queue name (Laravel 'default'); NODE_QUEUE lets tests use an isolated queue the API's worker ignores.
const queueName = () => process.env.NODE_QUEUE ?? 'default';
const unix = () => Math.floor(Date.now() / 1000);

/**
 * `XJob::dispatch(...args)` — enqueue for asynchronous execution. Args are JSON-encoded, so they must be
 * JSON-safe (ids, strings, plain objects) — the same values Laravel would serialize into the payload.
 */
export async function dispatchJob(name: JobName, ...args: unknown[]): Promise<number> {
  if (!JOBS[name]) throw new Error(`Unknown job ${name}`);
  const now = unix();
  const res = await exec(
    'INSERT INTO `node_jobs` (`uuid`, `queue`, `job`, `args`, `attempts`, `reserved_at`, `available_at`, `created_at`) VALUES (?, ?, ?, ?, 0, NULL, ?, ?)',
    [randomUUID(), queueName(), name, JSON.stringify(args), now, now],
  );
  return res.insertId;
}

interface JobRow {
  id: number;
  job: string;
  args: string;
  attempts: number;
}

function exceptionText(e: unknown): string {
  const err = e instanceof Error ? e : new Error(String(e));
  const cls = (err as { exceptionClass?: string }).exceptionClass ?? err.name;
  return `${cls}: ${err.message}\n${err.stack ?? ''}`;
}

async function markFailed(row: JobRow, e: unknown) {
  await exec('UPDATE `node_jobs` SET `failed_at` = ?, `exception` = ?, `reserved_at` = NULL, `reserved_by` = NULL WHERE `id` = ?', [
    nowDb(),
    exceptionText(e),
    row.id,
  ]);
}

/** Reserve and run the next available job. Returns false when the queue is empty. */
export async function workOnce(): Promise<boolean> {
  const token = randomUUID();
  const now = unix();
  const res = await exec(
    'UPDATE `node_jobs` SET `reserved_at` = ?, `reserved_by` = ?, `attempts` = `attempts` + 1 ' +
      'WHERE `failed_at` IS NULL AND `queue` = ? AND `available_at` <= ? AND (`reserved_at` IS NULL OR `reserved_at` <= ?) ' +
      'ORDER BY `id` LIMIT 1',
    [now, token, queueName(), now, now - RETRY_AFTER],
  );
  if (!res.affectedRows) return false;
  const row = await first<JobRow>('SELECT `id`, `job`, `args`, `attempts` FROM `node_jobs` WHERE `reserved_by` = ?', [token]);
  if (!row) return true;

  if (row.attempts > TRIES) {
    const e = new Error(`App\\Jobs\\${row.job} has been attempted too many times.`);
    (e as { exceptionClass?: string }).exceptionClass = 'Illuminate\\Queue\\MaxAttemptsExceededException';
    await markFailed(row, e);
    return true;
  }

  try {
    const handler = JOBS[row.job];
    if (!handler) throw new Error(`Unknown job ${row.job}`);
    await handler(...(JSON.parse(row.args) as unknown[]));
    await exec('DELETE FROM `node_jobs` WHERE `id` = ?', [row.id]);
  } catch (e) {
    if (row.attempts >= TRIES) {
      await markFailed(row, e);
    } else {
      // release($backoff)
      await exec('UPDATE `node_jobs` SET `reserved_at` = NULL, `reserved_by` = NULL, `available_at` = ? WHERE `id` = ?', [
        unix() + BACKOFF,
        row.id,
      ]);
    }
  }
  return true;
}

/** Drain the queue (tests / manual runs). */
export async function workUntilEmpty(): Promise<number> {
  let n = 0;
  while (await workOnce()) n++;
  return n;
}

let timer: NodeJS.Timeout | null = null;
/** In-process worker loop (`queue:work`, sleep 3s when idle). */
export function startQueueWorker(sleepMs = 3000) {
  if (timer) return;
  const loop = async () => {
    try {
      while (await workOnce()) {
        /* keep draining */
      }
    } catch (e) {
      Log.error('Queue worker error', { message: e instanceof Error ? e.message : String(e) });
    }
    timer = setTimeout(loop, sleepMs);
  };
  timer = setTimeout(loop, 0);
}

export function stopQueueWorker() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** `php artisan queue:failed` equivalent helper. */
export const failedJobs = () => all('SELECT * FROM `node_jobs` WHERE `failed_at` IS NOT NULL ORDER BY `id`');
