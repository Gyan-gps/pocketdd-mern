import type { Row } from '../db/pool.js';

declare global {
  namespace Express {
    interface Request {
      /** Trimmed, empty→null merge of query + body + uploaded files (`$request->all()`). */
      input: Record<string, unknown>;
      /** Laravel action name, used for `api_failures.api_name`. */
      apiName?: string;
      user?: Row;
      tokenableType?: string;
    }
  }
}

export {};
