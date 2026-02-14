
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, commonStyles } from '@/styles/commonStyles';
import { Recording } from '@/types';
import * as Clipboard from 'expo-clipboard';
import { authenticatedGet, authenticatedPost } from '@/utils/api';
import { Modal } from '@/components/ui/Modal';

export default function RecordingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
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

  // Always call hooks unconditionally
  const audioPlayer = useAudioPlayer(recording?.audioUrl || '');
  const playerStatus = useAudioPlayerStatus(audioPlayer);

  const loadRecording = useCallback(async () => {
    try {
      console.log('[RecordingDetailScreen] Fetching recording details from API');
      const data = await authenticatedGet<Recording>(`/api/recordings/${id}`);
      setRecording(data);
    } catch (error) {
      console.error('[RecordingDetailScreen] Error loading recording:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to load recording',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    console.log('[RecordingDetailScreen] Loading recording:', id);
    loadRecording();
  }, [id, loadRecording]);

  const handlePlayPause = () => {
    if (!audioPlayer || !recording?.audioUrl) {
      return;
    }

    console.log('RecordingDetailScreen: User toggled play/pause');
    if (playerStatus?.playing) {
      audioPlayer.pause();
    } else {
      audioPlayer.play();
    }
  };

  const handleCopyOutput = async () => {
    if (!recording?.llmOutput) {
      return;
    }

    console.log('[RecordingDetailScreen] User copied LLM output');
    await Clipboard.setStringAsync(recording.llmOutput);
    setModal({
      visible: true,
      title: 'Copied',
      message: 'LLM output copied to clipboard',
      type: 'success',
    });
  };

  const handleRetryTranscription = async () => {
    if (!recording) {
      return;
    }

    setRetrying(true);
    try {
      console.log('[RecordingDetailScreen] User triggered retry transcription');
      await authenticatedPost(`/api/recordings/${recording.id}/transcribe`, {});
      
      setModal({
        visible: true,
        title: 'Processing',
        message: 'Transcription started. Refresh to see updates.',
        type: 'success',
      });
      
      // Reload the recording after a short delay
      setTimeout(() => {
        loadRecording();
      }, 2000);
    } catch (error) {
      console.error('[RecordingDetailScreen] Error retrying transcription:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to retry transcription',
        type: 'error',
      });
    } finally {
      setRetrying(false);
    }
  };

  const getStatusColor = (status: Recording['status']) => {
    const statusColors = {
      pending: colors.statusPending,
      transcribing: colors.statusTranscribing,
      anonymizing: colors.statusAnonymizing,
      processing: colors.statusProcessing,
      done: colors.statusDone,
      error: colors.statusError,
    };
    return statusColors[status];
  };

  const getStatusLabel = (status: Recording['status']) => {
    const labels = {
      pending: 'Pending',
      transcribing: 'Transcribing',
      anonymizing: 'Anonymizing',
      processing: 'Processing',
      done: 'Done',
      error: 'Error',
    };
    return labels[status];
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const minsText = mins.toString().padStart(2, '0');
    const secsText = secs.toString().padStart(2, '0');
    return `${minsText}:${secsText}`;
  };

  if (loading || !recording) {
    return (
      <SafeAreaView style={commonStyles.container} edges={['top']}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Recording',
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor(recording.status);
  const statusLabel = getStatusLabel(recording.status);
  const isPlaying = playerStatus?.playing || false;
  const currentTime = playerStatus?.currentTime || 0;
  const duration = playerStatus?.duration || recording.audioDuration || 0;
  const currentTimeDisplay = formatTime(currentTime);
  const durationDisplay = formatTime(duration);
  
  // Check if recording needs attention (error or pending without audio)
  const hasError = recording.status === 'error';
  const missingAudio = recording.status === 'pending' && !recording.audioUrl;
  const needsAttention = hasError || missingAudio;
  const canRetry = hasError && recording.audioUrl; // Only allow retry for errors with audio

  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Recording Details',
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
          <Text style={styles.dateText}>
            {new Date(recording.createdAt).toLocaleString()}
          </Text>
        </View>

        {/* Show error message if recording failed */}
        {hasError && recording.errorMessage && (
          <View style={styles.errorCard}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="error"
              size={24}
              color={colors.statusError}
            />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>Processing Error</Text>
              <Text style={styles.errorMessage}>{recording.errorMessage}</Text>
            </View>
          </View>
        )}

        {/* Show retry button for failed recordings with audio */}
        {canRetry && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetryTranscription}
            disabled={retrying}
            activeOpacity={0.7}
          >
            {retrying ? (
              <ActivityIndicator color={colors.card} />
            ) : (
              <>
                <IconSymbol
                  ios_icon_name="arrow.clockwise"
                  android_material_icon_name="refresh"
                  size={20}
                  color={colors.card}
                />
                <Text style={styles.retryButtonText}>Retry Processing</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Show warning for pending recordings without audio */}
        {missingAudio && (
          <View style={styles.warningCard}>
            <IconSymbol
              ios_icon_name="exclamationmark.circle.fill"
              android_material_icon_name="warning"
              size={24}
              color={colors.statusPending}
            />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Audio Not Uploaded</Text>
              <Text style={styles.warningMessage}>
                The recording was created but the audio file was not uploaded. 
                Please record again to complete the upload.
              </Text>
            </View>
          </View>
        )}

        {recording.audioUrl && (
          <View style={styles.playerCard}>
            <Text style={styles.sectionTitle}>Audio Playback</Text>
            <View style={styles.playerControls}>
              <TouchableOpacity
                style={styles.playButton}
                onPress={handlePlayPause}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name={isPlaying ? 'pause.fill' : 'play.fill'}
                  android_material_icon_name={isPlaying ? 'pause' : 'play-arrow'}
                  size={32}
                  color={colors.card}
                />
              </TouchableOpacity>
              <View style={styles.timeContainer}>
                <Text style={styles.timeText}>{currentTimeDisplay}</Text>
                <Text style={styles.timeSeparator}>/</Text>
                <Text style={styles.timeText}>{durationDisplay}</Text>
              </View>
            </View>
          </View>
        )}

        {recording.transcription && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Transcription</Text>
            <Text style={styles.transcriptionText}>{recording.transcription}</Text>
          </View>
        )}

        {recording.llmOutput && (
          <View style={styles.card}>
            <View style={styles.outputHeader}>
              <Text style={styles.sectionTitle}>LLM Output</Text>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={handleCopyOutput}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="doc.on.doc"
                  android_material_icon_name="content-copy"
                  size={20}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.outputText}>{recording.llmOutput}</Text>
          </View>
        )}

        {Object.keys(recording.customFieldValues).length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Custom Fields</Text>
            {Object.entries(recording.customFieldValues).map(([key, value]) => (
              <View key={key} style={styles.fieldRow}>
                <Text style={styles.fieldKey}>{key}:</Text>
                <Text style={styles.fieldValue}>{value}</Text>
              </View>
            ))}
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
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  statusCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dateText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  playerCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  playerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  timeSeparator: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  transcriptionText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  outputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  copyButton: {
    padding: 4,
  },
  outputText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  fieldRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  fieldKey: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginRight: 8,
  },
  fieldValue: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  errorCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.statusError,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  errorContent: {
    flex: 1,
    marginLeft: 12,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.statusError,
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.statusPending,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  warningContent: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.statusPending,
    marginBottom: 4,
  },
  warningMessage: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.card,
  },
});
