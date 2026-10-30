// Artisan command output ($this->info / warn / error) — printed, and capturable in tests.
export const SUCCESS = 0;
export const FAILURE = 1;

export interface CommandIO {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export const consoleIO: CommandIO = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

/** Collects output lines as `level: message` (tests). */
export function bufferIO(): CommandIO & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (message) => lines.push(`info: ${message}`),
    warn: (message) => lines.push(`warn: ${message}`),
    error: (message) => lines.push(`error: ${message}`),
  };
}
