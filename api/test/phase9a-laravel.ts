// Minimal Backpack (Laravel) browser client for PHP-vs-Node DB comparisons (phase 9A).
// Logs in through /pocketddadmin/login (CSRF + session cookie) and submits forms like the browser does.
const LARAVEL = process.env.LARAVEL_URL ?? 'http://laravel.test';
export const PARITY_EMAIL = 'parity-admin@pocketdd.test';
export const PARITY_PASSWORD = 'parity-secret-123';

export class Backpack {
  private cookies = new Map<string, string>();
  csrf = '';

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv!.indexOf('=');
      this.cookies.set(kv!.slice(0, i), kv!.slice(i + 1));
    }
  }

  async get(path: string) {
    const res = await fetch(LARAVEL + path, { headers: { Cookie: this.cookieHeader() }, redirect: 'manual' });
    this.store(res);
    const text = await res.text();
    const m = /name="_token" value="([^"]+)"/.exec(text) ?? /<meta name="csrf-token" content="([^"]+)"/.exec(text);
    if (m) this.csrf = m[1]!;
    return { status: res.status, text, location: res.headers.get('location') };
  }

  /** Submit a form. `fields` values: string, or {file: Buffer, name, type} for uploads. */
  async submit(path: string, fields: Array<[string, string | { file: Buffer; name: string; type: string }]>, method?: 'PUT') {
    const fd = new FormData();
    fd.append('_token', this.csrf);
    if (method) fd.append('_method', method);
    for (const [k, v] of fields) {
      if (typeof v === 'string') fd.append(k, v);
      else fd.append(k, new Blob([new Uint8Array(v.file)], { type: v.type }), v.name);
    }
    const res = await fetch(LARAVEL + path, {
      method: 'POST',
      body: fd,
      headers: { Cookie: this.cookieHeader(), Accept: 'text/html' },
      redirect: 'manual',
    });
    this.store(res);
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  }

  async login(email = PARITY_EMAIL, password = PARITY_PASSWORD) {
    await this.get('/pocketddadmin/login');
    const r = await this.submit('/pocketddadmin/login', [
      ['email', email],
      ['password', password],
    ]);
    if (r.status !== 302 || r.location?.includes('/login')) throw new Error(`Backpack login failed (${r.status} ${r.location})`);
    return this;
  }

  /** Validation errors flashed into the session, read back from the redirected form page. */
  async errorsOn(path: string): Promise<string[]> {
    const page = await this.get(path);
    // Backpack's create/edit page lists every message in an alert box.
    return [...page.text.matchAll(/<li><i class="la la-info-circle"><\/i>\s*([^<]+?)\s*<\/li>/g)].map((m) =>
      m[1]!.replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    );
  }
}
