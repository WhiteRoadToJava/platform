import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { isDbConnected } from './db.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    const db = isDbConnected();
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (config.NODE_ENV === 'production') {
    const webDist = path.resolve(import.meta.dirname, '../../web/dist');
    app.use(express.static(webDist));
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}