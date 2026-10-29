import { app } from './app.js';
import { env } from './config/env.js';
import { startScheduler, stopScheduler } from './commands/index.js';
import { startQueueWorker, stopQueueWorker } from './jobs/queue.js';
import { closeMongo, connectMongo } from './db/mongo.js';

await connectMongo();
const server = app.listen(env.port, () => console.log(`API listening on :${env.port}`));

// Database queue worker (`queue:work`) and scheduler (`schedule:run`), both in-process.
if (env.queueWorkerEnabled) startQueueWorker();
if (env.schedulerEnabled) startScheduler();

/** Stop taking work, let in-flight requests finish, then release the MongoDB pool. */
function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal} received, shutting down`);
  stopScheduler();
  stopQueueWorker();
  server.close(async () => {
    await closeMongo();
    process.exit(0);
  });
  // Keep-alive connections can hold close() open; don't outlive the orchestrator's grace period.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
