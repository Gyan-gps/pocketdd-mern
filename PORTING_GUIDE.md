# Porting guide (Laravel → Express) — rules every phase follows

Source: `C:\Users\Rahul\Desktop\pocket-dd\pocketdd-admin` (read-only — never edit it).
Target: `C:\Users\Rahul\Desktop\pocket-dd\pocketdd-node\api`. Reference port: `api/src/modules/auth/` (Phase 2).

## Goal
Byte-for-byte behavioural parity with the PHP: same URL, method, middleware, validation rules and
messages, DB reads/writes (same tables, columns, values, IST timestamps), JSON keys **and key order**,
HTTP status. Port bugs and quirks as-is (comment them `// Laravel quirk:`) — never "fix" behaviour.

## Core helpers (api/src/core, api/src/db) — use them, don't reinvent
- `action('Api\\XController@method', handler)` (core/http/route.ts) — wraps every route; a returned object is sent as JSON; uncaught errors → `api_failures` + 500. Use `{ logFailures: false }` for routes outside the `log.api.failures` group.
- `sanctum` middleware (core/auth/sanctum.ts) for `auth:sanctum` routes; `req.user` is the users row.
- `req.input` = Laravel `$request->all()` (trimmed, ''→null, query+body+files). Uploaded files appear as multer file objects (`originalname`, `mimetype`, `size`, `buffer`).
- `validate(input, rules, messages)` (core/validation) → `.fails()`, `.first()`. Supports required, nullable, string, array, numeric, integer, boolean, digits, in, email, url, date, max, min, image, mimes, exists, unique, `x.*`. Unsupported rule → it throws; add the rule to the validator (with a unit test) if needed.
- `sendResponse`, `sendCatchLog`, `errorMessage`, `PhpError` (core/http/respond.ts). PHP `catch (Exception $e)` does NOT catch `\Error`/TypeError — rethrow `PhpError` from catch blocks where the PHP would fatal.
- `all/first/exec` (db/pool.ts) — raw SQL with `?` params; DB errors become Laravel-formatted `QueryException` messages. Dates come back as the stored strings.
- `nowDb()` for `now()`/`Carbon::now()` writes; `serializeDates(row, keys)` / `toModelJson()` for Eloquent date casts + timestamps in JSON (Eloquent → `2025-06-19T05:00:00.000000Z`; raw `DB::table()` rows → stored string).
- `url(req, path)` = Laravel `url()`; `appUrl(path)` = `env('APP_URL').'/'.$path`. `env.publicPath` = Laravel `public_path()` (mounted, shared with Laravel).
- `hashMake/hashCheck` (bcrypt `$2y$`), `createToken/deleteAllTokens` (Sanctum).
- `trans('group.key')` = Laravel `__()` (language_lines only).

## Eloquent → JSON rules to reproduce
- `$hidden`, `$appends` (accessors appended **after** columns, in `$appends` order), `$casts` (array/json → decoded, bool, int, date/datetime → ISO UTC), `withCount` → `<rel>_count` after selected columns, eager-loaded relations after appends (snake_case key).
- `->get()` of a model without select → every column in table order.
- Collection `unique()`, `pluck()`, `values()`, `map()`; `->first()` → null; `->paginate()` shape if used (port exactly).
- Models with `HasTranslations` + `$translatable`: JSON column, `getTranslation('name', $lang)` falls back to the fallback locale.

## Where your files go (avoid collisions with parallel work)
- Module: `api/src/modules/<name>/<name>.controller.ts` + `<name>.routes.ts` (default-export a Router). Mount it with ONE added import + ONE `routes.use(...)` line in `api/src/routes.ts` (Edit tool; re-read and retry if the edit fails because someone else edited it).
- Shared model serializers/helpers: `api/src/models/<model>.ts`, `api/src/helpers/<name>.ts`. Before creating, check if it exists; if so, only ADD exports — never rewrite others' code.
- Dev schema (columns/tables the PHP uses but the local DB lacks): `api/scripts/schema/phase<N>.ts` (see 01-auth-locations.ts; `tables`, `columns`, `nullable`). Apply: `docker compose exec -T api npx tsx scripts/dev-schema-patch.ts`.
- Fixtures: `api/scripts/seed/phase<N>.ts` — **use only ids in your phase range** (phase N → N00–N99, e.g. phase 3 → 300–399) so parallel runs don't collide. Phase 2 rows (ids 1–6) may be read, not changed. Apply: `docker compose exec -T api npx tsx scripts/dev-seed.ts`.
- Parity cases: `api/test/parity/cases/phase<N>-<name>.ts` (see auth-locations.ts). Run: `docker compose exec -T api npx tsx test/parity/run.ts phase<N>` (from `pocketdd-node/`).

## Verification loop (required)
1. `docker compose exec -T api npx tsc --noEmit` — fix errors in your files (ignore other phases' in-progress files).
2. Schema patch + seed, then parity run. Laravel runs at `http://laravel.test` (same DB).
3. Cover: each endpoint's success path(s), each validation branch, not-found/empty branches, language en/hi, auth/no-auth. Mutating endpoints: reset state in `before`. Mark per-call values (`token`, auto ids, `updated_at`) as `volatile`.
4. Iterate until every case passes, or the remaining difference is provably environmental (explain why).
5. The API runs `tsx watch`; if behaviour looks stale: `docker compose restart api` (another agent may be running tests — retry on connection errors).

## Admin CRUD screens (Phase 9)
Reference: `Admin\DepartmentCrudController` →
- API: `api/src/admin/entities/department.ts` (`CrudConfig`, engine in `api/src/admin/crud.ts`), registered in `api/src/admin/index.ts` `ENTITIES`.
- UI: `web/src/admin/entities/department.ts` (`EntityUi`, types in `web/src/admin/types.ts`), registered in `web/src/admin/registry.ts`.
- Tests: `api/test/admin.test.ts` pattern (login with the seeded test admin from `scripts/seed/07-admin-auth.ts`).
Mapping rules:
- `use ...Operation` traits → `operations`. Only expose what the PHP exposes.
- `setupListOperation` columns/clauses → `list.orderBy`, `list.where`, `searchable` (Backpack searches every text column whose `searchLogic` isn't false; relationship columns search the related name), UI `columns` (type/label/limit/wrapper style, relationship → `render` using data the API's `serialize` adds).
- `setupCreate/UpdateOperation` fields → `fields.create/update` (exact names sent) + UI `createFields/updateFields`; FormRequest `rules()`/`messages()` → `validation` (closures when rules depend on the id, e.g. `unique:table,col,'.$id`).
- Overridden `store()/update()` bodies, model events (`boot`, observers, Sluggable, mutators like `setXAttribute`), uploads, `SendXNotification::dispatch(...)` → `hooks`. Queue dispatches call `dispatchJob(name, args)` from `api/src/jobs/dispatch.ts` (Phase 7) — if it does not exist yet, create a stub there that only logs, keeping the exact args.
- Custom routes in `routes/backpack/custom.php` (imports, fetch endpoints, charts) → extra routes on the entity router or a module under `api/src/admin/`.
- Extend `crud.ts`, `CrudForm.tsx`, `Cell.tsx`, `types.ts` only additively (new field/column types, new optional config keys) — other entities depend on them.

## Never
- Edit pocketdd-admin, edit `api/package.json` (list needed deps in your report instead), drop/alter existing columns, send real SMS/push notifications (stub the external call in tests only via fixtures that avoid it, and say so), or touch other phases' files beyond adding exports/lines.
