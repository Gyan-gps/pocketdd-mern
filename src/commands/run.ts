// Manual runner: `npx tsx src/commands/run.ts ads:expire` (≈ `php artisan ads:expire`).
// Jobs dispatched by a command are only enqueued; the API process's worker runs them.
import { disconnectDatabase } from '../config/database.js';
import { COMMANDS } from './index.js';
import { consoleIO } from './command-io.js';

const name = process.argv[2] ?? '';
const command = COMMANDS[name];
if (!command) {
  console.error(`Command "${name}" is not defined. Available: ${Object.keys(COMMANDS).join(', ')}`);
  process.exitCode = 1;
} else {
  process.exitCode = await command(consoleIO);
}
await disconnectDatabase();
