// Artisan command output ($this->info / warn / error) — printed, and capturable in tests.
export const SUCCESS = 0;
export const FAILURE = 1;

export interface CommandIO {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export const consoleIO: CommandIO = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};

/** Collects output lines as `level: message` (tests). */
export function bufferIO(): CommandIO & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (m) => lines.push(`info: ${m}`),
    warn: (m) => lines.push(`warn: ${m}`),
    error: (m) => lines.push(`error: ${m}`),
  };
}
