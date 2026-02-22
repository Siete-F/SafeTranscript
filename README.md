# Safe Transcript

A privacy-focused audio transcription and analysis application. Safe Transcript records audio, transcribes it using either an **on-device Whisper model** or the **Mistral Voxtral Transcribe v2** API, anonymizes personally identifiable information (PII), and then processes the cleaned transcript with a configurable LLM for structured output (e.g., summaries, action items).

All data is stored locally on-device. On iOS/Android, projects and recordings are stored as **plain files** (text, markdown, JSON) in a human-readable folder structure. On web, data is stored in SQLite. API keys are always kept in SQLite. No backend server required.

## Features

- **Audio recording** with in-app microphone capture
- **Speech-to-text** via Mistral Voxtral Transcribe v2 (API, with keyword support for domain-specific terms) or **on-device Whisper** (multilingual, via ExecuTorch) — no API key needed for local transcription
- **Re-transcription** — recordings originally transcribed with Whisper can be re-transcribed with the Voxtral API for higher quality
- **PII anonymization** — detects and masks phone numbers, emails, addresses, health IDs, credit card numbers, and more using regex-based detection
- **LLM analysis** — sends anonymized transcripts to a configurable LLM provider (OpenAI, Google Gemini, or Mistral) with a custom prompt
- **Project-based organization** — group recordings into projects with custom fields and export to CSV
- **Cross-platform** — runs on iOS, Android, and Web (Expo / React Native)
- **Fully local** — on mobile, data stored as plain text/markdown files in a browsable folder structure; on web, stored in SQLite. API keys managed locally in SQLite

## Repository Layout

```
├── app/                        # Screens (Expo Router)
│   ├── (tabs)/                 # Tab navigation
│   │   ├── index.tsx           #   Projects list
│   │   └── settings.tsx        #   Settings & API keys
│   ├── project/
│   │   ├── [id].tsx            #   Project detail & recordings list
│   │   └── create.tsx          #   Create project form
│   └── recording/
│       ├── [id].tsx            #   Recording detail (transcript, LLM output, audio player)
│       └── new.tsx             #   New recording (mic capture + upload)
├── components/                 # Shared UI components
├── db/                         # Database & data operations
│   ├── client.ts               #   Native SQLite client (settings & API keys)
│   ├── client.web.ts           #   Web SQLite client (sql.js, all data)
│   ├── schema.ts               #   Drizzle ORM schema
│   └── operations/             #   CRUD operations
│       ├── projects.ts         #     File-based project ops (native)
│       ├── projects.web.ts     #     SQLite project ops (web)
│       ├── recordings.ts       #     File-based recording ops (native)
│       ├── recordings.web.ts   #     SQLite recording ops (web)
│       ├── settings.ts         #     App settings (storage root, etc.)
│       ├── apikeys.ts          #     API key management
│       └── export.ts           #     CSV/JSON export
├── services/                   # On-device services
│   ├── fileStorage.ts          #   File-based storage engine (native)
│   ├── fileStorage.web.ts      #   File storage stub (web)
│   ├── transcription.ts        #   Mistral Voxtral API via raw fetch
│   ├── anonymization.ts        #   Regex-based PII detection & masking
│   ├── llm.ts                  #   LLM provider abstraction (OpenAI, Gemini, Mistral)
│   ├── audioStorage.ts         #   Audio file management
│   ├── processing.ts           #   Processing pipeline (auto-routes local vs API)
│   ├── audioConverter.ts       #   M4A → WAV conversion via FFmpeg (for Android Whisper)
│   ├── LocalModelManager.ts    #   Backward-compatible façade for whisper/
│   └── whisper/                #   On-device Whisper transcription
│       ├── config.ts           #     Model variant definitions (Base, Small)
│       ├── WhisperModelManager.ts  # Download, verify & delete model files
│       ├── audioUtils.ts       #     WAV parser → Float32Array
│       └── whisperInference.ts #     ExecuTorch Whisper batch inference
├── contexts/                   # React contexts
├── utils/                      # Error logger
├── styles/                     # Shared styles
├── types/                      # TypeScript type definitions
├── assets/                     # Images, fonts
└── public/                     # Static web assets
```

