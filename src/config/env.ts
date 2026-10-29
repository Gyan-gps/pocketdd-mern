export const env = {
  port: Number(process.env.PORT ?? 4000),
  debug: process.env.APP_DEBUG === 'true',
  // env('APP_URL') — used by model accessors (category_icon, advertisment_icon…).
  appUrl: process.env.APP_URL ?? 'http://localhost',
  // url() uses the request host like Laravel; set this when running behind a proxy that rewrites Host.
  appUrlOverride: process.env.URL_ROOT || undefined,
  // Laravel public_path(): uploads are written here so both apps serve the same files.
  publicPath: process.env.LARAVEL_PUBLIC_PATH ?? '/laravel/public',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  // Admin panel token lifetime in minutes (Laravel config('session.lifetime')).
  sessionLifetimeMinutes: Number(process.env.SESSION_LIFETIME ?? 120),
  // In-process database queue worker (`queue:work`) and scheduler (`schedule:run`); set to false to run them elsewhere.
  queueWorkerEnabled: (process.env.QUEUE_WORKER ?? 'true') === 'true',
  schedulerEnabled: (process.env.SCHEDULER ?? 'true') === 'true',
  // NODE_QUEUE, NODE_QUEUE_RETRY_AFTER, APP_ENV and FIREBASE_* are read at call time (tests change them at runtime).
  mongo: {
    uri: process.env.MONGODB_URI ?? '',
    db: process.env.MONGODB_DB ?? 'pocketdd',
  },
  // MySQL: only used by scripts/migrate-from-mysql.ts and the Laravel parity tests.
  db: {
    host: process.env.DB_HOST ?? 'mysql',
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_DATABASE ?? '',
    user: process.env.DB_USERNAME ?? '',
    password: process.env.DB_PASSWORD ?? '',
  },
};
