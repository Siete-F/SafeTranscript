import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';

export function registerApiKeyRoutes(app: App) {
  const requireAuth = app.requireAuth();
  const fastify = app.fastify;

  // GET /api/api-keys - Get masked API keys
  fastify.get(
    '/api/api-keys',
    {
      schema: {
        description: 'Get masked API keys',
        tags: ['api-keys'],
        response: {
          200: {
            type: 'object',
            properties: {
              openaiKey: { type: 'string' },
              geminiKey: { type: 'string' },
              mistralKey: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id }, 'Fetching API keys');

      const apiKeys = await app.db.query.apiKeys.findFirst({
        where: eq(schema.apiKeys.userId, session.user.id),
      });

      // Return masked keys
      const masked: Record<string, string | undefined> = {
        openaiKey: apiKeys?.openaiKey ? maskKey(apiKeys.openaiKey) : undefined,
        geminiKey: apiKeys?.geminiKey ? maskKey(apiKeys.geminiKey) : undefined,
        mistralKey: apiKeys?.mistralKey ? maskKey(apiKeys.mistralKey) : undefined,
      };

      app.logger.info({ userId: session.user.id }, 'API keys fetched successfully');
      return masked;
    }
  );

  // PUT /api/api-keys - Update API keys
  interface UpdateApiKeysBody {
    openaiKey?: string;
    geminiKey?: string;
    mistralKey?: string;
  }

  fastify.put<{ Body: UpdateApiKeysBody }>(
    '/api/api-keys',
    {
      schema: {
        description: 'Update API keys',
        tags: ['api-keys'],
        body: {
          type: 'object',
          properties: {
            openaiKey: { type: 'string' },
            geminiKey: { type: 'string' },
            mistralKey: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: UpdateApiKeysBody }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id }, 'Updating API keys');

      const { openaiKey, geminiKey, mistralKey } = request.body;

      try {
        // Find existing record
        let apiKeyRecord = await app.db.query.apiKeys.findFirst({
          where: eq(schema.apiKeys.userId, session.user.id),
        });

        if (!apiKeyRecord) {
          // Create new record if doesn't exist
          // Provide explicit values for id/timestamps to avoid DEFAULT keyword
          const now = new Date();
          const updates: any = {
            id: crypto.randomUUID(),
            userId: session.user.id,
            createdAt: now,
            updatedAt: now,
          };
          if (openaiKey) updates.openaiKey = openaiKey;
          if (geminiKey) updates.geminiKey = geminiKey;
          if (mistralKey) updates.mistralKey = mistralKey;

          await app.db.insert(schema.apiKeys).values(updates);
          app.logger.info({ userId: session.user.id }, 'API keys created successfully');
        } else {
          // Update existing record
          const updates: any = {};
          if (openaiKey !== undefined) updates.openaiKey = openaiKey;
          if (geminiKey !== undefined) updates.geminiKey = geminiKey;
          if (mistralKey !== undefined) updates.mistralKey = mistralKey;

          if (Object.keys(updates).length > 0) {
            await app.db
              .update(schema.apiKeys)
              .set(updates)
              .where(eq(schema.apiKeys.userId, session.user.id));

            app.logger.info({ userId: session.user.id }, 'API keys updated successfully');
          }
        }

        return { success: true };
      } catch (error) {
        app.logger.error({ userId: session.user.id, err: error }, 'Failed to update API keys');
        return reply.status(500).send({ error: 'Failed to update API keys' });
      }
    }
  );
}

// Helper function to mask API keys
function maskKey(key: string): string {
  if (!key || key.length < 8) {
    return '****';
  }
  return key.substring(0, 4) + '****';
}
