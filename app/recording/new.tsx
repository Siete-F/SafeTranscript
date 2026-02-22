
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { IOSOutputFormat, AudioQuality } from 'expo-audio/build/RecordingConstants';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, commonStyles } from '@/styles/commonStyles';
import { Project } from '@/types';
import { getProjectById } from '@/db/operations/projects';
import { createRecording, updateRecording } from '@/db/operations/recordings';
import { saveAudioFile } from '@/services/audioStorage';
import { runProcessingPipeline } from '@/services/processing';
import { Modal } from '@/components/ui/Modal';
import { checkWhisperModelExists } from '@/services/whisper/WhisperModelManager';

/**
 * Recording preset for local Whisper transcription.
 * On iOS, records as 16kHz mono WAV (LPCM) which can be directly parsed to Float32Array.
 * On Android, MediaRecorder doesn't support WAV, so we record as M4A and auto-convert
 * to WAV via FFmpeg before Whisper inference.
 */
const WHISPER_RECORDING_PRESET = Platform.OS === 'ios' ? {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  ios: {
    extension: '.wav',
    sampleRate: 16000,
    numberOfChannels: 1,
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: {
    // Not used on iOS, but required by type
    outputFormat: 'mpeg4' as const,
    audioEncoder: 'aac' as const,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
} : RecordingPresets.HIGH_QUALITY;

export default function NewRecordingScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});
  const [hasPermission, setHasPermission] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const [modal, setModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  // Use WAV preset on iOS when Whisper model is available, otherwise standard M4A
  const recordingPreset = whisperAvailable && Platform.OS === 'ios'
    ? WHISPER_RECORDING_PRESET
    : RecordingPresets.HIGH_QUALITY;
  const audioRecorder = useAudioRecorder(recordingPreset);
  const recorderState = useAudioRecorderState(audioRecorder);

  const loadProject = useCallback(async () => {
    try {
      const data = await getProjectById(projectId!);
      setProject(data);

      const initialValues: Record<string, any> = {};
      if (data?.customFields && Array.isArray(data.customFields)) {
        data.customFields.forEach((field) => {
          initialValues[field.name] = '';
        });
      }
      setCustomFieldValues(initialValues);
    } catch (error) {
      console.error('[NewRecordingScreen] Error loading project:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to load project',
        type: 'error',
      });
    }
  }, [projectId]);

  useEffect(() => {
    requestPermissions();
    loadProject();
    // Check if local Whisper model is available
    if (Platform.OS !== 'web') {
      checkWhisperModelExists()
        .then(setWhisperAvailable)
        .catch(() => setWhisperAvailable(false));
    }
  }, [projectId, loadProject]);

  const requestPermissions = async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setModal({
          visible: true,
          title: 'Permission Required',
          message: 'Microphone access is required to record audio',
          type: 'error',
        });
        setHasPermission(false);
        return;
      }
      setHasPermission(true);

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
    } catch (error) {
      console.error('[NewRecordingScreen] Error requesting permissions:', error);
    }
  };

  const handleStartRecording = async () => {
    if (!hasPermission) {
      setModal({
        visible: true,
        title: 'Permission Required',
        message: 'Please grant microphone access to record',
        type: 'error',
      });
      return;
    }

    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      console.error('[NewRecordingScreen] Error starting recording:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to start recording',
        type: 'error',
      });
    }
  };

  const handleStopRecording = async () => {
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      console.log('[NewRecordingScreen] Recording saved to:', uri);
      handleSaveRecording(uri);
    } catch (error) {
      console.error('[NewRecordingScreen] Error stopping recording:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to stop recording',
        type: 'error',
      });
    }
  };

  const handleSaveRecording = async (audioUri: string | null) => {
    if (!audioUri) {
      setModal({ visible: true, title: 'Error', message: 'No audio recorded', type: 'error' });
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Create recording in local DB
      const recording = await createRecording(projectId!, customFieldValues);
      console.log('[NewRecordingScreen] Created recording:', recording.id);

      // 2. Save audio file to persistent local storage
      const audioPath = await saveAudioFile(recording.id, audioUri);
      console.log('[NewRecordingScreen] Audio saved to:', audioPath);

      // 3. Update recording with the audio path
      await updateRecording(recording.id, {
        audioPath,
        audioDuration: Math.round(currentTime),
      });

      // 4. Start the processing pipeline (fire and forget)
      runProcessingPipeline(recording.id, projectId!).catch((err) => {
        console.error('[NewRecordingScreen] Pipeline error:', err);
      });

      setModal({
        visible: true,
        title: 'Success',
        message: 'Recording saved and processing started',
        type: 'success',
      });

      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error) {
      console.error('[NewRecordingScreen] Error saving recording:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to save recording',
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCustomFieldChange = (fieldName: string, value: any) => {
    setCustomFieldValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const minsText = mins.toString().padStart(2, '0');
    const secsText = secs.toString().padStart(2, '0');
    return `${minsText}:${secsText}`;
  };

  const isRecording = recorderState.isRecording;
  const currentTime = (recorderState.durationMillis || 0) / 1000;
  const timeDisplay = formatTime(currentTime);

  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'New Recording',
          headerBackTitle: 'Cancel',
        }}
      />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {project && project.customFields && Array.isArray(project.customFields) && project.customFields.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recording Details</Text>
            {project.customFields.map((field) => (
              <View key={field.name} style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{field.name}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={`Enter ${field.name.toLowerCase()}`}
                  placeholderTextColor={colors.textSecondary}
                  value={customFieldValues[field.name]?.toString() || ''}
                  onChangeText={(value) => handleCustomFieldChange(field.name, value)}
                  keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                />
              </View>
            ))}
          </View>
        )}

        <View style={styles.recorderSection}>
          <View style={styles.recorderCard}>
            <View style={styles.recorderVisual}>
              {isRecording && (
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingDot} />
                </View>
              )}
              <IconSymbol
                ios_icon_name="waveform"
                android_material_icon_name="graphic-eq"
                size={64}
                color={isRecording ? colors.error : colors.textSecondary}
              />
            </View>

            <Text style={styles.timeDisplay}>{timeDisplay}</Text>

            <TouchableOpacity
              style={[
                styles.recordButton,
                isRecording && styles.recordButtonActive,
              ]}
              onPress={isRecording ? handleStopRecording : handleStartRecording}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name={isRecording ? 'stop.fill' : 'mic.fill'}
                android_material_icon_name={isRecording ? 'stop' : 'mic'}
                size={32}
                color={colors.card}
              />
            </TouchableOpacity>

            <Text style={styles.recordHint}>
              {isRecording ? 'Tap to stop recording' : 'Tap to start recording'}
            </Text>
            {whisperAvailable && Platform.OS === 'ios' && (
              <Text style={styles.localModelBadge}>
                Local Whisper • Recording as WAV (16kHz)
              </Text>
            )}
            {whisperAvailable && Platform.OS === 'android' && (
              <Text style={styles.localModelBadge}>
                Local Whisper • M4A → WAV auto-conversion
              </Text>
            )}
          </View>
        </View>

        {isProcessing && (
          <View style={styles.uploadingContainer}>
            <Text style={styles.uploadingText}>Saving and processing...</Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onClose={() => setModal({ ...modal, visible: false })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
  },
  recorderSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  recorderCard: {
    alignItems: 'center',
    width: '100%',
  },
  recorderVisual: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  recordingIndicator: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  recordingDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.error,
  },
  timeDisplay: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 32,
    fontVariant: ['tabular-nums'],
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  recordButtonActive: {
    backgroundColor: colors.error,
  },
  recordHint: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  localModelBadge: {
    fontSize: 12,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  uploadingContainer: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 8,
    alignItems: 'center',
  },
  uploadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
