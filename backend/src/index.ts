import { createApplication } from "@specific-dev/framework";
import type { FastifyError } from 'fastify';
import * as appSchema from './db/schema.js';
import * as authSchema from './db/auth-schema.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerRecordingRoutes } from './routes/recordings.js';
import { registerApiKeyRoutes } from './routes/api-keys.js';
import { registerExportRoutes } from './routes/export.js';

// Combine both schemas
const schema = { ...appSchema, ...authSchema };

// Create application with combined schema
export const app = await createApplication(schema);

// Export App type for use in route files
export type App = typeof app;

// Enable authentication with OAuth providers
// The framework handles OAuth proxying for Google, GitHub, and Apple automatically
// No need to configure credentials - just enable the providers
app.withAuth();

// Enable storage for file uploads
// Note: app.withStorage() automatically registers the multipart plugin with limits
app.withStorage();

// Error handler for auth-related errors
app.fastify.setErrorHandler(async (error: FastifyError, request, reply) => {
  app.logger.error({ err: error, path: request.url, method: request.method }, 'Request error');

  // Handle authentication errors
  if (error.statusCode === 401) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: error.message || 'Authentication required',
    });
  }

  if (error.statusCode === 403) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: error.message || 'Access denied',
    });
  }

  // Handle validation errors
  if (error.statusCode === 400) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: error.message || 'Invalid request',
      validation: (error as any).validation,
    });
  }

  // Default error response
  const statusCode = error.statusCode || 500;
  return reply.status(statusCode).send({
    error: error.name || 'Internal Server Error',
    message: error.message || 'An unexpected error occurred',
  });
});

// Register route modules
registerAuthRoutes(app);
registerProjectRoutes(app);
registerRecordingRoutes(app);
registerApiKeyRoutes(app);
registerExportRoutes(app);

await app.run();
app.logger.info('Application started successfully');
