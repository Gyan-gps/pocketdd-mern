# PocketDD API

Express + MongoDB port of the Laravel `pocketdd-admin` backend: the mobile app API (`/api/*`) and the admin
panel API (`/api/admin/*`). Responses are kept byte-for-byte compatible with the Laravel app (JSON key order,
status codes, quirks), so read [PORTING_GUIDE.md](PORTING_GUIDE.md) before changing any behaviour.

## Running

```sh
npm install
cp .env.example .env      # fill in MONGODB_URI etc.
npm run dev               # tsx watch
npm run build && npm start
npm run typecheck
npm test                  # needs MONGODB_URI (and MySQL/Laravel for the parity suites); run against a dev database only
```

Manual Artisan-style commands: `npx tsx --env-file=.env src/commands/run.ts ads:expire`.

## Layout

```
src/
  index.ts              entry point: connects MongoDB, starts HTTP server, queue worker, scheduler; graceful shutdown
  app.ts                Express app: global middleware, static uploads, route mounting
  config/env.ts         all environment configuration
  routes/index.ts       mounts the public API modules under /api
  modules/<name>/       public API, one folder per Laravel Api\*Controller
    <name>.routes.ts      route table (paths, auth middleware)
    <name>.controller.ts  request handling + data access for that controller
  admin/                admin panel API (replaces Backpack)
    index.ts              mounts auth, custom routes and every CRUD entity
    auth.ts               admin login / token middleware
    crud.ts               generic CRUD engine driven by CrudConfig
    entities/             one CrudConfig per Backpack CrudController
    sections/             entity groups + their extra routes (business, directory, staff & events)
    routes/               non-CRUD admin routes (imports, dashboard/charts)
    support/              helpers shared by a group of entities
    uploads.ts, xlsx.ts   upload storage and spreadsheet import/export
  core/                 Laravel framework emulation used everywhere
    http/                 action() route wrapper, input normalisation, response helpers
    auth/                 bcrypt hashing, Sanctum tokens + `sanctum` middleware
    validation/           Laravel validator subset
    i18n/                 __() translations from language_lines
    logging/              api_failures logger, Log facade
    time.ts, url.ts       IST timestamps / date serialisation, url() helpers
  db/
    mongo.ts              client, collection names, row <-> document mapping, transactions
    indexes.ts            index definitions
    eloquent.ts           Eloquent/MySQL semantics on MongoDB (table location, value coercion, dirty-checking save)
    table-schema.ts       column list/types of every old MySQL table
    mysql.ts              MySQL pool, used only by scripts/ and the parity tests
  models/               Eloquent model serialisers (hidden fields, casts, accessors)
  services/firebase.ts  FCM push notifications
  jobs/                 queued jobs (send-*-notification.ts), queue.ts = database queue + worker
  commands/             Artisan commands, registry + in-process scheduler (index.ts)
  middlewares/          Express error handler
  utils/
    php/                  PHP value semantics (empty(), trim(), json_encode, string conversion)
    hindi/                English→Hindi transliteration, KrutiDev conversion
    general.ts            App\Helpers\General ports
    base64-image.ts       base64 image upload storage
  types/                Express Request augmentation
scripts/                MySQL → MongoDB migration, dev schema patches and seeds
test/                   unit tests (node:test) and Laravel parity suites
```

## Conventions

- File names are kebab-case; identifiers are camelCase, types/classes PascalCase.
- Job functions keep their Laravel class names (`SendEventNotification`) because queued payloads reference them.
- Route paths, collection names and JSON keys mirror Laravel, including its spellings (`advertisment`,
  `business-request-managment`). Don't rename them: clients and stored data depend on them.
- Ported quirks are marked `// Laravel quirk:` and are intentional.
