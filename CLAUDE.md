# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Safe Transcript is a privacy-focused audio transcription app built with React Native (Expo). It records audio, transcribes it using either an on-device Whisper model (via ExecuTorch) or the Mistral Voxtral API, anonymizes PII, and  processes cleaned transcripts with a configurable LLM. The app is fully local — on iOS/Android, projects and recordings are stored as plain files (markdown, text, JSON) in a configurable folder structure; on web, data is stored in SQLite (sql.js). API keys and app settings remain in SQLite on all platforms. External API calls (transcription, LLM) are made directly from the device using user-provided API keys.

## Commands

### Frontend (repo root)
- `npm run dev` — Start Expo dev server with tunnel
- `npm run web` — Web-only dev server
- `npm run lint` — ESLint
- `npm run build:web` — Export web build
- `npx eas-cli build -p android --profile preview` — Build Android APK

### Environment Setup
- No backend server needed — app is fully local
- API keys (OpenAI, Gemini, Mistral) are entered in the Settings screen and stored in the local SQLite database

## Architecture

**Frontend:** React Native 0.81 + Expo SDK 54 + Expo Router (file-based routing) + React 19
- Screens in `app/` with tab navigation in `app/(tabs)/`
- `@/` path alias for imports from the frontend root
- No authentication — single-user local app
- On-device transcription via Whisper (ExecuTorch) managed by `services/whisper/` and `services/LocalModelManager.ts`

**Storage (iOS/Android) — file-based:**
- Projects and recordings stored as plain files in a configurable folder structure
- `services/fileStorage.ts` — core file I/O service (read/write JSON, text, audio)
- `db/operations/projects.ts` — project CRUD via folder + `config.json`
- `db/operations/recordings.ts` — recording CRUD via timestamp-named files
- Project ID = folder slug (e.g. `my-project`); Recording ID = `"{folder}::{timestamp}"`
- Storage root configurable via Settings screen and persisted in `settings` table in SQLite, default: `documentDirectory/SafeTranscript/`
- `services/storageMigration.ts` — handles storage root changes: validates new path, detects existing data, copies or adopts data. When changing location: if the new path already contains SafeTranscript project folders, they are adopted automatically; otherwise the user chooses to copy existing data or start clean.

**Storage (Web) — SQLite:**
- Web builds use `.web.ts` platform files that preserve the original SQLite-based operations
- `db/operations/projects.web.ts`, `db/operations/recordings.web.ts` — SQLite CRUD via sql.js
- `services/fileStorage.web.ts` — stub (web has no real filesystem)

**Database (all platforms):** SQLite via `expo-sqlite` + Drizzle ORM
- Schema in `db/schema.ts` — tables: `projects`, `recordings` (web only), `api_keys`, `settings`
- `settings` table stores key/value pairs (e.g. `storage_root`)
- `api_keys` table stores LLM API keys (kept in SQLite for privacy)
- Database client in `db/client.ts` (native) / `db/client.web.ts` (web)

**Services (run on-device):**
- `services/transcription.ts` — Mistral Voxtral API via raw fetch with multipart form data
- `services/anonymization.ts` — Regex-based PII detection and masking
- `services/llm.ts` — Raw fetch to OpenAI/Gemini/Mistral REST APIs
- `services/audioStorage.ts` — Audio file management (delegates to fileStorage on native)
- `services/storageMigration.ts` — Storage root migration: path validation, existing-data detection, recursive copy, adopt/clean modes
- `services/processing.ts` — Processing pipeline: transcribe → anonymize → LLM process (auto-routes to local Whisper or Mistral API). Supports `forceVoxtralApi` option for re-transcription.
- `services/audioConverter.ts` — Converts M4A/other audio to 16kHz mono WAV via `ffmpeg-kit-react-native` for local Whisper on Android
- `services/audioConverter.web.ts` — Web stub (no conversion needed)
- `services/fileStorage.ts` — File-based project/recording storage (native only)
- `services/whisper/` — On-device Whisper transcription:
  - `config.ts` — Model variant definitions (Base ~148MB, Small ~488MB) with HuggingFace URLs
  - `WhisperModelManager.ts` — Download/delete/verify model files on disk (encoder, decoder, tokenizer)
  - `WhisperModelManager.web.ts` — Web stub (local models not supported on web)
  - `audioUtils.ts` — WAV file parser: reads PCM → Float32Array at 16kHz for Whisper input
  - `whisperInference.ts` — Loads and runs Whisper via `SpeechToTextModule` (react-native-executorch). Auto-converts non-WAV audio to WAV before inference.