## Getting Started

### Prerequisites

- Node.js ≥ 20

### Installation

```bash
npm install
npm run dev          # Start Expo dev server
```

To build the APK for Android:
```ps1
npx eas-cli build -p android --profile preview
```

### API Keys

API keys (OpenAI, Gemini, Mistral) are entered in the Settings screen within the app and stored locally in the SQLite database. No environment variables needed.

## Processing Pipeline

```
Audio Recording
      │
      ▼
Transcription           ──►  Raw transcript
  Whisper model downloaded:  On-device Whisper (Base or Small, multilingual)
                             iOS: records as WAV 16kHz mono directly.
                             Android: records M4A, auto-converts to WAV via FFmpeg.
                             No API key needed.
  No model / web:            Mistral Voxtral Transcribe v2 API
                             Supports M4A, speaker labels, keyword bias.
      │
      ▼
PII Anonymization       ──►  Masked transcript (GLiNER NER + regex, on-device)
      │
      ▼
LLM Analysis            ──►  Structured output (summary, action items, etc.)
```

Recordings transcribed with the local Whisper model can be **re-transcribed** with the Voxtral API from the recording detail screen (requires a Mistral API key).

### Why not Voxtral on-device?

The original plan was to run Mistral's **Voxtral Mini 4B** locally via ExecuTorch. This turned out to be impractical:

- **No public model weights in ExecuTorch format.** Voxtral has no official `.pte` export. The placeholder URL (`your-cdn.com/voxtral-mini-4b-q4.pte`) in the original code was never real — the download completed instantly because it never fetched an actual model file.
- **Model size.** At ~2.5 GB (4-bit quantized), Voxtral Mini 4B is too large for most phones. The quantized Whisper Small model (~488 MB) provides good multilingual quality at a fraction of the size.
- **No batch transcription API.** ExecuTorch's speech-to-text module is built around OpenAI Whisper's architecture (encoder + decoder `.pte` files). Voxtral uses a completely different Mistral-based architecture that is not supported by the `SpeechToTextModule`.
- **Whisper works well.** OpenAI's Whisper multilingual models are proven for Dutch transcription, have official ExecuTorch exports hosted by Software Mansion, and integrate directly with `react-native-executorch`'s `SpeechToTextModule.transcribe()` for batch inference.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile / Web | React Native (0.81.x), Expo SDK 54, Expo Router |
| Storage (mobile) | Plain files (text, markdown, JSON) in folder structure via `expo-file-system` |
| Storage (web) | SQLite via sql.js, persisted to localStorage |
| Settings & Keys | SQLite (expo-sqlite), Drizzle ORM |
| Transcription | Mistral Voxtral Transcribe v2 (API), Whisper multilingual via ExecuTorch (on-device, iOS/Android) |
| Audio conversion | Local Expo module using Android MediaCodec (M4A → WAV for Whisper) |
| PII Detection | Regex-based anonymization (on-device) |
| LLM Providers | OpenAI, Google Gemini, Mistral (via raw fetch) |

## Data Storage (iOS/Android)

On mobile, all project data is stored as human-readable files in a configurable folder structure:

```
{storageRoot}/                            ← default: documentDirectory/SafeTranscript/
  my-project/
    config.json                           ← project settings (LLM config, custom fields, etc.)
    recordings/
      2024-01-15T10-30-00-123.json        ← recording metadata
      2024-01-15T10-30-00-123.m4a/.wav     ← audio file (.wav when local Whisper is active)
    transcriptions/
      2024-01-15T10-30-00-123.txt         ← raw transcription (plain text)
      2024-01-15T10-30-00-123.segments.json
      2024-01-15T10-30-00-123.anonymized.txt
    llm_responses/
      2024-01-15T10-30-00-123.md          ← LLM output (markdown)
```

The timestamp in the filename links the audio, transcription, and LLM response together. The storage root is configurable via the Settings screen.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Expo dev server with tunnel |
| `npm run web` | Start web-only dev server |
| `npm run lint` | Run ESLint |
| `npm run build:web` | Export web build |
