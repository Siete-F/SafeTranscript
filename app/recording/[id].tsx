
import { useState, useEffect, useCallback } from 'react';
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
import { getRecordingById, deleteRecording } from '@/db/operations/recordings';
import { getApiKeys } from '@/db/operations/apikeys';
import { runProcessingPipeline } from '@/services/processing';
import { getAudioFileUri } from '@/services/audioStorage';
import { Modal } from '@/components/ui/Modal';

export default function RecordingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retranscribing, setRetranscribing] = useState(false);
  const [hasMistralKey, setHasMistralKey] = useState(false);
  const [modal, setModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'confirm';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });
  const [audioUrl, setAudioUrl] = useState('');
  const [showAnonymizedPayload, setShowAnonymizedPayload] = useState(false);

  // Always call hooks unconditionally
  const audioPlayer = useAudioPlayer(audioUrl);
  const playerStatus = useAudioPlayerStatus(audioPlayer);

  const loadRecording = useCallback(async () => {
    try {
      const data = await getRecordingById(id!);
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

  // Check if Mistral API key is configured (for re-transcription)
  useEffect(() => {
    (async () => {
      try {
        const keys = await getApiKeys();
        setHasMistralKey(!!keys.mistralKey);
      } catch {
        setHasMistralKey(false);
      }
    })();
  }, []);

  // Set local audio file URI for playback
  useEffect(() => {
    if (recording?.audioPath) {
      setAudioUrl(getAudioFileUri(recording.audioPath));
    }
  }, [recording?.audioPath]);

  const handlePlayPause = () => {
    if (!audioPlayer || !recording?.audioPath) {
      return;
    }

    console.log('RecordingDetailScreen: User toggled play/pause');
    if (playerStatus?.playing) {
      audioPlayer.pause();
    } else {
      audioPlayer.play();
    }
  };

  const handleDelete = () => {
    setModal({
      visible: true,
      title: 'Delete Recording',
      message: 'Are you sure you want to delete this recording? This cannot be undone.',
      type: 'confirm',
    });
  };

  const confirmDelete = async () => {
    if (!recording) return;
    setModal((prev) => ({ ...prev, visible: false }));
    try {
      await deleteRecording(recording.id);
      router.back();
    } catch (error) {
      console.error('[RecordingDetailScreen] Error deleting recording:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to delete recording',
        type: 'error',
      });
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
      // Skip transcription if one already exists (blob URLs may no longer be valid)
      const skipTranscription = !!recording.transcription;
      console.log(`[RecordingDetailScreen] User triggered reprocessing (skipTranscription=${skipTranscription})`);
      await runProcessingPipeline(recording.id, recording.projectId, { skipTranscription });
      await loadRecording();
    } catch (error) {
      console.error('[RecordingDetailScreen] Error during reprocessing:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to reprocess recording',
        type: 'error',
      });
    } finally {
      setRetrying(false);
      await loadRecording();
    }
  };

  const handleRetranscribe = async () => {
    if (!recording || !hasMistralKey) return;

    setRetranscribing(true);
    try {
      console.log('[RecordingDetailScreen] User triggered re-transcription with Voxtral API');
      await runProcessingPipeline(recording.id, recording.projectId, { forceVoxtralApi: true });
      await loadRecording();
      setModal({
        visible: true,
        title: 'Re-transcribed',
        message: 'Recording has been re-transcribed using the Voxtral API.',
        type: 'success',
      });
    } catch (error) {
      console.error('[RecordingDetailScreen] Error during re-transcription:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to re-transcribe recording',
        type: 'error',
      });
    } finally {
      setRetranscribing(false);
      await loadRecording();
    }
  };

  /** Render transcription text with detected PII values shown in bold */
  const renderTranscriptionWithPII = (text: string, piiMappings?: Record<string, string>) => {
    if (!piiMappings || Object.keys(piiMappings).length === 0) {
      return <Text style={styles.transcriptionText}>{text}</Text>;
    }

    // Collect all original PII values and sort by length (longest first to avoid partial matches)
    const piiValues = Object.values(piiMappings)
      .filter((v) => v.length > 0)
      .sort((a, b) => b.length - a.length);

    if (piiValues.length === 0) {
      return <Text style={styles.transcriptionText}>{text}</Text>;
    }

    // Build a regex that matches any PII value
    const escaped = piiValues.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = text.split(pattern);

    const piiSet = new Set(piiValues.map((v) => v.toLowerCase()));

    return (
      <Text style={styles.transcriptionText}>
        {parts.map((part, i) =>
          piiSet.has(part.toLowerCase()) ? (
            <Text key={i} style={styles.piiHighlight}>{part}</Text>
          ) : (
            <Text key={i}>{part}</Text>
          )
        )}
      </Text>
    );
  };

  const getStatusColor = (status: Recording['status']) => {
    const statusColors: Record<Recording['status'], string> = {
      pending: colors.statusPending,
      transcribing: colors.statusTranscribing,
      anonymizing: colors.statusAnonymizing,
      processing: colors.statusProcessing,
      done: colors.statusDone,
      stale: colors.statusStale,
      error: colors.statusError,
    };
    return statusColors[status];
  };

  const getStatusLabel = (status: Recording['status']) => {
    const labels: Record<Recording['status'], string> = {
      pending: 'Pending',
      transcribing: 'Transcribing',
      anonymizing: 'Anonymizing',
      processing: 'Processing',
      done: 'Done',
      stale: 'Stale',
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
  const rawDuration = playerStatus?.duration;
  const duration = (rawDuration && isFinite(rawDuration) && rawDuration > 0) ? rawDuration : (recording.audioDuration || 0);
  const currentTimeDisplay = formatTime(currentTime);
  const durationDisplay = formatTime(duration);
  
  // Check if recording needs attention (error or pending without audio)
  const hasError = recording.status === 'error';
  const missingAudio = recording.status === 'pending' && !recording.audioPath;
  const canRetry = hasError && recording.audioPath; // Only allow retry for errors with audio

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

        {(recording.audioPath || audioUrl) && (
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

        {recording.audioPath && (
          <TouchableOpacity
            style={styles.reprocessButton}
            onPress={handleRetryTranscription}
            disabled={retrying}
            activeOpacity={0.7}
          >
            {retrying ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <IconSymbol
                ios_icon_name="arrow.clockwise"
                android_material_icon_name="refresh"
                size={16}
                color={colors.primary}
              />
            )}
            <Text style={styles.reprocessButtonText}>
              {retrying ? 'Reprocessing...' : 'Reprocess'}
            </Text>
          </TouchableOpacity>
        )}

        {recording.transcription && (
          <View style={styles.card}>
            <View style={styles.outputHeader}>
              <Text style={styles.sectionTitle}>
                Transcription
                {recording.transcriptionSource === 'whisper' && (
                  <Text style={styles.transcriptionSourceBadge}> (Whisper)</Text>
                )}
                {recording.transcriptionSource === 'voxtral-api' && (
                  <Text style={styles.transcriptionSourceBadge}> (Voxtral)</Text>
                )}
              </Text>
              {recording.anonymizedTranscription && (
                <TouchableOpacity
                  style={[styles.payloadButton, showAnonymizedPayload && styles.payloadButtonActive]}
                  onPress={() => setShowAnonymizedPayload(!showAnonymizedPayload)}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    ios_icon_name="eye.fill"
                    android_material_icon_name="visibility"
                    size={18}
                    color={showAnonymizedPayload ? colors.card : colors.primary}
                  />
                </TouchableOpacity>
              )}
            </View>
            {showAnonymizedPayload && recording.anonymizedTranscription ? (
              <>
                <Text style={styles.payloadLabel}>Anonymized payload sent to LLM:</Text>
                <Text style={styles.anonymizedText}>{recording.anonymizedTranscription}</Text>
              </>
            ) : (
              renderTranscriptionWithPII(recording.transcription, recording.piiMappings)
            )}

            {/* Re-transcribe with Voxtral API — shown when transcription was done with Whisper */}
            {recording.transcriptionSource === 'whisper' && (
              <TouchableOpacity
                style={[
                  styles.retranscribeButton,
                  !hasMistralKey && styles.retranscribeButtonDisabled,
                ]}
                onPress={handleRetranscribe}
                disabled={!hasMistralKey || retranscribing}
                activeOpacity={0.7}
              >
                {retranscribing ? (
                  <ActivityIndicator size="small" color={hasMistralKey ? colors.card : colors.textSecondary} />
                ) : (
                  <IconSymbol
                    ios_icon_name="arrow.triangle.2.circlepath"
                    android_material_icon_name="sync"
                    size={16}
                    color={hasMistralKey ? colors.card : colors.textSecondary}
                  />
                )}
                <Text style={[
                  styles.retranscribeButtonText,
                  !hasMistralKey && styles.retranscribeButtonTextDisabled,
                ]}>
                  {retranscribing ? 'Re-transcribing…' : 'Re-transcribe with Voxtral API'}
                </Text>
                {!hasMistralKey && (
                  <Text style={styles.retranscribeHint}>Mistral API key required</Text>
                )}
              </TouchableOpacity>
            )}
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

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="trash.fill"
            android_material_icon_name="delete"
            size={20}
            color="#FFFFFF"
          />
          <Text style={styles.deleteButtonText}>Delete Recording</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onClose={() => setModal({ ...modal, visible: false })}
        onConfirm={modal.type === 'confirm' ? confirmDelete : undefined}
        confirmText={modal.type === 'confirm' ? 'Delete' : 'OK'}
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
  piiHighlight: {
    fontWeight: '700',
    color: colors.accent,
  },
  payloadButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: `${colors.primary}15`,
  },
  payloadButtonActive: {
    backgroundColor: colors.primary,
  },
  payloadLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  anonymizedText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: `${colors.border}40`,
    padding: 12,
    borderRadius: 8,
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
  reprocessButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: `${colors.primary}15`,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 12,
    gap: 6,
  },
  reprocessButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  transcriptionSourceBadge: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  retranscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 14,
    gap: 8,
  },
  retranscribeButtonDisabled: {
    backgroundColor: `${colors.border}80`,
  },
  retranscribeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.card,
  },
  retranscribeButtonTextDisabled: {
    color: colors.textSecondary,
  },
  retranscribeHint: {
    fontSize: 11,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.statusError,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
