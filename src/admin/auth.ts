// Admin panel authentication — replaces Backpack's session login (`/pocketddadmin/login`).
// Backpack: guard `backpack` → users provider, login by `email` + `password`, AuthenticatesUsers
// throttling (5 attempts / 60 s per email|ip), and CheckIfAdmin::checkIfUserIsAdmin() returns true
// for every user. Sessions last SESSION_LIFETIME (120 min, sliding); we use a Sanctum token with the
// same idle timeout, carried by the Next.js app in an httpOnly cookie.
import { Router, type RequestHandler } from 'express';
import { env } from '../config/env.js';
import { hashCheck } from '../core/auth/hash.js';
import { createToken, userFromToken } from '../core/auth/access-tokens.js';
import { trans } from '../core/i18n/translator.js';
import { validateRequest } from '../core/validation/validator.js';
import { CASE_INSENSITIVE } from '../db/eloquent.js';
import { intId, toRow, type Row } from '../db/mongo.js';
import { PersonalAccessToken, User } from '../models/index.js';
import { serializeUser } from '../serializers/user.serializer.js';
import { adminLoginValidation } from '../validators/admin/auth.validator.js';

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
    const bearerToken = /^Bearer\s+(.+)$/i.exec(req.get('authorization') ?? '')?.[1]?.trim();
    const separatorIndex = bearerToken?.indexOf('|') ?? -1;
    if (bearerToken && separatorIndex > 0) {
      const token = await PersonalAccessToken.findOne(
        { _id: intId(bearerToken.slice(0, separatorIndex)) },
        { _id: 0, name: 1, last_used_at: 1, created_at: 1 },
      ).lean<Row>();
      const lastUse = token && String(token.last_used_at ?? token.created_at);
      const fresh =
        token?.name === ADMIN_TOKEN_NAME &&
        lastUse &&
        Date.now() - Date.parse(lastUse.replace(' ', 'T') + '+05:30') < SESSION_LIFETIME_MIN * 60_000;
      if (fresh) {
        const auth = await userFromToken(bearerToken);
        if (auth) {
          req.user = auth.user;
          return next();
        }
      }
    }
    // CheckIfAdmin::respondToUnauthorizedRequest() for ajax/json requests
    // (trans('backpack::base.unauthorized') — lang/vendor/backpack/en/base.php).
    res.status(401).send('Unauthorized.');
  } catch (error) {
    next(error);
  }
};

export const adminAuthRoutes = Router();

adminAuthRoutes.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.input;
    const validation = await validateRequest(req.input, adminLoginValidation);
    if (validation.fails()) return void res.status(422).json({ message: validation.first(), errors: validation.all() });

    const key = throttleKey(email, req.ip);
    const attempt = attempts.get(key);
    if (attempt && attempt.resetAt > Date.now() && attempt.count >= MAX_ATTEMPTS) {
      const seconds = Math.ceil((attempt.resetAt - Date.now()) / 1000);
      const message = String(await trans('auth.throttle'))
        .replace(':seconds', String(seconds))
        .replace(':minutes', String(Math.ceil(seconds / 60)));
      return void res.status(429).json({ message, errors: { email: [message] } });
    }

    const user = toRow(
      await User.findOne({ email: String(email) }, null, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean<Row>(),
    );
    if (!user || !(await hashCheck(String(password), user.password as string))) {
      const current = attempt && attempt.resetAt > Date.now() ? attempt : { count: 0, resetAt: Date.now() + DECAY_SECONDS * 1000 };
      current.count++;
      attempts.set(key, current);
      const message = String(await trans('auth.failed'));
      return void res.status(422).json({ message, errors: { email: [message] } });
    }
    attempts.delete(key);
    const token = await createToken(Number(user.id), ADMIN_TOKEN_NAME);
    res.json({ token, user: serializeUser(user), expires_in_minutes: SESSION_LIFETIME_MIN });
  } catch (error) {
    next(error);
  }
});

adminAuthRoutes.post('/logout', adminAuth, async (req, res, next) => {
  try {
    const bearerToken = /^Bearer\s+(.+)$/i.exec(req.get('authorization') ?? '')![1]!;
    await PersonalAccessToken.deleteOne({ _id: intId(bearerToken.slice(0, bearerToken.indexOf('|'))) });
    res.json({ status: true });
  } catch (error) {
    next(error);
  }
});

adminAuthRoutes.get('/me', adminAuth, (req, res) => {
  res.json(serializeUser(req.user!));
});
