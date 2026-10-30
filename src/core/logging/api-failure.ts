import type { Request } from 'express';
import { insertRow } from '../../db/mongo.js';
import { ApiFailure } from '../../models/index.js';
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
    const data = Object.fromEntries(Object.entries(req.input ?? {}).filter(([key]) => !STRIP.includes(key)));
    const now = nowDb();
    await insertRow(ApiFailure.collection.collectionName, {
      api_name: req.apiName ?? req.path.replace(/^\//, ''),
      method: req.method,
      request_url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      user_id: req.user?.id ?? null,
      device_id: req.get(opts.deviceHeader ?? 'device-id') ?? null,
      error_message: opts.customMessage || err.message,
      exception_class: (err as { exceptionClass?: string }).exceptionClass ?? 'Exception',
      status_code: (err as { statusCode?: number }).statusCode ?? 500,
      request_data: JSON.stringify(data),
      ip_address: req.ip ?? null,
      created_at: now,
      updated_at: now,
    });
  } catch (loggingError) {
    console.error('API Failure Logger Error', {
      message: loggingError instanceof Error ? loggingError.message : loggingError,
      original_exception: error instanceof Error ? error.message : error,
    });
  }
}
