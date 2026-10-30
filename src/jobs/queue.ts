// Node replacement for Laravel's `database` queue (QUEUE_CONNECTION=database) used by the 4 notification jobs.
// Jobs are stored in the `jobs` collection (was `node_jobs`; not Laravel's `jobs` table, which holds PHP-serialized
// payloads and Laravel's worker would pick ours up). Semantics mirror `php artisan queue:work` defaults:
//   - tries = 1 (no job defines $tries), backoff = 0, retry_after = 90s (config/queue.php),
//   - success → row deleted; exception → row kept with failed_at/exception (the failed_jobs equivalent),
//   - a reservation older than retry_after is re-run; once attempts > tries it fails with
//     MaxAttemptsExceededException, like Laravel.
import { randomUUID } from 'node:crypto';
import { insertRow, toRows, type Row } from '../db/mongo.js';
import { QueueJob } from '../models/index.js';
import { nowDb } from '../core/time.js';
import { SendAdvertisementNotification } from './send-advertisement-notification.js';
import { SendBusinessApproveNotification } from './send-business-approve-notification.js';
import { SendBusinessCreatedNotification } from './send-business-created-notification.js';
import { SendEventNotification } from './send-event-notification.js';
import { Log } from '../core/logging/log.js';

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
 * `XJob::dispatch(...args)` — enqueue for asynchronous execution. Args are stored as a native array, but must
 * stay JSON-safe (ids, strings, plain objects) — the same values Laravel would serialize into the payload.
 */
export async function dispatchJob(name: JobName, ...args: unknown[]): Promise<number> {
  if (!JOBS[name]) throw new Error(`Unknown job ${name}`);
  const now = unix();
  return insertRow(QueueJob.collection.collectionName, {
    uuid: randomUUID(),
    queue: queueName(),
    job: name,
    args: JSON.parse(JSON.stringify(args)),
    attempts: 0,
    reserved_at: null,
    reserved_by: null,
    available_at: now,
    created_at: now,
    failed_at: null,
    exception: null,
  });
}

interface JobRow {
  id: number;
  job: string;
  args: unknown;
  attempts: number;
}

function exceptionText(error: unknown): string {
  const err = error instanceof Error ? error : new Error(String(error));
  const exceptionClass = (err as { exceptionClass?: string }).exceptionClass ?? err.name;
  return `${exceptionClass}: ${err.message}\n${err.stack ?? ''}`;
}

async function markFailed(row: JobRow, error: unknown) {
  await QueueJob.updateOne(
    { _id: row.id },
    { $set: { failed_at: nowDb(), exception: exceptionText(error), reserved_at: null, reserved_by: null } },
  );
}

/** Reserve and run the next available job. Returns false when the queue is empty. */
export async function workOnce(): Promise<boolean> {
  const token = randomUUID();
  const now = unix();
  // Atomic reservation: only one worker can flip reserved_at/reserved_by on a given job.
  const reserved = await QueueJob.findOneAndUpdate(
    {
      failed_at: null,
      queue: queueName(),
      available_at: { $lte: now },
      $or: [{ reserved_at: null }, { reserved_at: { $lte: now - RETRY_AFTER } }],
    },
    { $set: { reserved_at: now, reserved_by: token }, $inc: { attempts: 1 } },
    { sort: { _id: 1 }, returnDocument: 'after' },
  ).lean<Row>();
  if (!reserved) return false;
  const row: JobRow = { id: reserved._id, job: reserved.job, args: reserved.args, attempts: reserved.attempts };

  if (row.attempts > TRIES) {
    const error = new Error(`App\\Jobs\\${row.job} has been attempted too many times.`);
    (error as { exceptionClass?: string }).exceptionClass = 'Illuminate\\Queue\\MaxAttemptsExceededException';
    await markFailed(row, error);
    return true;
  }

  try {
    const handler = JOBS[row.job];
    if (!handler) throw new Error(`Unknown job ${row.job}`);
    const args = typeof row.args === 'string' ? JSON.parse(row.args) : row.args;
    await handler(...(args as unknown[]));
    await QueueJob.deleteOne({ _id: row.id });
  } catch (error) {
    if (row.attempts >= TRIES) {
      await markFailed(row, error);
    } else {
      // release($backoff)
      await QueueJob.updateOne(
        { _id: row.id },
        { $set: { reserved_at: null, reserved_by: null, available_at: unix() + BACKOFF } },
      );
    }
  }
  return true;
}

/** Drain the queue (tests / manual runs). */
export async function workUntilEmpty(): Promise<number> {
  let processed = 0;
  while (await workOnce()) processed++;
  return processed;
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
    } catch (error) {
      Log.error('Queue worker error', { message: error instanceof Error ? error.message : String(error) });
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
export const failedJobs = async () => toRows(await QueueJob.find({ failed_at: { $ne: null } }).sort({ _id: 1 }).lean());