- `services/LocalModelManager.ts` — Backward-compatible façade that delegates to `services/whisper/`

**Processing Pipeline:** Audio → Whisper (local, on iOS/Android — M4A auto-converted to WAV on Android via FFmpeg) or Voxtral Transcribe v2 (API) → PII Anonymization (regex-based or GLiNER) → LLM Analysis (OpenAI/Gemini/Mistral)

Recordings transcribed with Whisper can be **re-transcribed** with the Voxtral API from the recording detail screen. The `transcriptionSource` field (`'whisper' | 'voxtral-api'`) is stored in recording metadata to track which method was used.

## Key Constraints

- **Do NOT add DOM-only npm packages** (leaflet, react-leaflet, react-router-dom) — they conflict with React Native and/or React 19. Use CDN resources via WebView/iframe instead.
- **Do NOT use `--force` or `--legacy-peer-deps`** with npm install. Resolve peer conflicts by finding compatible versions.
- **expo-router is the sole router** — do not add `react-router-dom` or standalone `@react-navigation/*` navigators.
- **New Architecture is required** (`newArchEnabled: true` in app.json) for ExecuTorch. Expo Go does not work — use Development Builds (`npx expo run:ios` / `run:android`).
- **DB inserts must provide explicit values** for UUID/timestamp fields. Serialize Date objects to ISO strings. Don't include `null` values for optional fields — omit them instead.
- **Platform-specific files** use Metro's `.web.ts` convention. `projects.ts`/`recordings.ts` are file-based (native); `projects.web.ts`/`recordings.web.ts` are SQLite-based (web).
- **Recording IDs on native** are composite: `"{projectFolder}::{timestamp}"`. Parse with `parseRecordingId()` from `services/fileStorage.ts`.
- `cross-env` is required in npm scripts for Windows compatibility.
- Maps use WebView + Leaflet CDN on native, iframe + Leaflet CDN on web (no npm map packages).
- **LLM/transcription SDKs**: Use raw `fetch` calls to provider REST APIs instead of Node.js SDKs for React Native compatibility.
- **Local transcription** works on both iOS and Android. On iOS, recordings are directly captured as WAV (16kHz mono LPCM) when the Whisper model is downloaded. On Android, recordings are M4A (MediaRecorder limitation) and are automatically converted to WAV via `ffmpeg-kit-react-native` before Whisper inference. The temporary WAV is deleted after transcription.

## LLM Providers

Configured per-project. Supported: OpenAI (gpt-4, gpt-3.5-turbo), Google Gemini (gemini-2.5-pro, gemini-1.5-flash), Mistral (mistral-large-latest, mistral-small-latest). User API keys stored in the local `api_keys` table, managed via the Settings screen.

## Data Storage

**Native (iOS/Android) — folder structure:**
```
{storageRoot}/                            ← configurable, default: documentDirectory/SafeTranscript/
  {project-slug}/
    config.json                           ← project settings (LLM config, custom fields, etc.)
    recordings/
      {timestamp}.json                    ← recording metadata (status, duration, PII mappings)
      {timestamp}.m4a / .wav               ← audio file (.wav when local Whisper is active on iOS)
    transcriptions/
      {timestamp}.txt                     ← raw transcription (plain text)
      {timestamp}.segments.json           ← transcription segments with timestamps
      {timestamp}.anonymized.txt          ← anonymized transcription
    llm_responses/
      {timestamp}.md                      ← LLM output (markdown)
```

**Web — SQLite (sql.js):** Full SQLite tables for `projects` and `recordings` (same schema as before the file-based migration), persisted to localStorage.

**All platforms — SQLite:** `api_keys` (single-row, LLM API keys), `settings` (key/value, e.g. `storage_root`). Tables created on first launch via `initializeDatabase()` in `db/client.ts`.
