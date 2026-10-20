import { app } from './app.js';
import { env } from './config/env.js';
import { startScheduler } from './commands/index.js';
import { startQueueWorker } from './jobs/dispatch.js';

app.listen(env.port, () => console.log(`API listening on :${env.port}`));

// Database queue worker (`queue:work`) and scheduler (`schedule:run`), both in-process.
if ((process.env.QUEUE_WORKER ?? 'true') === 'true') startQueueWorker();
if ((process.env.SCHEDULER ?? 'true') === 'true') startScheduler();
