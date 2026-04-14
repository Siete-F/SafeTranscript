
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, commonStyles } from '@/styles/commonStyles';
import { Recording } from '@/types';
import * as Clipboard from 'expo-clipboard';
import { getRecordingById, deleteRecording, updateRecording } from '@/db/operations/recordings';
import { getApiKeys } from '@/db/operations/apikeys';
import { getSelfHostedTranscriptionUrl } from '@/db/operations/settings';
import { runProcessingPipeline } from '@/services/processing';
import { getAudioFileUri } from '@/services/audioStorage';
import { Modal } from '@/components/ui/Modal';
import { TranscriptionCard } from '@/components/recording/TranscriptionCard';
import { LlmOutputCard } from '@/components/recording/LlmOutputCard';
import { useModal } from '@/hooks/useModal';
import { getStatusColor, getStatusLabel, formatTime } from '@/utils/recording';

export default function RecordingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retranscribing, setRetranscribing] = useState(false);
  const [hasMistralKey, setHasMistralKey] = useState(false);
  const [hasSelfHostedUrl, setHasSelfHostedUrl] = useState(false);
  const { modal, setModal, showModal, hideModal } = useModal();
  const [audioUrl, setAudioUrl] = useState('');

  const audioPlayer = useAudioPlayer(audioUrl);
  const playerStatus = useAudioPlayerStatus(audioPlayer);

  const loadRecording = useCallback(async () => {
    try {
      const data = await getRecordingById(id!);
      setRecording(data);
    } catch (error) {
      console.error('[RecordingDetailScreen] Error loading recording:', error);
      showModal('Error', error instanceof Error ? error.message : 'Failed to load recording', 'error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    console.log('[RecordingDetailScreen] Loading recording:', id);
    loadRecording();
  }, [id, loadRecording]);

  useEffect(() => {
    (async () => {
      try {
        const keys = await getApiKeys();
        setHasMistralKey(!!keys.mistralKey);
      } catch {
        setHasMistralKey(false);
      }
    })();
    (async () => {
      try {
        const url = await getSelfHostedTranscriptionUrl();
        setHasSelfHostedUrl(!!url && url.trim().length > 0);
      } catch {
        setHasSelfHostedUrl(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (recording?.audioPath) {
      setAudioUrl(getAudioFileUri(recording.audioPath));
    }
  }, [recording?.audioPath]);

  const handlePlayPause = () => {
    if (!audioPlayer || !recording?.audioPath) return;
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
    hideModal();
    try {
      await deleteRecording(recording.id);
      router.back();
    } catch (error) {
      console.error('[RecordingDetailScreen] Error deleting recording:', error);
      showModal('Error', error instanceof Error ? error.message : 'Failed to delete recording', 'error');
    }
  };

  const handleCopyOutput = async () => {
    if (!recording?.llmOutput) return;
    await Clipboard.setStringAsync(recording.llmOutput);
    showModal('Copied', 'LLM output copied to clipboard', 'success');
  };

  const handleRetryTranscription = async () => {
    if (!recording) return;
    setRetrying(true);
    try {
      const skipTranscription = !!recording.transcription;
      await runProcessingPipeline(recording.id, recording.projectId, { skipTranscription });
      await loadRecording();
    } catch (error) {
      console.error('[RecordingDetailScreen] Error during reprocessing:', error);
      showModal('Error', error instanceof Error ? error.message : 'Failed to reprocess recording', 'error');
    } finally {
      setRetrying(false);
      await loadRecording();
    }
  };

  const handleRetranscribe = async () => {
    if (!recording || !hasMistralKey) return;
    setRetranscribing(true);
    try {
      await runProcessingPipeline(recording.id, recording.projectId, { forceVoxtralApi: true });
      await loadRecording();
      showModal('Re-transcribed', 'Recording has been re-transcribed using the Voxtral API.', 'success');
    } catch (error) {
      console.error('[RecordingDetailScreen] Error during re-transcription:', error);
      showModal('Error', error instanceof Error ? error.message : 'Failed to re-transcribe recording', 'error');
    } finally {
      setRetranscribing(false);
      await loadRecording();
    }
  };

  const handleRetranscribeSelfHosted = async () => {
    if (!recording) return;
    setRetranscribing(true);
    try {
      await runProcessingPipeline(recording.id, recording.projectId, { forceSelfHosted: true });
      await loadRecording();
      showModal('Re-transcribed', 'Recording has been re-transcribed using the self-hosted endpoint.', 'success');
    } catch (error) {
      console.error('[RecordingDetailScreen] Error during self-hosted re-transcription:', error);
      showModal('Error', error instanceof Error ? error.message : 'Failed to re-transcribe recording', 'error');
    } finally {
      setRetranscribing(false);
      await loadRecording();
    }
  };

  const handleSpeakerRename = async (speakerId: string, newName: string) => {
    if (!recording) return;
    const updatedMap = { ...recording.speakerMap, [speakerId]: newName };
    try {
      await updateRecording(recording.id, { speakerMap: updatedMap });
      setRecording((prev) => prev ? { ...prev, speakerMap: updatedMap } : prev);
    } catch (error) {
      console.error('[RecordingDetailScreen] Error renaming speaker:', error);
    }
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

  const hasError = recording.status === 'error';
  const missingAudio = recording.status === 'pending' && !recording.audioPath;
  const canRetry = hasError && recording.audioPath;

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
          <TranscriptionCard
            transcription={recording.transcription}
            transcriptionSource={recording.transcriptionSource}
            transcriptionData={recording.transcriptionData}
            speakerMap={recording.speakerMap}
            anonymizedTranscription={recording.anonymizedTranscription}
            piiMappings={recording.piiMappings}
            hasMistralKey={hasMistralKey}
            hasSelfHostedUrl={hasSelfHostedUrl}
            retranscribing={retranscribing}
            onRetranscribe={handleRetranscribe}
            onRetranscribeSelfHosted={handleRetranscribeSelfHosted}
            onSpeakerRename={handleSpeakerRename}
          />
        )}

        {recording.llmOutput && (
          <LlmOutputCard
            output={recording.llmOutput}
            onCopy={handleCopyOutput}
          />
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
        onClose={hideModal}
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
