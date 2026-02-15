# Secure Scribe

A privacy-focused audio transcription and analysis application. Secure Scribe records audio, transcribes it locally using **Mistral Voxtral Transcribe v2 Realtime**, anonymizes personally identifiable information (PII) using a local PII detection model, and then processes the cleaned transcript with a configurable LLM for structured output (e.g., summaries, action items).

The end goal is a fully local pipeline: record → transcribe → anonymize → analyze — keeping sensitive data on-device throughout.

## Features

- **Audio recording** with in-app microphone capture
- **Speech-to-text** via Mistral Voxtral Transcribe v2 (with transcription keyword support for domain-specific terms), with optional on-device transcription using Voxtral Mini 4B through ExecuTorch on mobile
- **PII anonymization** — detects and masks phone numbers, emails, addresses, health IDs, credit card numbers, and more using a local PII model
- **LLM analysis** — sends anonymized transcripts to a configurable LLM provider (OpenAI, Google Gemini, or Mistral) with a custom prompt
- **Project-based organization** — group recordings into projects with custom fields and export to CSV
- **Cross-platform** — runs on iOS, Android, and Web (Expo / React Native)
- **Authentication** — email/password and OAuth (Google, Apple) via Better Auth

## Repository Layout

```
├── app/                        # Frontend screens (Expo Router)
│   ├── (tabs)/                 # Tab navigation
│   │   ├── index.tsx           #   Projects list
│   │   ├── settings.tsx        #   Settings & API keys
│   │   └── profile.tsx         #   User profile
│   ├── project/
│   │   ├── [id].tsx            #   Project detail & recordings list
│   │   └── create.tsx          #   Create project form
│   ├── recording/
│   │   ├── [id].tsx            #   Recording detail (transcript, LLM output, audio player)
│   │   └── new.tsx             #   New recording (mic capture + upload)
│   ├── auth.tsx                #   Sign in / sign up screen
│   ├── auth-callback.tsx       #   OAuth callback handler
│   └── auth-popup.tsx          #   OAuth popup handler (web)
├── backend/                    # Fastify API server
│   └── src/
│       ├── index.ts            #   Server entry point
│       ├── routes/
│       │   ├── projects.ts     #   CRUD for projects
│       │   ├── recordings.ts   #   CRUD for recordings + audio upload
│       │   ├── api-keys.ts     #   Manage LLM API keys
│       │   ├── export.ts       #   CSV export
│       │   └── auth.ts         #   Custom auth status endpoints
│       ├── services/
│       │   ├── transcription.ts    # Voxtral Transcribe v2 integration
│       │   ├── anonymization.ts    # PII detection & masking
│       │   ├── llm.ts              # LLM provider abstraction (OpenAI, Gemini, Mistral)
│       │   └── auth-helper.ts      # Auth utilities
│       └── db/
│           ├── schema.ts       #   Drizzle ORM schema (projects, recordings, api-keys)
│           └── auth-schema.ts  #   Better Auth tables (users, sessions)
├── components/                 # Shared UI components
├── contexts/                   # React contexts (AuthContext)
├── hooks/                      # Custom React hooks
│   └── useHybridTranscribe.ts  #   Unified transcription (local or API)
├── services/                   # Frontend services
│   └── LocalModelManager.ts    #   On-device model download & lifecycle
├── lib/                        # Auth client config
├── utils/                      # API helpers, error logger
├── styles/                     # Shared styles
├── types/                      # TypeScript type definitions
├── assets/                     # Images, fonts
└── public/                     # Static web assets
```

## Getting Started

### Prerequisites

- Node.js ≥ 20
- A GitHub Personal Access Token with `read:packages` scope (for private npm registry)

### Frontend

```bash
npm install
npm run dev          # Start Expo dev server
```

### Backend

```bash
cd backend
export NPM_TOKEN=<your-github-pat>
npm install
npm run dev          # Start Fastify dev server (tsx watch)
```

#### Database

The backend uses PostgreSQL (Neon) with Drizzle ORM.

```bash
cd backend
npm run db:push      # Generate and apply migrations
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NPM_TOKEN` | Yes | GitHub PAT with `read:packages` for private registry |
| `MISTRAL_API_KEY` | Yes | Mistral API key for Voxtral transcription and Mistral LLM |
| `OPENAI_API_KEY` | Optional | OpenAI key (if using OpenAI as LLM provider) |
| `GEMINI_API_KEY` | Optional | Google Gemini key (if using Gemini as LLM provider) |
| `RESEND_API_KEY` | Optional | For email verification / password reset |

## Processing Pipeline

```
Audio Recording
      │
      ▼
Voxtral Transcribe v2  ──►  Raw transcript (with timestamps & speaker labels)
(Batch API or local         On mobile, the local Voxtral Mini 4B model is used
 Voxtral Mini 4B)           when downloaded; otherwise falls back to the Batch API.
      │                     Web always uses the Batch API.
      ▼
PII Anonymization       ──►  Masked transcript (local PII model)
      │
      ▼
LLM Analysis            ──►  Structured output (summary, action items, etc.)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile / Web | React Native, Expo, Expo Router |
| Backend | Fastify, TypeScript |
| Database | PostgreSQL (Neon), Drizzle ORM |
| Auth | Better Auth (email/password + OAuth) |
| Transcription | Mistral Voxtral Transcribe v2 (API), Voxtral Mini 4B via ExecuTorch (on-device) |
| PII Detection | Local PII anonymization model |
| LLM Providers | OpenAI, Google Gemini, Mistral |

## Scripts

### Frontend

| Script | Description |
|---|---|
| `npm run dev` | Start Expo dev server with tunnel |
| `npm run web` | Start web-only dev server |
| `npm run lint` | Run ESLint |
| `npm run build:web` | Export web build + generate service worker |

### Backend

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Bundle with esbuild |
| `npm run typecheck` | Type-check without emitting |
| `npm run db:push` | Generate + apply DB migrations |
