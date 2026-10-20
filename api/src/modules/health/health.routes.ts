import { Router } from 'express';
import { action } from '../../core/http/route.js';
import { all, first } from '../../db/pool.js';

const router = Router();

router.get(
  '/health',
  action(
    'Health',
    async () => {
      const row = await first('SELECT VERSION() AS version');
      const tables = await all('SHOW TABLES');
      return { ok: true, mysql: row?.version, tables: tables.length };
    },
    { logFailures: false },
  ),
);

export default router;
