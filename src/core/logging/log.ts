// Minimal Laravel `Log` facade stand-in for jobs/commands (Monolog LineFormatter shape, written to stdout/stderr):
//   [2025-06-19 10:30:00] local.INFO: message {"context":"json"}
import { nowDb } from '../time.js';

type Level = 'INFO' | 'WARNING' | 'ERROR';

/** Hook for tests: capture log lines instead of printing them. */
export const logSink: { lines: Array<{ level: Level; message: string; context: unknown }> | null } = { lines: null };

function write(level: Level, message: string, context: unknown = {}) {
  if (logSink.lines) {
    logSink.lines.push({ level, message, context });
    return;
  }
  const env = process.env.APP_ENV ?? 'local';
  const ctx = Array.isArray(context) ? context : context && typeof context === 'object' ? context : [context];
  const json = Object.keys(ctx as object).length ? ' ' + JSON.stringify(ctx) : ' []';
  const line = `[${nowDb()}] ${env}.${level}: ${message}${json}`;
  (level === 'ERROR' ? console.error : console.log)(line);
}

export const Log = {
  info: (message: string, context?: unknown) => write('INFO', message, context),
  warning: (message: string, context?: unknown) => write('WARNING', message, context),
  error: (message: string, context?: unknown) => write('ERROR', message, context),
};
