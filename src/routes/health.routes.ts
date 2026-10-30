import { Router } from 'express';
import { action } from '../core/http/action.js';
import { db } from '../db/mongo.js';

const router = Router();

router.get(
  '/health',
  action(
    'Health',
    async () => {
      const info = await db().command({ buildInfo: 1 });
      const collections = await db().listCollections().toArray();
      return { ok: true, mongodb: info.version, collections: collections.length };
    },
    { logFailures: false },
  ),
);

export default router;
