import express, { Express } from 'express';
import { setupMiddlewares } from './middlewares/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';
import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { documentRoutes } from './routes/document.routes.js';
import { invoiceRoutes } from './routes/invoice.routes.js';
import { emailRoutes } from './routes/email.routes.js';

const createApp = (): Express => {
  const app = express();

  // Setup middlewares
  setupMiddlewares(app);

  // Health check route (before API routes)
  app.use('/health', healthRoutes);

  // API routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/documents', documentRoutes);
  app.use('/api/v1/invoices', invoiceRoutes);
  app.use('/api/v1/email', emailRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
};

export default createApp;

