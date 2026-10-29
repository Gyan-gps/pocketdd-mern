export interface ParityCase {
  name: string;
  method?: 'GET' | 'POST';
  /** e.g. '/api/get-all-states' */
  path: string;
  body?: Record<string, unknown>;
  /** 'json' (default) or 'form' (application/x-www-form-urlencoded, like the mobile app). */
  as?: 'json' | 'form';
  /** Bearer token; '$TOKEN' is replaced with a fresh Sanctum token for the first user. */
  token?: string;
  headers?: Record<string, string>;
  /** Dotted JSON paths (`*` = any key) whose values differ per call — compared by type only. */
  volatile?: string[];
  /**
   * Optional multipart uploads (field name → file). When set, the request is sent as multipart/form-data:
   * `body` entries become text fields (arrays as `key[]`) and these files are attached.
   */
  files?: Record<string, { name: string; type: string; content: string | Uint8Array }>;
  /** Runs before each side's request, e.g. to reset rows the endpoint mutates. */
  before?: () => Promise<void>;
}
