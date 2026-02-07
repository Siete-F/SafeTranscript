import { createApplication } from "@specific-dev/framework";
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

// Enable authentication and storage
app.withAuth();
app.withStorage();

// Register route modules
registerProjectRoutes(app);
registerRecordingRoutes(app);
registerApiKeyRoutes(app);
registerExportRoutes(app);

await app.run();
app.logger.info('Application running');
