// Admin panel authentication — replaces Backpack's session login (`/pocketddadmin/login`).
// Backpack: guard `backpack` → users provider, login by `email` + `password`, AuthenticatesUsers
// throttling (5 attempts / 60 s per email|ip), and CheckIfAdmin::checkIfUserIsAdmin() returns true
// for every user. Sessions last SESSION_LIFETIME (120 min, sliding); we use a Sanctum token with the
// same idle timeout, carried by the Next.js app in an httpOnly cookie.
import { Router, type RequestHandler } from 'express';
import { env } from '../config/env.js';
import { hashCheck } from '../core/auth/hash.js';
import { createToken, userFromToken } from '../core/auth/sanctum.js';
import { trans } from '../core/i18n/translator.js';
import { validate } from '../core/validation/validator.js';
import { C, col, intId, toRow } from '../db/mongo.js';
import { serializeUser } from '../models/user.js';

export const ADMIN_TOKEN_NAME = 'admin-panel';
const SESSION_LIFETIME_MIN = env.sessionLifetimeMinutes;
const MAX_ATTEMPTS = 5;
const DECAY_SECONDS = 60;

const attempts = new Map<string, { count: number; resetAt: number }>();

function throttleKey(email: unknown, ip: string | undefined) {
  return `${String(email ?? '').toLowerCase()}|${ip ?? ''}`;
}

/** Sanctum token whose last use is older than the session lifetime counts as logged out. */
export const adminAuth: RequestHandler = async (req, res, next) => {
  try {
    const raw = /^Bearer\s+(.+)$/i.exec(req.get('authorization') ?? '')?.[1]?.trim();
    const sep = raw?.indexOf('|') ?? -1;
    if (raw && sep > 0) {
      const token = await col(C.tokens).findOne(
        { _id: intId(raw.slice(0, sep)) } as never,
        { projection: { _id: 0, name: 1, last_used_at: 1, created_at: 1 } },
      );
      const lastUse = token && String(token.last_used_at ?? token.created_at);
      const fresh =
        token?.name === ADMIN_TOKEN_NAME &&
        lastUse &&
        Date.now() - Date.parse(lastUse.replace(' ', 'T') + '+05:30') < SESSION_LIFETIME_MIN * 60_000;
      if (fresh) {
        const auth = await userFromToken(raw);
        if (auth) {
          req.user = auth.user;
          return next();
        }
      }
    }
    // CheckIfAdmin::respondToUnauthorizedRequest() for ajax/json requests
    // (trans('backpack::base.unauthorized') — lang/vendor/backpack/en/base.php).
    res.status(401).send('Unauthorized.');
  } catch (e) {
    next(e);
  }
};

export const adminAuthRoutes = Router();

adminAuthRoutes.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.input;
    const v = await validate(req.input, { email: 'required|string', password: 'required|string' });
    if (v.fails()) return void res.status(422).json({ message: v.first(), errors: v.all() });

    const key = throttleKey(email, req.ip);
    const a = attempts.get(key);
    if (a && a.resetAt > Date.now() && a.count >= MAX_ATTEMPTS) {
      const seconds = Math.ceil((a.resetAt - Date.now()) / 1000);
      const msg = String(await trans('auth.throttle')).replace(':seconds', String(seconds)).replace(':minutes', String(Math.ceil(seconds / 60)));
      return void res.status(429).json({ message: msg, errors: { email: [msg] } });
    }

    const user = toRow(
      await col(C.users).findOne({ email: String(email) }, { collation: { locale: 'en', strength: 2 }, sort: { _id: 1 } }),
    );
    if (!user || !(await hashCheck(String(password), user.password as string))) {
      const cur = a && a.resetAt > Date.now() ? a : { count: 0, resetAt: Date.now() + DECAY_SECONDS * 1000 };
      cur.count++;
      attempts.set(key, cur);
      const msg = String(await trans('auth.failed'));
      return void res.status(422).json({ message: msg, errors: { email: [msg] } });
    }
    attempts.delete(key);
    const token = await createToken(Number(user.id), ADMIN_TOKEN_NAME);
    res.json({ token, user: serializeUser(user), expires_in_minutes: SESSION_LIFETIME_MIN });
  } catch (e) {
    next(e);
  }
});

adminAuthRoutes.post('/logout', adminAuth, async (req, res, next) => {
  try {
    const raw = /^Bearer\s+(.+)$/i.exec(req.get('authorization') ?? '')![1]!;
    await col(C.tokens).deleteOne({ _id: intId(raw.slice(0, raw.indexOf('|'))) } as never);
    res.json({ status: true });
  } catch (e) {
    next(e);
  }
});

adminAuthRoutes.get('/me', adminAuth, (req, res) => {
  res.json(serializeUser(req.user!));
});
