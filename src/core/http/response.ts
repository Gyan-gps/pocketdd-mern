// Mirrors App\Http\Controllers\Api\ApiBaseController.

export type Payload = Record<string, unknown>;

/** `sendResponse()` — `{status, message}` merged with `data` when it is non-empty. */
export function sendResponse(status: boolean, message: string, data: Payload = {}): Payload {
  const res: Payload = { status, message };
  return Object.keys(data).length ? { ...res, ...data } : res;
}

/** `sendCatchLog()` — generic failure payload returned from catch blocks. */
export function sendCatchLog(error: string): Payload {
  return {
    status: false,
    message: 'Some error occurred.Please Try again later',
    error,
  };
}

/**
 * A PHP `\Error` (TypeError, etc.). Controllers catch only `\Exception`, so ports must rethrow this
 * from their catch blocks; it then reaches the failure logger and becomes a 500 like in Laravel.
 */
export class PhpError extends Error {
  exceptionClass = 'TypeError';
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
