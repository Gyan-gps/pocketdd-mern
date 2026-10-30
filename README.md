# PocketDD API

Express + MongoDB (Mongoose) backend for the PocketDD mobile app (`/api/*`) and admin panel (`/api/admin/*`).
It replaces the Laravel `pocketdd-admin` backend and answers **exactly** like it did (JSON keys and key order,
messages, status codes, stored values, intentional `// Laravel quirk:` behaviours), so existing clients work unchanged.
Read [PORTING_GUIDE.md](PORTING_GUIDE.md) before changing any behaviour.

## Running

```sh
npm install
cp .env.example .env      # fill in MONGODB_URI etc.
npm run dev               # tsx watch
npm run build && npm start
npm run typecheck
npm test                  # needs a local/dev MONGODB_URI (never production); parity suites also need MySQL + Laravel
```

Artisan-style commands: `npx tsx --env-file=.env src/commands/run.ts ads:expire`.

## Request flow

```
routes/<feature>.routes.ts      URL + middleware → controller action (wrapped by core/http/action.ts)
  → middlewares/                authenticate (Sanctum token), normalize-input (req.input), error-handler
  → controllers/<feature>.controller.ts   reads req.input, validates, calls services, builds the Laravel response
      → validators/<feature>.validator.ts  { rules, messages } schemas (Laravel rule syntax, core/validation)
      → services/<feature>.service.ts      queries and business logic through the Mongoose models
          → models/<name>.model.ts         schema + model per collection
      → serializers/                       Laravel model JSON shaping (hidden fields, casts, accessors)
```

## Layout

```
src/
  server.ts             entry: connect DB, start HTTP server, queue worker, scheduler; graceful shutdown
  app.ts                Express app: global middleware, static uploads, route mounting
  config/
    env.ts                environment configuration
    database.ts           Mongoose connection and settings (see "Database" below)
  models/               one Mongoose schema + model per collection; index.ts = registry (MODEL_BY_TABLE, modelFor …)
  routes/               public API route tables; index.ts mounts them under /api
  controllers/          public API controllers (one per Laravel Api\*Controller)
  services/             data access + business logic (incl. firebase.service.ts for FCM push)
  validators/           request validation schemas; validators/admin/ for the admin panel
  serializers/          response shaping for User/Business models
  middlewares/          authenticate, normalize-input, error-handler
  admin/                admin panel API (replaces Backpack) — see the header of admin/index.ts
    crud.ts               config-driven CRUD engine
    entities/             one CrudConfig per admin screen
    sections/, routes/    entity groups and non-CRUD admin routes (imports, dashboard)
    support/              helpers shared by groups of entities
  core/                 Laravel framework behaviour the API relies on
    http/                 action() wrapper, response helpers
    auth/                 bcrypt hashing, Sanctum access tokens
    validation/           Laravel validator subset
    i18n/, logging/       __() translations, api_failures + Log facade
  db/
    eloquent.ts           Eloquent/MySQL value semantics on MongoDB (coercion, dirty-checking saves, table lookup)
    mongo.ts              row/document helpers, id counters, inserts, transactions
    table-schema.ts       MySQL column metadata, derived from the models
    mysql.ts              MySQL pool (migration script and parity tests only)
  jobs/                 database queue (queue.ts) and the queued notification jobs
  commands/             Artisan commands + in-process scheduler
  utils/                PHP value semantics (utils/php), Hindi transliteration (utils/hindi), misc helpers
scripts/                MySQL → MongoDB migration, dev schema/seed; scripts/lib/raw-collections.ts for raw access
test/                   unit tests (node:test) and Laravel parity suites (test/parity)
```

## Database

Collections keep the shape of the migrated MySQL rows: integer `_id` (allocated by `nextId()`), fields in the
MySQL column order, dates as IST strings, DECIMAL values as `"10.00"` strings; child tables are embedded arrays
(e.g. `businesses.details[]`). Each model field records its MySQL type (`column.int()`, `column.decimal(2)` …).

`config/database.ts` sets Mongoose to pass query and update values through unchanged — values are already
stored-type-correct, and Mongoose casting would alter Laravel-compatible behaviour (CastErrors instead of "not
found", reordered subdocuments, dropped `undefined` → `null` writes). `test/database.test.ts` pins this down.
Always read with `.lean()`; insert through `insertRow()` (never `Model.create()`, which reorders fields).

## Conventions

- File names are kebab-case with a role suffix (`*.controller.ts`, `*.service.ts`, `*.validator.ts`, `*.model.ts`).
- Identifiers: camelCase variables/functions, PascalCase models/types, UPPER_SNAKE constants; no one-letter names.
- Route paths, JSON keys, field names and Laravel action names mirror Laravel, including its spellings
  (`advertisment`, `business-request-managment`, table `business_iamges`). Clients and stored data depend on them.
- Job functions keep their Laravel class names (`SendEventNotification`): queued payloads reference them.
