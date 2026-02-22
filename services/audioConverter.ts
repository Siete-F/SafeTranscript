/**
 * Audio Converter — Native (iOS/Android)
 *
 * Converts audio files (M4A, etc.) to 16kHz mono WAV for local Whisper
 * transcription using Android's built-in MediaCodec APIs via a local
 * Expo module (modules/audio-converter).
 *
 * The temporary WAV file is written to the cache directory and should be
 * deleted after transcription is complete.
 */

export { convertToWav, deleteTempWav } from '../modules/audio-converter/src/AudioConverterModule';
