# Laravel → Express + Next.js migration plan

Source: `../pocketdd-admin` (Laravel 12 + Backpack PRO). Target: `api/` (Express, TS) and `web/` (Next.js admin, TS).
Both run against the **same MySQL** (Sail container). Rule for every phase: identical URLs, request fields,
validation messages, JSON shapes and DB writes — the mobile app must not notice the switch.

| Phase | Scope | Laravel source | Status |
|---|---|---|---|
| 1 | Foundation: Laravel-compatible core | `ApiBaseController`, `LogApiFailures`, `ApiErrorLogger`, Sanctum, TrimStrings/ConvertEmptyStringsToNull, validator messages | ✅ done |
| 2 | Auth & location APIs (17 endpoints) | `Api/AuthController` + `GET /user` | ✅ 47/47 parity |
| 3 | Home, categories, business listing APIs | `Api/ApiController` | ✅ 71/71 parity |
| 4 | Business, images, locations, profile APIs (uploads) | `Api/BusinessController`, `BusinessLocationController`, `BusinessUserProfileController` | ✅ 107/107 parity |
| 5 | Events, administration, notifications APIs | `Api/EventController`, `AdministrationController`, `NotificationController` | ✅ 57/57 parity (500 debug trace ignored) |
| 6 | Admin-panel helper GET APIs (25 routes) | `routes/api.php` "ADMIN PANEL Routes" + `General::quickTranslate` | ✅ 196/196 parity |
| 7 | Jobs + scheduler + FirebaseService | `app/Jobs/*`, `Console/Commands/*` (ads:expire, notifications:send-scheduled, translate:cities-hindi) | ✅ 19/19 tests; PHP-vs-Node identical DB rows + FCM payloads |
| 8 | Admin login, layout, generic CRUD engine + Department reference screen | Backpack auth, `CheckIfAdmin` (every user is admin), menu_items.blade.php, `DepartmentCrudController` | ✅ 10/10 API tests, pages verified |
| 9 | Admin CRUD screens (24 routed) + imports + charts | `Admin/*CrudController`, `Imports/*`, `Charts/*` | ✅ 85/85 tests; Backpack-vs-Node DB rows identical |
| 10 | Parity testing & cutover | record Laravel responses → diff against Node; Nginx switch; retire Laravel | ✅ final run 478/478 API parity, 127/127 tests; plan in CUTOVER.md |

## Phase 1 — core (`api/src/core/`)
- `http/respond.ts` – `sendResponse()` / `sendCatchLog()` (same keys & merge semantics as `ApiBaseController`).
- `http/input.ts` – trims strings, `''` → `null`, merges query + body (+ multipart fields) into `req.input`.
- `http/route.ts` – `action('Controller@method', handler)`: names the route (for `api_failures.api_name`),
  logs uncaught errors to `api_failures`, returns 500.
- `validation/validator.ts` – Laravel rule strings (`required|digits:10`), Laravel 12 default messages,
  custom messages, `field.*` wildcards, `errors.first()` ordering.
- `auth/sanctum.ts` – reads/creates Sanctum tokens (`id|<40 random><crc32b>`, sha256 stored);
  unauthenticated → HTTP 200 `{"message":"Unauthentic user","status":false}`.
- `auth/hash.ts` – bcrypt `$2y$`, 12 rounds (Laravel compatible both ways).
- `time.ts` – IST `now()` for DB writes, Eloquent-style UTC ISO (`…000000Z`) for model JSON.
- `url.ts` – Laravel `url()` (request root) and `env('APP_URL')` helpers.
- `logging/apiFailure.ts` – `api_failures` insert (password/token fields stripped).

## ⚠ Known blocker
The local DB is behind production: tables `otp_verifications`, `app_versions`, `ad_user_views` and columns
like `users.fcm_token`, `users.user_icon`, `pincodes.state_hi` are missing (no migrations exist for them).
Ports are written against the PHP code; **verifying them locally needs a structure-only dump of production**
(`mysqldump --no-data`).

## Laravel quirks preserved on purpose
- `POST /api/get-all-categories` throws `Testing API error logging` first thing — always returns the error
  payload. Cloned as-is; remove in both apps together when the business decides.

## Phase 7 notes (cutover-relevant)
- Real Laravel schedule (`php artisan schedule:list`): `ads:expire` 00:00 and `notifications:send-scheduled` 10:00 IST.
  `App\Console\Kernel` is never loaded in Laravel 12 and the translate entry in routes/console.php is commented out,
  so `translate:cities-hindi` is **not** scheduled (manual: `npx tsx src/commands/run.ts translate:cities-hindi`).
- Node runs its own queue (`node_jobs`) and scheduler in the API process (`QUEUE_WORKER`, `SCHEDULER` env, default on).
  **While both apps run in production, disable one scheduler** (Laravel cron or `SCHEDULER=false`) or commands run twice.
- Firebase: credentials via `FIREBASE_CREDENTIALS` (relative to `FIREBASE_BASE_PATH`); FCM token cached in memory.

## Phase 9 progress
- 9C ✅ business-user (Staff), business-user-location, event, event-detail, event-location — 15/15 tests; Backpack-vs-Node
  DB rows identical for every create/update (incl. uploads, users row sync, SendEventNotification args); 22 pages render.
  Not reproduced: ckeditor (plain textarea), event_time edit default, translation-locale switcher on event-detail.
- 9B ✅ business-category (+ import), business-sub-category (+ import), advertisment (SendAdvertisementNotification),
  slider (+ reorder), location — 21/21 tests; Backpack-vs-Node DB rows identical for creates/updates/imports.
  No deps (own xlsx reader in api/src/admin/xlsx.ts). Dev-only: `chmod -R 777 public/uploads` in the Laravel container.
  Not reproduced: upload "clear" button, slider from_date default, nested reorder.
- 9D ✅ designation, administrator, city-helpline-number, address, about-us, pincode (+ Excel import), dashboard widgets
  + 4 charts — 26/26 tests; Backpack list/search output, all 4 chart JSONs and 5 create forms identical to Laravel.
  Core change: validator now checks wildcard rules after plain fields (Laravel order) → re-run all parity in Phase 10.
  Not compared row-by-row: pincode update and import (Laravel's import folder missing locally).
