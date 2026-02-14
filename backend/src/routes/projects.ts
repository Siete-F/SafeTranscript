import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { NewProject } from '../db/schema.js';
import type { App } from '../index.js';

export function registerProjectRoutes(app: App) {
  const requireAuth = app.requireAuth();
  const fastify = app.fastify;

  // GET /api/projects - Get all projects for authenticated user
  fastify.get(
    '/api/projects',
    {
      schema: {
        description: 'Get all projects for authenticated user',
        tags: ['projects'],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                llmProvider: { type: 'string' },
                llmModel: { type: 'string' },
                enableAnonymization: { type: 'boolean' },
                recordingCount: { type: 'number' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id }, 'Fetching projects');

      const projects = await app.db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          description: schema.projects.description,
          llmProvider: schema.projects.llmProvider,
          llmModel: schema.projects.llmModel,
          enableAnonymization: schema.projects.enableAnonymization,
          createdAt: schema.projects.createdAt,
        })
        .from(schema.projects)
        .where(eq(schema.projects.userId, session.user.id));

      // Count recordings for each project
      const projectsWithCounts = await Promise.all(
        projects.map(async (project) => {
          const [{ value }] = await app.db
            .select({ value: count() })
            .from(schema.recordings)
            .where(eq(schema.recordings.projectId, project.id));
          return {
            ...project,
            recordingCount: value,
          };
        })
      );

      app.logger.info({ count: projectsWithCounts.length }, 'Projects fetched successfully');
      return projectsWithCounts;
    }
  );

  // POST /api/projects - Create new project
  interface CreateProjectBody {
    name: string;
    description?: string;
    llmProvider: 'openai' | 'gemini' | 'mistral';
    llmModel: string;
    llmPrompt: string;
    enableAnonymization?: boolean;
    customFields?: Array<{ name: string; type: 'text' | 'number' | 'date' }>;
    sensitiveWords?: string[];
  }

  fastify.post<{ Body: CreateProjectBody }>(
    '/api/projects',
    {
      schema: {
        description: 'Create a new project',
        tags: ['projects'],
        body: {
          type: 'object',
          required: ['name', 'llmProvider', 'llmModel', 'llmPrompt'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            llmProvider: { type: 'string', enum: ['openai', 'gemini', 'mistral'] },
            llmModel: { type: 'string' },
            llmPrompt: { type: 'string' },
            enableAnonymization: { type: 'boolean' },
            customFields: { type: 'array' },
            sensitiveWords: { type: 'array' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateProjectBody }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { name, description, llmProvider, llmModel, llmPrompt, enableAnonymization, customFields, sensitiveWords } =
        request.body;

      app.logger.info(
        { userId: session.user.id, name, llmProvider },
        'Creating project'
      );

      // Build insert values with all required fields
      const insertValues = {
        userId: session.user.id,
        name,
        description: description ?? null,
        llmProvider,
        llmModel,
        llmPrompt,
        enableAnonymization: enableAnonymization ?? true,
        customFields: customFields ?? null,
        sensitiveWords: sensitiveWords ?? null,
      };

      const [project] = await app.db
        .insert(schema.projects)
        .values(insertValues)
        .returning();

      app.logger.info({ projectId: project.id }, 'Project created successfully');
      reply.status(201);
      return project;
    }
  );

  // GET /api/projects/:id - Get full project details
  interface ProjectParams {
    id: string;
  }

  fastify.get<{ Params: ProjectParams }>(
    '/api/projects/:id',
    {
      schema: {
        description: 'Get full project details',
        tags: ['projects'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ProjectParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;

      app.logger.info({ projectId: id }, 'Fetching project details');

      const project = await app.db.query.projects.findFirst({
        where: eq(schema.projects.id, id),
      });

      if (!project) {
        app.logger.warn({ projectId: id }, 'Project not found');
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (project.userId !== session.user.id) {
        app.logger.warn({ projectId: id, userId: session.user.id }, 'Unauthorized access to project');
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      app.logger.info({ projectId: id }, 'Project details fetched successfully');
      return project;
    }
  );

  // PUT /api/projects/:id - Update project
  interface UpdateProjectBody {
    name?: string;
    description?: string;
    llmProvider?: string;
    llmModel?: string;
    llmPrompt?: string;
    enableAnonymization?: boolean;
    customFields?: Array<{ name: string; type: 'text' | 'number' | 'date' }>;
    sensitiveWords?: string[];
  }

  fastify.put<{ Params: ProjectParams; Body: UpdateProjectBody }>(
    '/api/projects/:id',
    {
      schema: {
        description: 'Update project',
        tags: ['projects'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            llmProvider: { type: 'string' },
            llmModel: { type: 'string' },
            llmPrompt: { type: 'string' },
            enableAnonymization: { type: 'boolean' },
            customFields: { type: 'array' },
            sensitiveWords: { type: 'array' },
          },
        },
        response: {
          200: {
            type: 'object',
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ProjectParams; Body: UpdateProjectBody }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;

      app.logger.info({ projectId: id }, 'Updating project');

      // Verify ownership
      const project = await app.db.query.projects.findFirst({
        where: eq(schema.projects.id, id),
      });

      if (!project) {
        app.logger.warn({ projectId: id }, 'Project not found');
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (project.userId !== session.user.id) {
        app.logger.warn({ projectId: id, userId: session.user.id }, 'Unauthorized update attempt');
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const updates: Record<string, any> = {};
      if (request.body.name !== undefined) updates.name = request.body.name;
      if (request.body.description !== undefined) updates.description = request.body.description;
      if (request.body.llmProvider !== undefined) updates.llmProvider = request.body.llmProvider;
      if (request.body.llmModel !== undefined) updates.llmModel = request.body.llmModel;
      if (request.body.llmPrompt !== undefined) updates.llmPrompt = request.body.llmPrompt;
      if (request.body.enableAnonymization !== undefined) updates.enableAnonymization = request.body.enableAnonymization;
      if (request.body.customFields !== undefined) updates.customFields = request.body.customFields;
      if (request.body.sensitiveWords !== undefined) updates.sensitiveWords = request.body.sensitiveWords;

      const [updated] = await app.db
        .update(schema.projects)
        .set(updates)
        .where(eq(schema.projects.id, id))
        .returning();

      app.logger.info({ projectId: id }, 'Project updated successfully');
      return updated;
    }
  );

  // DELETE /api/projects/:id - Delete project
  fastify.delete<{ Params: ProjectParams }>(
    '/api/projects/:id',
    {
      schema: {
        description: 'Delete project',
        tags: ['projects'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
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
    async (request: FastifyRequest<{ Params: ProjectParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;

      app.logger.info({ projectId: id }, 'Deleting project');

      // Verify ownership
      const project = await app.db.query.projects.findFirst({
        where: eq(schema.projects.id, id),
      });

      if (!project) {
        app.logger.warn({ projectId: id }, 'Project not found for deletion');
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (project.userId !== session.user.id) {
        app.logger.warn({ projectId: id, userId: session.user.id }, 'Unauthorized deletion attempt');
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      // Check if project has recordings
      const [{ value: recordingCount }] = await app.db
        .select({ value: count() })
        .from(schema.recordings)
        .where(eq(schema.recordings.projectId, id));

      if (recordingCount > 0) {
        app.logger.warn({ projectId: id, recordingCount }, 'Cannot delete project with recordings');
        return reply.status(400).send({ error: 'Cannot delete project with existing recordings' });
      }

      await app.db.delete(schema.projects).where(eq(schema.projects.id, id));

      app.logger.info({ projectId: id }, 'Project deleted successfully');
      return { success: true };
    }
  );
}
