import type { Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env.js';
import { logApiFailure } from '../logging/api-failure.js';

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

const CONTROLLER_NS = 'App\\Http\\Controllers\\';

/**
 * Wrap a ported controller action.
 * - `name` is the Laravel action (`Api\\AuthController@sendLoginOtp`), stored as `api_failures.api_name`.
 * - A returned plain object is sent as JSON (Laravel turns returned arrays into JSON responses).
 * - Uncaught errors are logged (`log.api.failures` middleware) and answered with a 500.
 */
export function action(name: string, handler: Handler, opts: { logFailures?: boolean } = {}): RequestHandler {
  const logFailures = opts.logFailures ?? true;
  return async (req, res) => {
    // Route names (`api.test.error`) are used as-is; controller actions get the full class name.
    req.apiName = name.includes('@') ? CONTROLLER_NS + name : name;
    try {
      const result = await handler(req, res);
      if (!res.headersSent && result !== undefined) res.json(result);
    } catch (error) {
      if (logFailures) await logApiFailure(error, req);
      console.error(`[${name}]`, error);
      if (res.headersSent) return;
      const err = error as Error;
      res.status(500).json(
        env.debug ? { message: err.message, exception: err.name } : { message: 'Server Error' },
      );
    }
  };
}
