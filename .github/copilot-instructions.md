# Copilot Coding Agent Instructions

## Project Overview

Safe Transcript is a privacy-focused audio transcription app built with React Native (Expo). It records audio, transcribes it using either an **on-device Whisper model** (via ExecuTorch) or the **Mistral Voxtral Transcribe v2** API, anonymizes PII using a hybrid approach (GLiNER NER + regex, with regex-only fallback), and processes the cleaned transcript with a configurable LLM. The app is fully local — on iOS/Android, projects and recordings are stored as **plain files** (text, markdown, JSON) in a configurable folder structure; on web, data is stored in SQLite (sql.js). API keys and app settings remain in SQLite on all platforms. External API calls (transcription, LLM) are made directly from the device using user-provided API keys.

## Repository Structure

- **Screens** (`app/`): React Native + Expo Router (file-based routing). Tab navigation in `app/(tabs)/` (Projects list, Settings). Project and recording screens in `app/project/` and `app/recording/`. Screen files are thin orchestrators — UI is extracted to components.
- **Components** (`components/`): Domain-organized UI components: `project/` (RecordingCard, ProjectConfigModal), `recording/` (TranscriptionCard, LlmOutputCard), `settings/` (ApiKeysSection, WhisperModelSection, PiiModelSection, StorageSection), `ui/` (Modal). Platform-specific variants via `.ios.tsx` files.
- **Hooks** (`hooks/`): Custom React hooks. `useModal.ts` provides shared modal state management used across all screens.
- **Database** (`db/`): SQLite via `expo-sqlite` + Drizzle ORM. Schema in `db/schema.ts`, client in `db/client.ts` (native) / `db/client.web.ts` (web). CRUD operations in `db/operations/` — uses **platform-specific files**: `projects.ts`/`recordings.ts` are file-based (native); `projects.web.ts`/`recordings.web.ts` are SQLite-based (web).
- **Services** (`services/`): On-device processing:
  - `processing.ts` — Pipeline: transcribe → anonymize → LLM (auto-routes local Whisper vs Voxtral API)
  - `transcription.ts` — Mistral Voxtral API via raw fetch (with speaker diarization)
  - `anonymization.ts` — Hybrid PII detection: GLiNER NER + regex, regex-only fallback
  - `llm.ts` — LLM provider abstraction (OpenAI, Gemini, Mistral) via raw fetch
  - `fileStorage.ts` — File-based project/recording storage (native only)
  - `audioStorage.ts` — Audio file management
  - `audioConverter.ts` — M4A → WAV conversion via Android MediaCodec
  - `storageMigration.ts` — Storage root migration (copy/adopt/clean)
  - `LocalModelManager.ts` — Backward-compatible façade for whisper/
  - `whisper/` — On-device Whisper transcription (ExecuTorch): model download, WAV parsing, batch inference
  - `gliner/` — On-device GLiNER PII detection (ONNX Runtime): zero-shot NER, SentencePiece tokenizer, model download
- **Contexts** (`contexts/`): `WidgetContext.tsx` — iOS widget refresh via `@bacons/apple-targets`
- **Types** (`types/`): TypeScript type definitions (`Project`, `Recording`, `ApiKeys`, `LLM_PROVIDERS`, etc.)
- **Styles** (`styles/`): Shared colors and styles
- **Utils** (`utils/`): Shared utilities — `recording.ts` (status colors/labels, time formatting), `errorLogger.ts` (dev console capture)
- **Modules** (`modules/audio-converter/`): Android-only Expo native module for M4A → WAV conversion using MediaCodec

## Coding Conventions

- TypeScript throughout.
- Functional React components with hooks.
- Imports use the `@/` path alias for the frontend root.
- ESLint configured at repo root (`.eslintrc.js`); run `npm run lint`.
- Platform-specific files use Metro's `.web.ts` / `.ios.tsx` convention.
- No authentication — single-user local app.

## Testing

- Run frontend lint: `npm run lint` (repo root).
- There is no automated test suite yet; validate changes by running the dev servers and exercising the relevant screens.
- Use Development Builds (`npx expo run:ios` / `run:android`) — Expo Go does not work due to `newArchEnabled: true` (required for ExecuTorch).

## Key Libraries

| Area | Library |
|---|---|
| Navigation | `expo-router` (sole router — do not add `react-router-dom` or standalone `@react-navigation/*` navigators) |
| Database | `expo-sqlite` + `drizzle-orm` (settings, API keys); `sql.js` (web-only project/recording data) |
| Audio | `expo-audio` |
| File storage | `expo-file-system` (native file-based project/recording storage) |
| On-device transcription | `react-native-executorch` — Whisper models (Base ~148MB, Small ~488MB) |
| On-device PII detection | `onnxruntime-web` — GLiNER multi v2.1 (INT8 ~349MB, FP16 ~580MB) |
| LLM/Transcription | Raw `fetch` to OpenAI, Gemini, Mistral REST APIs (no Node.js SDKs) |
| Maps (native) | WebView + Leaflet CDN (no npm map packages) |
| Maps (web) | iframe + Leaflet CDN (no `react-leaflet` — conflicts with React 19) |
| Cross-platform scripts | `cross-env` (required for Windows compatibility) |

## Important Notes

- **Storage split**: On iOS/Android, projects and recordings are stored as plain files in a configurable folder structure via `expo-file-system`. On web, they use SQLite (sql.js) persisted to localStorage. API keys and settings use SQLite on all platforms.
- **Recording IDs on native** are composite: `"{projectFolder}::{timestamp}"`. Parse with `parseRecordingId()` from `services/fileStorage.ts`.
- API keys are stored in the local `api_keys` SQLite table and managed via the Settings screen.
- PII anonymization runs in `services/anonymization.ts` — uses GLiNER NER model (contextual entities like names, organizations, locations) + regex (structured patterns like emails, phones, IBANs). Falls back to regex-only when GLiNER is not downloaded.
- Transcription uses either on-device Whisper (via `react-native-executorch`) or Mistral Voxtral API (with speaker diarization). iOS records WAV directly; Android records M4A and auto-converts to WAV via a native Expo module. Voxtral diarization results are shown as color-coded conversation turns with inline speaker rename.
- The app requires the React Native New Architecture (`newArchEnabled: true` in `app.json`) for ExecuTorch support; Expo Go does not work — use a Development Build.
- **Do not add DOM-only or browser-only npm packages** (e.g., `leaflet`, `react-leaflet`, `react-router-dom`). They conflict with React Native and/or React 19.
- **Do not add `--force` or `--legacy-peer-deps`** to npm install commands. Resolve peer dependency conflicts by finding compatible versions.
- npm scripts use `cross-env` for environment variables to ensure Windows compatibility.
- Use raw `fetch` calls to provider REST APIs instead of Node.js SDKs for React Native compatibility.
