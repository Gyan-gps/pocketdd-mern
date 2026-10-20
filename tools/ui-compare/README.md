# UI compare: Backpack (Laravel) vs the Next.js admin

Screenshots the same admin pages in both apps with Playwright, so differences can be checked side by side.

## Run

From `pocketdd-node/`, with both stacks up (`pocketdd-admin` and `pocketdd-node` docker compose):

```bash
# every page, both apps (Laravel is slow locally: allow a few minutes)
docker compose -f tools/ui-compare/docker-compose.yml run --rm capture

# a subset of pages
docker compose -f tools/ui-compare/docker-compose.yml run --rm capture dashboard department-list

# only the Next.js side (Backpack's look doesn't change between iterations)
TARGETS=next docker compose -f tools/ui-compare/docker-compose.yml run --rm capture
```

Screenshots land in `tools/ui-compare/shots/<page>.laravel.png` and `<page>.next.png` (git-ignored).
Browser errors (`pageerror`, console errors) are printed next to each page.

Page names and paths are listed in `PAGES` in [capture.mjs](capture.mjs). Both apps are logged into with the seeded test
admin (`parity-admin@pocketdd.test`, from `api/scripts/seed/07-admin-auth.ts`).

## Notes
- The script waits for each page to settle (network idle, DataTables / chart spinners gone), since Backpack
  loads its tables and charts over AJAX.
- `web/next.config.ts` allows the dev origin `web`, because the Playwright container reaches Next.js as `http://web:3000`.
- The Next.js dev server sometimes misses file changes on Windows bind mounts. Run `docker compose restart web`
  before capturing if a page looks stale.
- Known Backpack-side errors you'll see in the output, which are bugs in the current Laravel app, not the port:
  `crud.field is not a function` on the category and staff forms.
