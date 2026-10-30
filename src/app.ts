import cors from 'cors';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { env } from './config/env.js';
import { adminRoutes } from './admin/index.js';
import { normalizeInput } from './middlewares/normalize-input.js';
import { errorHandler } from './middlewares/error-handler.js';
import { routes } from './routes/index.js';

export const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
// Uploaded files (business images, logos, ads…), previously served by Laravel from public/.
// Image URLs are built from APP_URL, so APP_URL must point at this API.
app.use('/uploads', express.static(path.join(env.publicPath, 'uploads')));
app.use('/images', express.static(path.join(env.publicPath, 'images')));
// multipart/form-data: text fields → req.body, files → req.files (kept in memory until a module stores them).
app.use(multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }).any());
app.use(normalizeInput);
// Admin panel API (replaces Backpack's server-rendered /pocketddadmin routes).
app.use('/api/admin', adminRoutes);
app.use('/api', routes);
app.use(errorHandler);
