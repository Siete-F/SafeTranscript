# Copilot Coding Agent Instructions

## Project Overview

Safe Transcript is a privacy-focused audio transcription app. It records audio, transcribes it with Mistral Voxtral Transcribe v2 Realtime, anonymizes PII using a local model, and processes the result with a configurable LLM. The goal is a fully local pipeline where sensitive data never leaves the device.

## Repository Structure

- **Frontend** (`app/`, `components/`, `contexts/`, `hooks/`, `lib/`, `services/`, `utils/`, `styles/`, `types/`): React Native + Expo app using Expo Router for navigation and Better Auth for authentication. The `hooks/` directory contains custom React hooks (e.g., `useHybridTranscribe` for unified local/API transcription). The `services/` directory contains frontend services (e.g., `LocalModelManager` for on-device model management).
- **Backend** (`backend/`): Fastify server in TypeScript. Routes live in `backend/src/routes/`, business logic in `backend/src/services/`, and the database layer (Drizzle ORM on PostgreSQL) in `backend/src/db/`.

## Coding Conventions

- TypeScript throughout (strict mode in the backend).
- Frontend uses functional React components with hooks.
- Backend uses Fastify with `async` request handlers.
- Imports use the `@/` path alias for the frontend root.
- ESLint is configured at the repo root (`.eslintrc.js`); run `npm run lint` from the repo root.
- Backend type-checking: `cd backend && npm run typecheck`.

## Testing

- Run frontend lint: `npm run lint` (repo root).
- Run backend type-check: `cd backend && npm run typecheck`.
- There is no automated test suite yet; validate changes by running the dev servers and exercising the relevant screens or API endpoints.

## Key Libraries

| Area | Library |
|---|---|
| Navigation | `expo-router` (sole router — do not add `react-router-dom` or standalone `@react-navigation/*` navigators) |
| Auth | `better-auth`, `@better-auth/expo` |
| Audio | `expo-audio` |
| HTTP client | Fetch via `utils/api.ts` helpers |
| Backend framework | `fastify` |
| ORM | `drizzle-orm` with `@neondatabase/serverless` |
| Transcription SDK | `@mistralai/mistralai` |
| On-device inference | `react-native-executorch` (mobile only) |
| LLM SDKs | `openai`, `@google/generative-ai`, `@mistralai/mistralai` |
| Maps (native) | WebView + Leaflet CDN (no npm map packages) |
| Maps (web) | iframe + Leaflet CDN (no `react-leaflet` — it conflicts with React 19) |
| Cross-platform scripts | `cross-env` (required for Windows compatibility) |

## Important Notes

- The backend URL is configured in `app.json` under `expo.extra.backendUrl`. Always reference it via `BACKEND_URL` from `utils/api.ts`; never hard-code it.
- PII anonymization runs in `backend/src/services/anonymization.ts`. The end goal is to replace remote calls with a fully local PII detection model.
- Transcription lives in `backend/src/services/transcription.ts` (Batch API) and `hooks/useHybridTranscribe.ts` (unified hook). On mobile, the local Voxtral Mini 4B model (managed by `services/LocalModelManager.ts`) is used when downloaded; otherwise the Batch API is the fallback. Web always uses the Batch API. The app requires the React Native New Architecture (`newArchEnabled: true` in `app.json`) for ExecuTorch support; Expo Go does not work — use a Development Build (`npx expo run:ios` / `run:android`).
- Auth routes under `/api/auth/*` are reserved by Better Auth. Custom auth endpoints use `/api/auth-status/*`.
- Database migrations: after editing `backend/src/db/schema.ts`, run `cd backend && npm run db:push`.
- **Do not add DOM-only or browser-only npm packages** (e.g., `leaflet`, `react-leaflet`, `react-router-dom`). They conflict with React Native and/or React 19. For web-specific functionality, use CDN resources loaded via WebView or iframe.
- **Do not add `--force` or `--legacy-peer-deps`** to npm install commands. If a peer dependency conflict arises, resolve it by finding compatible versions or removing the conflicting package.
- npm scripts use `cross-env` for environment variables to ensure Windows compatibility.
