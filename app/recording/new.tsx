
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  TextInput,
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
import { IconSymbol } from '@/components/IconSymbol';
import { colors, commonStyles } from '@/styles/commonStyles';
import { Project } from '@/types';
import { authenticatedGet, authenticatedPost, BACKEND_URL } from '@/utils/api';
import { Modal } from '@/components/ui/Modal';
import { getBearerToken } from '@/utils/api';

/**
 * Allowed audio file extensions for recording uploads.
 * These formats are supported by the expo-audio recorder and the backend transcription service.
 * Note: The backend accepts any audio format and converts it as needed for transcription.
 */
const ALLOWED_AUDIO_EXTENSIONS = ['m4a', 'mp3', 'wav', 'caf', 'aac'];

/**
 * Extract and validate file extension from audio URI.
 * Falls back to 'm4a' (the default expo-audio format) if the extension is unrecognized.
 * This is safe because the backend accepts and converts any audio format.
 * 
 * @param uri The audio file URI
 * @returns Validated file extension, defaults to 'm4a' if invalid
 */
function extractFileExtension(uri: string): string {
  // Remove query parameters if present
  const uriWithoutQuery = uri.split('?')[0];
  const lastDotIndex = uriWithoutQuery.lastIndexOf('.');
  const rawExtension = lastDotIndex > -1 ? uriWithoutQuery.substring(lastDotIndex + 1) : '';
  const normalizedExtension = rawExtension.toLowerCase();
  
  // Validate against whitelist
  if (ALLOWED_AUDIO_EXTENSIONS.includes(normalizedExtension)) {
    return normalizedExtension;
  }
  
  // Log fallback for debugging - m4a is the default format from expo-audio recorder
  console.warn('[extractFileExtension] Unrecognized file extension, falling back to m4a. Original URI:', uri);
  return 'm4a';
}

export default function NewRecordingScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});
  const [hasPermission, setHasPermission] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const loadProject = useCallback(async () => {
    try {
      console.log('[NewRecordingScreen] Loading project details');
      const data = await authenticatedGet<Project>(`/api/projects/${projectId}`);
      setProject(data);

      const initialValues: Record<string, any> = {};
      if (data.customFields && Array.isArray(data.customFields)) {
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
    console.log('[NewRecordingScreen] Initializing for project:', projectId);
    requestPermissions();
    loadProject();
  }, [projectId, loadProject]);

  const requestPermissions = async () => {
    try {
      console.log('[NewRecordingScreen] Requesting microphone permissions');
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
      console.log('[NewRecordingScreen] Permissions granted');
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
      console.log('[NewRecordingScreen] User started recording');
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
      console.log('[NewRecordingScreen] User stopped recording');
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
      setModal({
        visible: true,
        title: 'Error',
        message: 'No audio recorded',
        type: 'error',
      });
      return;
    }

    setIsUploading(true);
    try {
      console.log('[NewRecordingScreen] Creating recording record');
      const createResponse = await authenticatedPost<{ id: string; uploadUrl?: string }>(
        `/api/projects/${projectId}/recordings`,
        { customFieldValues }
      );

      console.log('[NewRecordingScreen] Uploading audio file to recording:', createResponse.id);
      console.log('[NewRecordingScreen] Audio URI:', audioUri);
      
      // Upload audio file using multipart form data
      const formData = new FormData();
      
      // React Native FormData requires the file object in a specific format
      const fileExtension = extractFileExtension(audioUri);
      
      formData.append('audio', {
        uri: audioUri,
        type: `audio/${fileExtension}`,
        name: `recording.${fileExtension}`,
      } as any);

      const token = await getBearerToken();
      const uploadResponse = await fetch(
        `${BACKEND_URL}/api/recordings/${createResponse.id}/upload-audio`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            // Don't set Content-Type - FormData will automatically set it with the
            // correct multipart/form-data boundary parameter
          },
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('[NewRecordingScreen] Upload failed with status:', uploadResponse.status, errorText);
        throw new Error(`Failed to upload audio file: ${uploadResponse.status} - ${errorText}`);
      }

      console.log('[NewRecordingScreen] Upload successful');
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
      setIsUploading(false);
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
  const currentTime = (recorderState.durationMillis || 0) / 1000; // Convert milliseconds to seconds
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
              disabled={isUploading}
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
          </View>
        </View>

        {isUploading && (
          <View style={styles.uploadingContainer}>
            <Text style={styles.uploadingText}>Uploading and processing...</Text>
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
