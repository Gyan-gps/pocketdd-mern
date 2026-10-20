# Cutover plan: Laravel → Express + Next.js

Both apps share one MySQL database. The safest path is to switch traffic gradually and keep Laravel ready to take it back
until the new stack has run cleanly in production.

## 0. Before anything touches production
1. **Get the real schema.** On the server, run `mysqldump --no-data -u <user> -p <db> > schema.sql`.
   - Diff `schema.sql` against the dev patch files (`api/scripts/schema/phase*.ts`).
   - Every column the port uses must exist in production. Any type that differs from what we inferred (TINYINT vs VARCHAR, JSON vs LONGTEXT) must be checked against the code that reads it.
   - **Never run `dev-schema-patch.ts` or `dev-seed.ts` against production.**
2. **Create the one new table** the Node app needs: `node_jobs`, the Node queue (definition in `api/scripts/schema/06-jobs.ts`). It is the only schema change for production.
3. **Re-run the parity suite against a copy of production.**
   - Restore the production dump into staging.
   - Run Laravel and Node side by side on it.
   - Run `npx tsx test/parity/run.ts`.
   - Real data hits branches our fixtures did not.
4. **Environment for the API:**
   - `DB_*`
   - `APP_URL` (used where Laravel calls `env('APP_URL')`)
     - ⚠ Check whether production Laravel runs `php artisan config:cache`. With a cached config, `env()` returns null,
       so model accessors (`category_icon`, `advertisment_icon`, `photo_url`…) produce `/uploads/...` instead of
       `http://host/uploads/...`. Node currently matches the **uncached** behaviour. If production is cached, set
       `APP_URL=` (empty) in the Node API so it matches; parity confirmed this is the only difference.
   - `URL_ROOT` if a proxy rewrites the Host header (Laravel `url()` uses the request host)
   - `LARAVEL_PUBLIC_PATH`: the same `public/` directory Laravel serves uploads from. It must be shared storage.
   - `FIREBASE_CREDENTIALS` and `FIREBASE_BASE_PATH`
   - `BCRYPT_ROUNDS=12`
   - `SESSION_LIFETIME=120`
   - `APP_DEBUG=false`

## 1. Run both side by side (no user impact)
- Deploy `api` (port 4000) and `web` (port 3000) next to Laravel.
- Turn off the Node jobs while Laravel still owns them: `SCHEDULER=false`, `QUEUE_WORKER=false`.
- Mirror a sample of real mobile traffic to Node (e.g. an Nginx `mirror` of GET/read endpoints only). Compare the responses offline.

## 2. Move the mobile API, a few endpoints at a time
- Nginx routes `/api/<endpoint>` to Node, one group at a time, in this order:
  1. read-only lookups (Phase 6, states and cities)
  2. home and listing (Phase 3)
  3. events and administration (Phase 5)
  4. auth (Phase 2)
  5. business writes (Phase 4)
- Sanctum tokens are shared through `personal_access_tokens`, so users stay logged in whichever app answers.
- Rollback for a group is a one-line Nginx revert.

## 3. Move jobs and the scheduler
- Pick one moment: stop Laravel's cron (`schedule:run`) and queue worker, then start Node with `SCHEDULER=true` and `QUEUE_WORKER=true`.
- Do not run both: the commands would run twice.
- Let Laravel's `jobs` table drain first.

## 4. Move the admin panel
- Point `/pocketddadmin` to Next.js (`web`). Admins log in again: Backpack sessions don't carry over.
- Keep Backpack reachable on an internal URL for a week as a fallback.

## 5. Retire Laravel
- After 2–4 weeks with no rollbacks, stop the Laravel containers.
- Keep the code archived. The `public/uploads` directory stays; Node writes there.

## Known behaviours the team should decide about (ported as-is, deliberately)
These are bugs in the current Laravel app. Fixing them in Node alone would break "identical behaviour", so fix them after cutover:
- `POST /api/get-all-categories` always throws "Testing API error logging".
- `search-business-sub-category` always errors because the model method it calls does not exist.
- Validation messages come back as raw keys (`validation.required`), because the app has no language files.
- Missing images serialise as `{}` (Laravel `url(null)`).
- Staff edits don't sync phone/status to `users`.
- Deleting or replacing a business image leaves the old file on disk.
- Editing an About-Us tourist place without re-uploading its image breaks the image.
- A helpline row with a NULL value makes the whole helpline list fail.
- Business edit with empty file inputs deletes the existing logo.
- `translate:cities-hindi` is not scheduled; the schedule entry is commented out in Laravel.

## Dev-environment notes
- Laravel is slow over the Windows bind mount (5–25 s per request). Don't use `php artisan optimize` to speed it up for parity runs: the config cache changes `env('APP_URL')` output (see above).
- The Laravel container's `public/uploads` was `chmod 777` for imports. Redo this if the container is recreated.
- The Node containers use file-watch polling, because Windows bind mounts don't deliver change events. If a page serves stale code, run `docker compose restart web` (or `api`).
