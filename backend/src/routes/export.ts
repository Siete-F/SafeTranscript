import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';

export function registerExportRoutes(app: App) {
  const requireAuth = app.requireAuth();
  const fastify = app.fastify;

  // GET /api/projects/:projectId/export-csv - Export recordings as CSV
  interface ExportParams {
    projectId: string;
  }

  fastify.get<{ Params: ExportParams }>(
    '/api/projects/:projectId/export-csv',
    {
      schema: {
        description: 'Export project recordings as CSV',
        tags: ['export'],
        params: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'string',
            description: 'CSV file content',
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ExportParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { projectId } = request.params;

      app.logger.info({ projectId }, 'Exporting project to CSV');

      // Verify project ownership
      const project = await app.db.query.projects.findFirst({
        where: eq(schema.projects.id, projectId),
      });

      if (!project || project.userId !== session.user.id) {
        app.logger.warn({ projectId }, 'Unauthorized access to project');
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      try {
        // Get all completed recordings
        const recordings = await app.db
          .select()
          .from(schema.recordings)
          .where(eq(schema.recordings.projectId, projectId));

        const doneRecordings = recordings.filter((r) => r.status === 'done');

        app.logger.info(
          { projectId, count: doneRecordings.length },
          'Generating CSV export'
        );

        // Build CSV content
        const csv = generateCSV(doneRecordings, project);

        // Set response headers for file download
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="project-${projectId}-export.csv"`);

        app.logger.info({ projectId }, 'CSV export generated successfully');
        return csv;
      } catch (error) {
        app.logger.error({ projectId, err: error }, 'Failed to generate CSV export');
        return reply.status(500).send({ error: 'Failed to generate export' });
      }
    }
  );

  // GET /api/projects/:projectId/export-json - Export recordings as JSON
  fastify.get<{ Params: ExportParams }>(
    '/api/projects/:projectId/export-json',
    {
      schema: {
        description: 'Export project recordings as JSON',
        tags: ['export'],
        params: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ExportParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { projectId } = request.params;

      app.logger.info({ projectId }, 'Exporting project to JSON');

      // Verify project ownership
      const project = await app.db.query.projects.findFirst({
        where: eq(schema.projects.id, projectId),
      });

      if (!project || project.userId !== session.user.id) {
        app.logger.warn({ projectId }, 'Unauthorized access to project');
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      try {
        // Get all completed recordings
        const recordings = await app.db
          .select()
          .from(schema.recordings)
          .where(eq(schema.recordings.projectId, projectId));

        const doneRecordings = recordings.filter((r) => r.status === 'done');

        app.logger.info(
          { projectId, count: doneRecordings.length },
          'Generating JSON export'
        );

        // Format as JSON
        const jsonData = {
          project: {
            id: project.id,
            name: project.name,
            description: project.description,
            llmProvider: project.llmProvider,
            llmModel: project.llmModel,
            exportDate: new Date().toISOString(),
          },
          recordingCount: doneRecordings.length,
          recordings: doneRecordings.map((recording) => ({
            id: recording.id,
            createdAt: recording.createdAt,
            updatedAt: recording.updatedAt,
            customFieldValues: recording.customFieldValues,
            transcription: recording.transcription,
            anonymizedTranscription: recording.anonymizedTranscription,
            llmOutput: recording.llmOutput,
          })),
        };

        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="project-${projectId}-export.json"`);

        app.logger.info({ projectId }, 'JSON export generated successfully');
        return jsonData;
      } catch (error) {
        app.logger.error({ projectId, err: error }, 'Failed to generate JSON export');
        return reply.status(500).send({ error: 'Failed to generate export' });
      }
    }
  );
}

/**
 * Generate CSV content from recordings
 */
function generateCSV(recordings: any[], project: any): string {
  // Get unique custom field names
  const customFieldNames = new Set<string>();
  recordings.forEach((r) => {
    if (r.customFieldValues) {
      Object.keys(r.customFieldValues).forEach((key) => customFieldNames.add(key));
    }
  });

  const customFieldArray = Array.from(customFieldNames).sort();

  // Build CSV header
  const headers = [
    'Date',
    'Time',
    ...customFieldArray,
    'Transcription Length',
    'Anonymized',
    'LLM Output',
    'Status',
  ];

  const csvLines: string[] = [escapeCSVLine(headers)];

  // Add data rows
  recordings.forEach((recording) => {
    const createdAt = new Date(recording.createdAt);
    const date = createdAt.toISOString().split('T')[0];
    const time = createdAt.toISOString().split('T')[1]?.substring(0, 8) || '';

    const customValues = customFieldArray.map((field) => {
      const value = recording.customFieldValues?.[field];
      return value !== undefined ? String(value) : '';
    });

    const transcriptionLength = recording.transcription?.length || 0;
    const isAnonymized = recording.anonymizedTranscription ? 'Yes' : 'No';
    const llmOutput = recording.llmOutput || '';

    const row = [
      date,
      time,
      ...customValues,
      String(transcriptionLength),
      isAnonymized,
      llmOutput,
      recording.status,
    ];

    csvLines.push(escapeCSVLine(row));
  });

  return csvLines.join('\n');
}

/**
 * Escape and format CSV line
 */
function escapeCSVLine(values: string[]): string {
  return values
    .map((value) => {
      if (!value) return '""';
      // Escape quotes and wrap in quotes if contains special characters
      const escaped = String(value).replace(/"/g, '""');
      if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
        return `"${escaped}"`;
      }
      return escaped;
    })
    .join(',');
}
