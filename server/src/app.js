import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { isDbConnected } from './db.js';
import { requireAuth } from './middleware/requireAuth.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { servicesRouter } from './routes/services.js';
import { internalRouter } from './routes/internal.js';
import { variablesRouter } from './routes/variables.js';
import { environmentsRouter } from './routes/environments.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', requireAuth);

  app.get('/api/health', (req, res) => {
    const db = isDbConnected();
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api', servicesRouter);
  app.use('/api/internal', internalRouter);
    app.use('/api', variablesRouter);
  app.use('/api', environmentsRouter);

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
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err.code === 11000) {
      return res.status(409).json({ error: 'That slug is already in use. Choose another one.' });
    }
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Not found.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}