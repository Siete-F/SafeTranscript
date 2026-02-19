import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';
import { processTranscription } from '../services/transcription.js';
import { anonymizeTranscription } from '../services/anonymization.js';
import { processWithLLM } from '../services/llm.js';

export function registerRecordingRoutes(app: App) {
  const requireAuth = app.requireAuth();
  const fastify = app.fastify;

  // GET /api/projects/:projectId/recordings - Get all recordings for project
  interface ProjectIdParams {
    projectId: string;
  }

  interface RecordingParams {
    id: string;
  }

  interface MoveRecordingBody {
    targetProjectId: string;
  }

  interface CreateRecordingBody {
    customFieldValues?: Record<string, any>;
  }

  fastify.get<{ Params: ProjectIdParams }>(
    '/api/projects/:projectId/recordings',
    {
      schema: {
        description: 'Get all recordings for project',
        tags: ['recordings'],
        params: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ProjectIdParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { projectId } = request.params;

      app.logger.info({ projectId }, 'Fetching recordings for project');

      // Verify project ownership
      const project = await app.db.query.projects.findFirst({
        where: eq(schema.projects.id, projectId),
      });

      if (!project || project.userId !== session.user.id) {
        app.logger.warn({ projectId }, 'Unauthorized access to project');
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      const recordings = await app.db
        .select({
          id: schema.recordings.id,
          projectId: schema.recordings.projectId,
          status: schema.recordings.status,
          audioUrl: schema.recordings.audioUrl,
          audioDuration: schema.recordings.audioDuration,
          customFieldValues: schema.recordings.customFieldValues,
          llmOutput: schema.recordings.llmOutput,
          errorMessage: schema.recordings.errorMessage,
          createdAt: schema.recordings.createdAt,
          updatedAt: schema.recordings.updatedAt,
        })
        .from(schema.recordings)
        .where(eq(schema.recordings.projectId, projectId));

      // Explicitly serialize dates to ISO strings to avoid fast-json-stringify issues
      const serialized = recordings.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      }));

      app.logger.info(
        { count: serialized.length, sample: serialized.length > 0 ? { id: serialized[0].id, status: serialized[0].status, createdAt: serialized[0].createdAt } : null },
        'Recordings fetched successfully'
      );

      // Bypass fast-json-stringify by manually serializing the response
      // The framework's serializer may strip properties when the response schema
      // doesn't match the actual data shape
      return reply
        .header('content-type', 'application/json')
        .send(JSON.stringify(serialized));
    }
  );

  // POST /api/projects/:projectId/recordings - Create new recording
  fastify.post<{ Params: ProjectIdParams; Body: CreateRecordingBody }>(
    '/api/projects/:projectId/recordings',
    {
      schema: {
        description: 'Create new recording',
        tags: ['recordings'],
        params: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            customFieldValues: { type: 'object' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              uploadUrl: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ProjectIdParams; Body: CreateRecordingBody }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { projectId } = request.params;
      const { customFieldValues } = request.body;

      app.logger.info({ projectId }, 'Creating new recording');

      // Verify project ownership
      const project = await app.db.query.projects.findFirst({
        where: eq(schema.projects.id, projectId),
      });

      if (!project || project.userId !== session.user.id) {
        app.logger.warn({ projectId }, 'Unauthorized access to project');
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      // Create recording - provide explicit values for all columns
      // to avoid DEFAULT keyword (not supported by Neon HTTP driver)
      const now = new Date();
      const [recording] = await app.db
        .insert(schema.recordings)
        .values({
          id: crypto.randomUUID(),
          projectId,
          userId: session.user.id,
          status: 'pending' as const,
          customFieldValues: customFieldValues || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // Generate upload URL (this is where the client will upload audio)
      const uploadUrl = `/api/recordings/${recording.id}/upload-audio`;

      app.logger.info({ recordingId: recording.id }, 'Recording created successfully');
      reply.status(201);
      return { id: recording.id, uploadUrl };
    }
  );

  // GET /api/recordings/:id - Get full recording details
  fastify.get<{ Params: RecordingParams }>(
    '/api/recordings/:id',
    {
      schema: {
        description: 'Get recording details',
        tags: ['recordings'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: RecordingParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;

      if (!id || id === 'undefined' || id === 'null') {
        app.logger.warn({ recordingId: id }, 'Invalid recording ID');
        return reply.status(400).send({ error: 'Invalid recording ID' });
      }

      app.logger.info({ recordingId: id }, 'Fetching recording details');

      const recording = await app.db.query.recordings.findFirst({
        where: eq(schema.recordings.id, id),
      });

      if (!recording || recording.userId !== session.user.id) {
        app.logger.warn({ recordingId: id }, 'Recording not found or unauthorized');
        return reply.status(404).send({ error: 'Recording not found' });
      }

      app.logger.info({ recordingId: id }, 'Recording details fetched successfully');
      return recording;
    }
  );

  // DELETE /api/recordings/:id - Delete recording
  fastify.delete<{ Params: RecordingParams }>(
    '/api/recordings/:id',
    {
      schema: {
        description: 'Delete recording',
        tags: ['recordings'],
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
    async (request: FastifyRequest<{ Params: RecordingParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;

      // Validate that id is a proper value and not 'undefined'
      if (!id || id === 'undefined' || id === 'null') {
        app.logger.warn({ recordingId: id }, 'Invalid recording ID for deletion');
        return reply.status(400).send({ error: 'Invalid recording ID' });
      }

      app.logger.info({ recordingId: id }, 'Deleting recording');

      const recording = await app.db.query.recordings.findFirst({
        where: eq(schema.recordings.id, id),
      });

      if (!recording || recording.userId !== session.user.id) {
        app.logger.warn({ recordingId: id }, 'Recording not found for deletion');
        return reply.status(404).send({ error: 'Recording not found' });
      }

      // Delete audio file if it exists
      if (recording.audioUrl) {
        try {
          const urlParts = recording.audioUrl.split('/').pop();
          if (urlParts) {
            await app.storage.delete(urlParts);
          }
        } catch (err) {
          app.logger.warn({ recordingId: id, err }, 'Failed to delete audio file');
        }
      }

      await app.db.delete(schema.recordings).where(eq(schema.recordings.id, id));

      app.logger.info({ recordingId: id }, 'Recording deleted successfully');
      return { success: true };
    }
  );

  // POST /api/recordings/:id/move - Move recording to another project
  fastify.post<{ Params: RecordingParams; Body: MoveRecordingBody }>(
    '/api/recordings/:id/move',
    {
      schema: {
        description: 'Move recording to another project',
        tags: ['recordings'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['targetProjectId'],
          properties: {
            targetProjectId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: RecordingParams; Body: MoveRecordingBody }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;
      const { targetProjectId } = request.body;

      app.logger.info({ recordingId: id, targetProjectId }, 'Moving recording to project');

      const recording = await app.db.query.recordings.findFirst({
        where: eq(schema.recordings.id, id),
      });

      if (!recording || recording.userId !== session.user.id) {
        app.logger.warn({ recordingId: id }, 'Recording not found');
        return reply.status(404).send({ error: 'Recording not found' });
      }

      const targetProject = await app.db.query.projects.findFirst({
        where: eq(schema.projects.id, targetProjectId),
      });

      if (!targetProject || targetProject.userId !== session.user.id) {
        app.logger.warn({ targetProjectId }, 'Target project not found');
        return reply.status(404).send({ error: 'Target project not found' });
      }

      // Update project and reset processing status
      const [updated] = await app.db
        .update(schema.recordings)
        .set({
          projectId: targetProjectId,
          status: 'pending',
          anonymizedTranscription: null,
          piiMappings: null,
          llmOutput: null,
        })
        .where(eq(schema.recordings.id, id))
        .returning();

      // Trigger reprocessing pipeline
      app.logger.info({ recordingId: id }, 'Queuing recording for reprocessing');

      // Queue async processing (don't wait for it)
      setImmediate(async () => {
        try {
          await triggerProcessingPipeline(app, id, targetProject);
        } catch (err) {
          app.logger.error({ recordingId: id, err }, 'Error in processing pipeline');
        }
      });

      app.logger.info({ recordingId: id }, 'Recording moved successfully');
      return updated;
    }
  );

  // GET /api/recordings/:id/audio - Stream audio file
  fastify.get<{ Params: RecordingParams }>(
    '/api/recordings/:id/audio',
    {
      schema: {
        description: 'Get audio file stream',
        tags: ['recordings'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: RecordingParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;

      app.logger.info({ recordingId: id }, 'Streaming audio file');

      const recording = await app.db.query.recordings.findFirst({
        where: eq(schema.recordings.id, id),
      });

      if (!recording || recording.userId !== session.user.id) {
        app.logger.warn({ recordingId: id }, 'Recording not found');
        return reply.status(404).send({ error: 'Recording not found' });
      }

      if (!recording.audioUrl) {
        app.logger.warn({ recordingId: id }, 'Audio not uploaded');
        return reply.status(404).send({ error: 'Audio not available' });
      }

      // Get signed URL for audio file
      const { url } = await app.storage.getSignedUrl(recording.audioUrl);

      app.logger.info({ recordingId: id }, 'Audio URL generated');
      return reply.redirect(url);
    }
  );

  // GET /api/recordings/:id/audio-url - Get signed audio URL (JSON)
  fastify.get<{ Params: RecordingParams }>(
    '/api/recordings/:id/audio-url',
    {
      schema: {
        description: 'Get signed audio URL as JSON',
        tags: ['recordings'],
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
              url: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: RecordingParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;

      const recording = await app.db.query.recordings.findFirst({
        where: eq(schema.recordings.id, id),
      });

      if (!recording || recording.userId !== session.user.id) {
        return reply.status(404).send({ error: 'Recording not found' });
      }

      if (!recording.audioUrl) {
        return reply.status(404).send({ error: 'Audio not available' });
      }

      const { url } = await app.storage.getSignedUrl(recording.audioUrl);
      return { url };
    }
  );

  // POST /api/recordings/:id/upload-audio - Upload audio file
  fastify.post<{ Params: RecordingParams }>(
    '/api/recordings/:id/upload-audio',
    {
      schema: {
        description: 'Upload audio file',
        tags: ['recordings'],
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
              audioUrl: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: RecordingParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;

      app.logger.info({ recordingId: id }, 'Uploading audio file');

      const recording = await app.db.query.recordings.findFirst({
        where: eq(schema.recordings.id, id),
      });

      if (!recording || recording.userId !== session.user.id) {
        app.logger.warn({ recordingId: id }, 'Recording not found');
        return reply.status(404).send({ error: 'Recording not found' });
      }

      const data = await request.file();
      if (!data) {
        app.logger.warn({ recordingId: id }, 'No audio file provided');
        return reply.status(400).send({ error: 'No audio file provided' });
      }

      let buffer: Buffer;
      try {
        buffer = await data.toBuffer();
      } catch (err) {
        app.logger.error({ recordingId: id, err }, 'File size limit exceeded');
        return reply.status(413).send({ error: 'File too large' });
      }

      try {
        // Upload audio file
        const audioKey = `recordings/${session.user.id}/${id}.wav`;
        await app.storage.upload(audioKey, buffer);

        // Get signed URL
        const { url } = await app.storage.getSignedUrl(audioKey);

        // Update recording with audio URL
        const [updated] = await app.db
          .update(schema.recordings)
          .set({ audioUrl: audioKey })
          .where(eq(schema.recordings.id, id))
          .returning();

        app.logger.info({ recordingId: id }, 'Audio file uploaded successfully');

        // Trigger transcription pipeline asynchronously
        app.logger.info({ recordingId: id, projectId: recording.projectId }, 'Triggering async processing pipeline');
        setImmediate(async () => {
          try {
            const project = await app.db.query.projects.findFirst({
              where: eq(schema.projects.id, recording.projectId),
            });
            if (project) {
              await triggerProcessingPipeline(app, id, project);
            }
          } catch (err) {
            app.logger.error({ recordingId: id, err }, 'Error in processing pipeline');
          }
        });

        return { success: true, audioUrl: url };
      } catch (error) {
        app.logger.error({ recordingId: id, err: error }, 'Failed to upload audio');
        return reply.status(500).send({ error: 'Failed to upload audio' });
      }
    }
  );

  // POST /api/recordings/:id/transcribe - Manually trigger transcription
  fastify.post<{ Params: RecordingParams }>(
    '/api/recordings/:id/transcribe',
    {
      schema: {
        description: 'Trigger transcription',
        tags: ['recordings'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: RecordingParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;

      app.logger.info({ recordingId: id }, 'Triggering transcription');

      const recording = await app.db.query.recordings.findFirst({
        where: eq(schema.recordings.id, id),
      });

      if (!recording || recording.userId !== session.user.id) {
        app.logger.warn({ recordingId: id }, 'Recording not found');
        return reply.status(404).send({ error: 'Recording not found' });
      }

      if (!recording.audioUrl) {
        app.logger.warn({ recordingId: id }, 'No audio file');
        return reply.status(400).send({ error: 'No audio file uploaded' });
      }

      try {
        // Update status
        await app.db
          .update(schema.recordings)
          .set({ status: 'transcribing' })
          .where(eq(schema.recordings.id, id));

        app.logger.info({ recordingId: id }, 'Starting transcription process');

        // Get project for sensitive words
        const project = await app.db.query.projects.findFirst({
          where: eq(schema.projects.id, recording.projectId),
        });

        // Get audio file from storage
        const audioBuffer = await app.storage.download(recording.audioUrl);

        // Call transcription service with sensitive words
        const transcriptionData = await processTranscription(
          audioBuffer,
          project?.sensitiveWords
        );

        app.logger.info({ recordingId: id }, 'Transcription completed');

        // Update recording with transcription
        const [updated] = await app.db
          .update(schema.recordings)
          .set({
            transcription: transcriptionData.fullText,
            transcriptionData: transcriptionData.segments,
            status: 'anonymizing',
          })
          .where(eq(schema.recordings.id, id))
          .returning();

        return updated;
      } catch (error) {
        app.logger.error({ recordingId: id, err: error }, 'Transcription failed');
        await app.db
          .update(schema.recordings)
          .set({ status: 'error', errorMessage: (error as Error).message })
          .where(eq(schema.recordings.id, id));
        return reply.status(500).send({ error: 'Transcription failed' });
      }
    }
  );

  // POST /api/recordings/:id/anonymize - Manually trigger anonymization
  fastify.post<{ Params: RecordingParams }>(
    '/api/recordings/:id/anonymize',
    {
      schema: {
        description: 'Trigger anonymization',
        tags: ['recordings'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: RecordingParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;

      app.logger.info({ recordingId: id }, 'Triggering anonymization');

      const recording = await app.db.query.recordings.findFirst({
        where: eq(schema.recordings.id, id),
      });

      if (!recording || recording.userId !== session.user.id) {
        app.logger.warn({ recordingId: id }, 'Recording not found');
        return reply.status(404).send({ error: 'Recording not found' });
      }

      if (!recording.transcription) {
        app.logger.warn({ recordingId: id }, 'No transcription available');
        return reply.status(400).send({ error: 'No transcription available' });
      }

      try {
        await app.db
          .update(schema.recordings)
          .set({ status: 'anonymizing' })
          .where(eq(schema.recordings.id, id));

        const project = await app.db.query.projects.findFirst({
          where: eq(schema.projects.id, recording.projectId),
        });

        if (!project) {
          throw new Error('Project not found');
        }

        const { anonymized, mappings } = await anonymizeTranscription(
          recording.transcription
        );

        app.logger.info({ recordingId: id }, 'Anonymization completed');

        const [updated] = await app.db
          .update(schema.recordings)
          .set({
            anonymizedTranscription: anonymized,
            piiMappings: mappings,
            status: 'processing',
          })
          .where(eq(schema.recordings.id, id))
          .returning();

        return updated;
      } catch (error) {
        app.logger.error({ recordingId: id, err: error }, 'Anonymization failed');
        await app.db
          .update(schema.recordings)
          .set({ status: 'error', errorMessage: (error as Error).message })
          .where(eq(schema.recordings.id, id));
        return reply.status(500).send({ error: 'Anonymization failed' });
      }
    }
  );

  // POST /api/recordings/:id/process-llm - Manually trigger LLM processing
  fastify.post<{ Params: RecordingParams }>(
    '/api/recordings/:id/process-llm',
    {
      schema: {
        description: 'Trigger LLM processing',
        tags: ['recordings'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: RecordingParams }>, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;

      app.logger.info({ recordingId: id }, 'Triggering LLM processing');

      const recording = await app.db.query.recordings.findFirst({
        where: eq(schema.recordings.id, id),
      });

      if (!recording || recording.userId !== session.user.id) {
        app.logger.warn({ recordingId: id }, 'Recording not found');
        return reply.status(404).send({ error: 'Recording not found' });
      }

      const project = await app.db.query.projects.findFirst({
        where: eq(schema.projects.id, recording.projectId),
      });

      if (!project) {
        app.logger.warn({ recordingId: id }, 'Project not found');
        return reply.status(404).send({ error: 'Project not found' });
      }

      try {
        await app.db
          .update(schema.recordings)
          .set({ status: 'processing' })
          .where(eq(schema.recordings.id, id));

        const apiKeys = await app.db.query.apiKeys.findFirst({
          where: eq(schema.apiKeys.userId, session.user.id),
        });

        // Use anonymized if enabled, otherwise raw transcription
        const textToProcess = project.enableAnonymization
          ? recording.anonymizedTranscription || recording.transcription
          : recording.transcription;

        if (!textToProcess) {
          throw new Error('No transcription available for processing');
        }

        const llmOutput = await processWithLLM(
          app,
          textToProcess,
          project.llmProvider,
          project.llmModel,
          project.llmPrompt,
          apiKeys
        );

        app.logger.info({ recordingId: id }, 'LLM processing completed');

        // Reverse PII mappings if anonymization was used
        let finalOutput = llmOutput;
        if (project.enableAnonymization && recording.piiMappings) {
          finalOutput = reversePIIMappings(llmOutput, recording.piiMappings);
        }

        const [updated] = await app.db
          .update(schema.recordings)
          .set({
            llmOutput: finalOutput,
            status: 'done',
          })
          .where(eq(schema.recordings.id, id))
          .returning();

        app.logger.info({ recordingId: id }, 'Recording processing completed');
        return updated;
      } catch (error) {
        app.logger.error({ recordingId: id, err: error }, 'LLM processing failed');
        await app.db
          .update(schema.recordings)
          .set({ status: 'error', errorMessage: (error as Error).message })
          .where(eq(schema.recordings.id, id));
        return reply.status(500).send({ error: 'LLM processing failed' });
      }
    }
  );

  // GET /api/recordings/debug/list - Debug endpoint to list all recordings with manual serialization
  // This bypasses the framework serializer to help diagnose empty-object issues
  fastify.get(
    '/api/recordings/debug/list',
    {
      schema: {
        description: 'Debug: list all recordings for current user (bypasses serializer)',
        tags: ['recordings'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const recordings = await app.db
        .select({
          id: schema.recordings.id,
          projectId: schema.recordings.projectId,
          status: schema.recordings.status,
          audioUrl: schema.recordings.audioUrl,
          audioDuration: schema.recordings.audioDuration,
          createdAt: schema.recordings.createdAt,
          updatedAt: schema.recordings.updatedAt,
        })
        .from(schema.recordings)
        .where(eq(schema.recordings.userId, session.user.id));

      const serialized = recordings.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
        audioDownloadUrl: r.id ? `/api/recordings/${r.id}/audio` : null,
      }));

      return reply
        .header('content-type', 'application/json')
        .send(JSON.stringify(serialized, null, 2));
    }
  );
}

// Helper function to trigger the full processing pipeline
async function triggerProcessingPipeline(app: App, recordingId: string, project: any) {
  const pipelineStart = Date.now();
  try {
    app.logger.info({ recordingId, projectId: project.id }, '[Pipeline] Starting processing pipeline');

    const recording = await app.db.query.recordings.findFirst({
      where: eq(schema.recordings.id, recordingId),
    });

    if (!recording || !recording.audioUrl) {
      app.logger.warn({ recordingId, hasRecording: !!recording, hasAudioUrl: !!recording?.audioUrl }, '[Pipeline] Aborting - recording or audio URL missing');
      return;
    }

    // Step 1: Transcribe
    app.logger.info({ recordingId }, '[Pipeline] Step 1/3: Starting transcription');
    await app.db
      .update(schema.recordings)
      .set({ status: 'transcribing' })
      .where(eq(schema.recordings.id, recordingId));

    const transcribeStart = Date.now();
    const audioBuffer = await app.storage.download(recording.audioUrl);
    app.logger.info({ recordingId, audioSizeBytes: audioBuffer.length }, '[Pipeline] Audio file downloaded, sending to transcription service');
    
    const transcriptionData = await processTranscription(audioBuffer, project.sensitiveWords);
    const transcribeMs = Date.now() - transcribeStart;
    
    app.logger.info(
      { recordingId, transcriptionLength: transcriptionData.fullText.length, segmentCount: transcriptionData.segments.length, durationMs: transcribeMs },
      '[Pipeline] Step 1/3: Transcription completed'
    );

    await app.db
      .update(schema.recordings)
      .set({
        transcription: transcriptionData.fullText,
        transcriptionData: transcriptionData.segments,
      })
      .where(eq(schema.recordings.id, recordingId));

    // Step 2: Anonymize (if enabled)
    if (project.enableAnonymization) {
      app.logger.info({ recordingId }, '[Pipeline] Step 2/3: Starting anonymization');
      await app.db
        .update(schema.recordings)
        .set({ status: 'anonymizing' })
        .where(eq(schema.recordings.id, recordingId));

      const anonymizeStart = Date.now();
      const { anonymized, mappings } = await anonymizeTranscription(
        transcriptionData.fullText
      );
      const anonymizeMs = Date.now() - anonymizeStart;

      app.logger.info(
        { recordingId, piiMappingCount: Object.keys(mappings).length, anonymizedLength: anonymized.length, durationMs: anonymizeMs },
        '[Pipeline] Step 2/3: Anonymization completed'
      );

      await app.db
        .update(schema.recordings)
        .set({
          anonymizedTranscription: anonymized,
          piiMappings: mappings,
        })
        .where(eq(schema.recordings.id, recordingId));
    } else {
      app.logger.info({ recordingId }, '[Pipeline] Step 2/3: Anonymization skipped (disabled for project)');
    }

    // Step 3: Process with LLM
    app.logger.info({ recordingId, provider: project.llmProvider, model: project.llmModel }, '[Pipeline] Step 3/3: Starting LLM processing');
    await app.db
      .update(schema.recordings)
      .set({ status: 'processing' })
      .where(eq(schema.recordings.id, recordingId));

    const apiKeys = await app.db.query.apiKeys.findFirst({
      where: eq(schema.apiKeys.userId, recording.userId),
    });

    const updatedRecording = await app.db.query.recordings.findFirst({
      where: eq(schema.recordings.id, recordingId),
    });

    const textToProcess = project.enableAnonymization
      ? updatedRecording?.anonymizedTranscription || transcriptionData.fullText
      : transcriptionData.fullText;

    app.logger.info(
      { recordingId, textToProcessLength: textToProcess.length, usingAnonymized: project.enableAnonymization && !!updatedRecording?.anonymizedTranscription },
      '[Pipeline] Sending text to LLM'
    );

    const llmStart = Date.now();
    const llmOutput = await processWithLLM(
      app,
      textToProcess,
      project.llmProvider,
      project.llmModel,
      project.llmPrompt,
      apiKeys
    );
    const llmMs = Date.now() - llmStart;

    app.logger.info(
      { recordingId, llmOutputLength: llmOutput.length, durationMs: llmMs },
      '[Pipeline] Step 3/3: LLM processing completed'
    );

    let finalOutput = llmOutput;
    if (project.enableAnonymization && updatedRecording?.piiMappings) {
      finalOutput = reversePIIMappings(llmOutput, updatedRecording.piiMappings);
      app.logger.info({ recordingId, finalOutputLength: finalOutput.length }, '[Pipeline] PII mappings reversed in LLM output');
    }

    await app.db
      .update(schema.recordings)
      .set({
        llmOutput: finalOutput,
        status: 'done',
      })
      .where(eq(schema.recordings.id, recordingId));

    const totalMs = Date.now() - pipelineStart;
    app.logger.info(
      { recordingId, totalDurationMs: totalMs, transcribeMs, llmMs },
      '[Pipeline] Processing pipeline completed successfully'
    );
  } catch (error) {
    const totalMs = Date.now() - pipelineStart;
    app.logger.error({ recordingId, err: error, totalDurationMs: totalMs }, '[Pipeline] Processing pipeline failed');
    await app.db
      .update(schema.recordings)
      .set({ status: 'error', errorMessage: (error as Error).message })
      .where(eq(schema.recordings.id, recordingId));
  }
}

// Helper function to reverse PII mappings in output
function reversePIIMappings(text: string, mappings: Record<string, string>): string {
  let result = text;
  for (const [placeholder, original] of Object.entries(mappings)) {
    const regex = new RegExp(placeholder, 'g');
    result = result.replace(regex, original);
  }
  return result;
}
