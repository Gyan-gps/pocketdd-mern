import type { Request } from 'express';
import { exec } from '../../db/pool.js';
import { nowDb } from '../time.js';

const STRIP = ['password', 'password_confirmation', 'token', 'access_token', 'refresh_token', 'authorization', 'api_token'];

/**
 * Insert into `api_failures` (App\Services\ApiFailureLogger / App\Traits\ApiErrorLogger).
 * The middleware variant reads the `device-id` header, the trait variant `X-Device-ID`.
 */
export async function logApiFailure(
  error: unknown,
  req: Request,
  opts: { deviceHeader?: 'device-id' | 'x-device-id'; customMessage?: string } = {},
): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const data = Object.fromEntries(Object.entries(req.input ?? {}).filter(([k]) => !STRIP.includes(k)));
    const now = nowDb();
    await exec(
      `INSERT INTO api_failures
        (api_name, method, request_url, user_id, device_id, error_message, exception_class,
         status_code, request_data, ip_address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.apiName ?? req.path.replace(/^\//, ''),
        req.method,
        `${req.protocol}://${req.get('host')}${req.originalUrl}`,
        req.user?.id ?? null,
        req.get(opts.deviceHeader ?? 'device-id') ?? null,
        opts.customMessage || err.message,
        (err as { exceptionClass?: string }).exceptionClass ?? 'Exception',
        (err as { statusCode?: number }).statusCode ?? 500,
        JSON.stringify(data),
        req.ip ?? null,
        now,
        now,
      ],
    );
  } catch (loggingError) {
    console.error('API Failure Logger Error', {
      message: loggingError instanceof Error ? loggingError.message : loggingError,
      original_exception: error instanceof Error ? error.message : error,
    });
  }
}
