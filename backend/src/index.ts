import { createApplication } from "@specific-dev/framework";
import type { FastifyError } from 'fastify';
import * as appSchema from './db/schema.js';
import * as authSchema from './db/auth-schema.js';
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

// Log that app is initialized
console.log('Application instance created');

// Enable authentication with OAuth providers
// The framework handles OAuth proxying for Google, GitHub, and Apple automatically
// No need to configure credentials - just enable the providers
// IMPORTANT: Better Auth registers its own routes at /api/auth/*
// Do NOT register custom routes that conflict with Better Auth paths
app.withAuth();
console.log('Better Auth enabled');

// Enable storage for file uploads
// Note: app.withStorage() automatically registers the multipart plugin with limits
app.withStorage();
console.log('Storage enabled');

// Error handler for general application errors
// Note: This should not interfere with Better Auth's error handling
app.fastify.setErrorHandler(async (error: FastifyError, request, reply) => {
  app.logger.error(
    {
      err: error,
      path: request.url,
      method: request.method,
      statusCode: error.statusCode,
      message: error.message
    },
    'Request error'
  );

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

// Register custom route modules
// IMPORTANT: These should NOT conflict with /api/auth/* paths (Better Auth reserves these)
registerProjectRoutes(app);
registerRecordingRoutes(app);
registerApiKeyRoutes(app);
registerExportRoutes(app);

console.log('Custom routes registered');

await app.run();
app.logger.info('Application started successfully - Better Auth endpoints available at /api/auth/*');
