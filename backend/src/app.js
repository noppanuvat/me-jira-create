import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';
import { getConfig } from './config/env.js';

export function createApp() {
  const app = express();
  const config = getConfig();

  app.use(
    cors({
      origin: config.frontendOrigin || '*',
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', apiRouter);

  // Error handler
  app.use((err, req, res, _next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'FAILED',
      error: {
        message: err.message || 'Internal Server Error',
        details: err.details || null,
      },
    });
  });

  return app;
}
