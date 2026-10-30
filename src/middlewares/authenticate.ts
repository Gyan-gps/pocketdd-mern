// `auth:sanctum`: resolves the Bearer token to its user (req.user) or rejects the request.
import type { RequestHandler } from 'express';
import { userFromToken } from '../core/auth/access-tokens.js';

/** Laravel quirk kept: unauthenticated requests get HTTP 200 (bootstrap/app.php exception renderer). */
export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    const authorizationHeader = req.get('authorization') ?? '';
    const bearerToken = /^Bearer\s+(.+)$/i.exec(authorizationHeader)?.[1]?.trim();
    const authenticated = bearerToken ? await userFromToken(bearerToken) : null;
    if (!authenticated) {
      res.status(200).json({ message: 'Unauthentic user', status: false });
      return;
    }
    req.user = authenticated.user;
    req.tokenableType = authenticated.tokenableType;
    next();
  } catch (error) {
    next(error);
  }
};
