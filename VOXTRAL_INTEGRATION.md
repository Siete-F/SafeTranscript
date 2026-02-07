
# Mistral Voxtral Transcribe 2 Integration

## Overview
The app has been updated to use **Mistral's Voxtral Transcribe 2 Batch API** for audio transcription instead of OpenAI Whisper.

## What Changed

### Backend Changes (Automatic)
The backend transcription service (`backend/src/services/transcription.ts`) has been updated to:
- Use the Mistral AI SDK (`@mistralai/mistralai`)
- Call the Voxtral Transcribe 2 model for batch audio transcription
- Support Dutch and English language detection
- Return timestamps and speaker information
- Use the `MISTRAL_API_KEY` environment variable

### Frontend Changes
Updated the Settings screen to clarify that the Mistral API key is used for:
- **Voxtral Transcribe 2** audio transcription
- LLM processing (when Mistral is selected as the LLM provider)

## How to Use

### 1. Get a Mistral API Key
1. Go to https://console.mistral.ai/
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key (it starts with something like `sk-...`)

### 2. Configure the API Key in the App
1. Open the app
2. Go to the **Settings** tab (bottom navigation)
3. Scroll to the **Mistral AI** section
4. Paste your API key in the input field
5. Tap **Save API Keys**

### 3. Create a Recording
1. Go to the **Projects** tab
2. Select or create a project
3. Tap **New Recording**
4. Record your audio (Dutch or English)
5. Stop recording
6. The audio will be automatically:
   - Uploaded to the backend
   - Transcribed using Voxtral Transcribe 2
   - Processed through the anonymization pipeline (if enabled)
   - Sent to the LLM for analysis

## Technical Details

### Voxtral Transcribe 2 Features
- **Batch Processing**: Processes pre-recorded audio files
- **Language Support**: Automatic detection for Dutch and English
- **Timestamps**: Returns word-level or segment-level timestamps
- **Speaker Detection**: Identifies different speakers in the audio
- **Audio Formats**: Supports WAV, M4A, MP3

### API Integration
The backend now:
1. Receives the audio file from the mobile app
2. Saves it temporarily
3. Sends it to Mistral's Voxtral Transcribe 2 API
4. Parses the response to extract:
   - Full transcription text
   - Segments with timestamps
   - Speaker labels
5. Returns structured data to the app
6. Cleans up temporary files

### Error Handling
If the Mistral API key is not configured or the API call fails:
- The system returns a fallback message
- The recording status is set to "error"
- Users are notified to check their API key configuration

## Benefits of Voxtral Transcribe 2

1. **Specialized for Audio**: Voxtral is specifically designed for audio transcription
2. **Batch Processing**: Optimized for processing pre-recorded audio files
3. **Multi-language**: Native support for Dutch and English
4. **Cost-Effective**: Competitive pricing compared to other transcription services
5. **Privacy**: Audio is processed securely through Mistral's API

## Troubleshooting

### "Transcription not available" Error
- **Cause**: Mistral API key is not configured
- **Solution**: Add your Mistral API key in Settings

### Transcription Takes Too Long
- **Cause**: Large audio files or API rate limits
- **Solution**: Keep recordings under 10 minutes for optimal performance

### Wrong Language Detected
- **Cause**: Audio quality or mixed languages
- **Solution**: Ensure clear audio and consistent language throughout the recording

## Next Steps

The backend is currently being built with the Voxtral Transcribe 2 integration. Once complete:
1. Configure your Mistral API key in Settings
2. Create a test recording
3. Verify the transcription quality
4. Adjust project settings as needed (anonymization, LLM prompts, etc.)

## API Documentation

For more information about Mistral's Voxtral Transcribe 2 API:
- Mistral AI Documentation: https://docs.mistral.ai/
- API Reference: https://docs.mistral.ai/api/
- Voxtral Models: https://docs.mistral.ai/capabilities/audio/
