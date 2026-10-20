// Screenshots the same admin pages in Backpack (Laravel) and the Next.js admin for side-by-side comparison.
//
//   docker compose -f tools/ui-compare/docker-compose.yml run --rm capture [page ...]
//
// Output: tools/ui-compare/shots/<page>.laravel.png and <page>.next.png
import fs from 'node:fs';
import { chromium } from 'playwright';

const LARAVEL = process.env.LARAVEL_URL ?? 'http://laravel.test';
const NEXT = process.env.NEXT_URL ?? 'http://web:3000';
const EMAIL = process.env.ADMIN_EMAIL ?? 'parity-admin@pocketdd.test';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'parity-secret-123';
const OUT = new URL('./shots/', import.meta.url).pathname;

// Admin pages to compare (path under /pocketddadmin). Pass names on the CLI to capture a subset.
const PAGES = {
  login: 'login',
  dashboard: 'dashboard',
  'department-list': 'department',
  'department-create': 'department/create',
  'department-edit': 'department/800/edit',
  'department-show': 'department/800/show',
  'category-list': 'business-category',
  'category-create': 'business-category/create',
  'business-list': 'business',
  'business-create': 'business/create',
  'staff-list': 'business-user',
  'event-list': 'event',
  'ad-list': 'advertisment',
  'helpline-list': 'city-helpline-number',
  'officer-list': 'administrator',
  'address-list': 'address',
  'pincode-list': 'pincode',
  'about-us-list': 'about-us',
};

const only = process.argv.slice(2);
const pages = Object.entries(PAGES).filter(([name]) => !only.length || only.includes(name));
fs.mkdirSync(OUT, { recursive: true });

async function login(page, base) {
  await page.goto(`${base}/pocketddadmin/login`, { timeout: 300_000 });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(/dashboard/, { timeout: 300_000 });
  } catch (e) {
    await page.screenshot({ path: `${OUT}login-failed.${base.includes('laravel') ? 'laravel' : 'next'}.png`, fullPage: true });
    throw e;
  }
}

/**
 * Wait until the page has finished its own loading: Backpack fills the DataTable and the charts over AJAX
 * behind a translucent overlay, so "load" alone is too early.
 */
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 300_000 }).catch(() => {});
  await page
    .waitForFunction(
      () => {
        const busy = [...document.querySelectorAll('.dataTables_processing, #crudTable_processing, .loader, .spinner-border')];
        return busy.every((el) => getComputedStyle(el).display === 'none' || el.offsetParent === null);
      },
      { timeout: 300_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(2_000); // fade-in transitions
}

const browser = await chromium.launch();
// TARGETS=next re-captures only the Next.js side (Backpack's look doesn't change between iterations).
const targets = (process.env.TARGETS ?? 'laravel,next').split(',');
for (const [label, base] of [
  ['laravel', LARAVEL],
  ['next', NEXT],
].filter(([label]) => targets.includes(label))) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // Surface client-side failures (hydration errors, chart crashes) next to the screenshots.
  page.on('pageerror', (e) => console.warn(`[${label}] pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => m.type() === 'error' && console.warn(`[${label}] console: ${m.text().slice(0, 200)}`));
  // The login page is captured logged out.
  if (pages.some(([n]) => n === 'login')) {
    await page.goto(`${base}/pocketddadmin/login`, { timeout: 300_000 });
    await page.screenshot({ path: `${OUT}login.${label}.png`, fullPage: true });
  }
  await login(page, base);
  for (const [name, path] of pages) {
    if (name === 'login') continue;
    try {
      await page.goto(`${base}/pocketddadmin/${path}`, { timeout: 300_000, waitUntil: 'load' });
    } catch (e) {
      console.warn(`[${label}] ${name}: ${e.message.split('\n')[0]}`);
    }
    await settle(page);
    await page.screenshot({ path: `${OUT}${name}.${label}.png`, fullPage: true });
    console.log(`[${label}] ${name}`);
  }
  await ctx.close();
}
await browser.close();
