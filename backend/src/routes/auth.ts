import type { FastifyRequest, FastifyReply } from 'fastify';
import type { App } from '../index.js';
import {
  sendAuthError,
  sendAuthSuccess,
  AUTH_ERRORS,
  getAvailableProviders,
  sanitizeUser,
} from '../services/auth-helper.js';

export function registerAuthRoutes(app: App) {
  const requireAuth = app.requireAuth();
  const fastify = app.fastify;

  // GET /api/auth/status - Get current session status
  fastify.get(
    '/api/auth/status',
    {
      schema: {
        description: 'Get current authentication status',
        tags: ['auth'],
        response: {
          200: {
            type: 'object',
            properties: {
              authenticated: { type: 'boolean' },
              user: { type: 'object' },
              providers: { type: 'array' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const session = await requireAuth(request, reply);

        if (!session) {
          app.logger.debug('No active session');
          return sendAuthSuccess(reply, 200, {
            authenticated: false,
            user: null,
            providers: getAvailableProviders(),
          });
        }

        app.logger.info({ userId: session.user.id }, 'Session status retrieved');
        return sendAuthSuccess(reply, 200, {
          authenticated: true,
          user: sanitizeUser(session.user),
          session: {
            id: session.session.id,
            expiresAt: session.session.expiresAt,
          },
          providers: getAvailableProviders(),
        });
      } catch (error) {
        app.logger.error({ err: error }, 'Error checking auth status');
        return sendAuthSuccess(reply, 200, {
          authenticated: false,
          user: null,
          providers: getAvailableProviders(),
        });
      }
    }
  );

  // GET /api/auth/user - Get current user (requires auth)
  fastify.get(
    '/api/auth/user',
    {
      schema: {
        description: 'Get current authenticated user',
        tags: ['auth'],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
              image: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const session = await requireAuth(request, reply);
        if (!session) {
          return sendAuthError(
            reply,
            AUTH_ERRORS.UNAUTHORIZED.statusCode,
            AUTH_ERRORS.UNAUTHORIZED.error,
            AUTH_ERRORS.UNAUTHORIZED.message
          );
        }

        app.logger.info({ userId: session.user.id }, 'User info retrieved');
        return sendAuthSuccess(reply, 200, sanitizeUser(session.user));
      } catch (error) {
        app.logger.error({ err: error }, 'Error fetching user info');
        return sendAuthError(
          reply,
          AUTH_ERRORS.INTERNAL_ERROR.statusCode,
          AUTH_ERRORS.INTERNAL_ERROR.error,
          AUTH_ERRORS.INTERNAL_ERROR.message
        );
      }
    }
  );

  // POST /api/auth/logout - Sign out current user
  fastify.post(
    '/api/auth/logout',
    {
      schema: {
        description: 'Sign out current user',
        tags: ['auth'],
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const session = await requireAuth(request, reply);
        if (!session) {
          return sendAuthError(
            reply,
            AUTH_ERRORS.UNAUTHORIZED.statusCode,
            AUTH_ERRORS.UNAUTHORIZED.error,
            AUTH_ERRORS.UNAUTHORIZED.message
          );
        }

        app.logger.info({ userId: session.user.id }, 'User signed out');
        return sendAuthSuccess(reply, 200, { success: true, message: 'Signed out successfully' });
      } catch (error) {
        app.logger.error({ err: error }, 'Error during logout');
        return sendAuthError(
          reply,
          AUTH_ERRORS.INTERNAL_ERROR.statusCode,
          AUTH_ERRORS.INTERNAL_ERROR.error,
          AUTH_ERRORS.INTERNAL_ERROR.message
        );
      }
    }
  );

  // GET /api/auth/providers - Get available OAuth providers
  fastify.get(
    '/api/auth/providers',
    {
      schema: {
        description: 'Get list of available OAuth providers',
        tags: ['auth'],
        response: {
          200: {
            type: 'object',
            properties: {
              providers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    enabled: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      app.logger.debug('Fetching available OAuth providers');
      return sendAuthSuccess(reply, 200, {
        providers: getAvailableProviders().map((id) => {
          const provider = {
            google: { id: 'google', name: 'Google', enabled: true },
            github: { id: 'github', name: 'GitHub', enabled: true },
            apple: { id: 'apple', name: 'Apple', enabled: true },
          }[id as string];
          return provider;
        }),
      });
    }
  );
}
