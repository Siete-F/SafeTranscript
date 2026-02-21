
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, commonStyles } from '@/styles/commonStyles';
import { Project, Recording, LLM_PROVIDERS } from '@/types';
import { getProjectById, updateProject } from '@/db/operations/projects';
import { getRecordingsByProject, deleteRecording, updateRecording } from '@/db/operations/recordings';
import { exportProjectCSV } from '@/db/operations/export';
import { getAudioFileUri } from '@/services/audioStorage';
import { runProcessingPipeline } from '@/services/processing';
import { Modal } from '@/components/ui/Modal';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  const [recordingToDelete, setRecordingToDelete] = useState<Recording | null>(null);
  const [playingRecordingId, setPlayingRecordingId] = useState<string | null>(null);
  const [playableAudioUrl, setPlayableAudioUrl] = useState('');

  // Config modal state
  const [configVisible, setConfigVisible] = useState(false);
  const [configName, setConfigName] = useState('');
  const [configDescription, setConfigDescription] = useState('');
  const [configLlmProvider, setConfigLlmProvider] = useState<'openai' | 'gemini' | 'mistral'>('gemini');
  const [configLlmModel, setConfigLlmModel] = useState('');
  const [configLlmPrompt, setConfigLlmPrompt] = useState('');
  const [configEnableLlm, setConfigEnableLlm] = useState(true);
  const [configEnableAnon, setConfigEnableAnon] = useState(true);
  const [configSensitiveWords, setConfigSensitiveWords] = useState('');
  const [configSaving, setConfigSaving] = useState(false);

  // Reprocess prompt state
  const [reprocessVisible, setReprocessVisible] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const audioPlayer = useAudioPlayer(playableAudioUrl);
  const playerStatus = useAudioPlayerStatus(audioPlayer);

  // Set local audio file URI when a recording is selected for playback
  useEffect(() => {
    if (!playingRecordingId) {
      setPlayableAudioUrl('');
      return;
    }
    const rec = recordings.find((r) => r.id === playingRecordingId);
    if (rec?.audioPath) {
      setPlayableAudioUrl(getAudioFileUri(rec.audioPath));
    } else {
      setPlayingRecordingId(null);
    }
  }, [playingRecordingId, recordings]);

  // Auto-play when a new audio URL is loaded
  useEffect(() => {
    if (playableAudioUrl && audioPlayer) {
      audioPlayer.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playableAudioUrl]);

  const handlePlayPause = (recording: Recording) => {
    if (!recording.audioPath || !recording.id) return;

    if (playingRecordingId === recording.id) {
      if (playerStatus?.playing) {
        audioPlayer.pause();
      } else {
        audioPlayer.play();
      }
    } else {
      setPlayingRecordingId(recording.id);
    }
  };

  const loadProject = useCallback(async () => {
    try {
      const data = await getProjectById(id!);
      setProject(data);
    } catch (error) {
      console.error('[ProjectDetailScreen] Error loading project:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to load project',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadRecordings = useCallback(async () => {
    try {
      const data = await getRecordingsByProject(id!);
      setRecordings(data);
    } catch (error) {
      console.error('[ProjectDetailScreen] Error loading recordings:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to load recordings',
        type: 'error',
      });
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    console.log('[ProjectDetailScreen] Loading project:', id);
    loadProject();
  }, [id, loadProject]);

  // Reload recordings every time the screen gains focus (e.g. after creating a new recording)
  useFocusEffect(
    useCallback(() => {
      console.log('[ProjectDetailScreen] Screen focused, reloading recordings');
      loadRecordings();
    }, [loadRecordings])
  );

  const handleRefresh = () => {
    console.log('ProjectDetailScreen: User triggered refresh');
    setRefreshing(true);
    loadRecordings();
  };

  const handleNewRecording = () => {
    console.log('ProjectDetailScreen: User tapped New Recording button');
    router.push(`/recording/new?projectId=${id}`);
  };

  const handleRecordingPress = (recording: Recording) => {
    console.log('ProjectDetailScreen: User tapped recording:', recording.id);
    if (!recording.id) {
      setModal({
        visible: true,
        title: 'Invalid Recording',
        message: 'This recording was not created properly. You can delete it by swiping left or using the delete button.',
        type: 'error',
      });
      return;
    }
    router.push(`/recording/${recording.id}`);
  };

  const handleExportCSV = async () => {
    console.log('[ProjectDetailScreen] User tapped Export CSV button');
    try {
      const csvData = await exportProjectCSV(id!);
      
      if (Platform.OS === 'web') {
        // Web platform: Create a blob and trigger download
        try {
          const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `project_${id}_export.csv`;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          
          // Cleanup
          setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }, 100);
          
          setModal({
            visible: true,
            title: 'Export Complete',
            message: 'CSV file has been downloaded',
            type: 'success',
          });
        } catch (downloadError) {
          throw new Error('Failed to trigger download: ' + (downloadError instanceof Error ? downloadError.message : 'Unknown error'));
        }
      } else {
        // Mobile platforms: Use FileSystem and Sharing
        const fileUri = `${FileSystem.documentDirectory}project_${id}_export.csv`;
        await FileSystem.writeAsStringAsync(fileUri, csvData);
        
        // Share the file
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          setModal({
            visible: true,
            title: 'Export Complete',
            message: `CSV saved to: ${fileUri}`,
            type: 'success',
          });
        }
      }
    } catch (error) {
      console.error('[ProjectDetailScreen] Error exporting CSV:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to export CSV',
        type: 'error',
      });
    }
  };

  const handleDeleteRecording = (recording: Recording) => {
    const customFieldEntries = recording.customFieldValues
      ? Object.entries(recording.customFieldValues)
          .filter(([, value]) => value !== null && value !== undefined && value !== '')
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')
      : '';
    const customFieldInfo = customFieldEntries
      ? `\n\nCustom fields:\n${customFieldEntries}`
      : '';
    setRecordingToDelete(recording);
    setModal({
      visible: true,
      title: 'Delete Recording',
      message: `Are you sure you want to delete this recording?${customFieldInfo}`,
      type: 'confirm',
    });
  };

  const confirmDeleteRecording = async () => {
    if (!recordingToDelete) return;
    const toDelete = recordingToDelete;
    // Close the confirm modal immediately
    setModal((prev) => ({ ...prev, visible: false }));
    setRecordingToDelete(null);
    try {
      if (toDelete.id) {
        await deleteRecording(toDelete.id);
      }
      // Remove from local state regardless (handles recordings with undefined IDs)
      setRecordings((prev) => {
        if (toDelete.id) {
          return prev.filter((r) => r.id !== toDelete.id);
        }
        // For recordings without an ID, remove by reference equality
        const idx = prev.indexOf(toDelete);
        if (idx !== -1) {
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        }
        return prev;
      });
    } catch (error) {
      console.error('[ProjectDetailScreen] Error deleting recording:', error);
      // Even if the API call fails, still remove from local state if the recording has no ID
      if (!toDelete.id) {
        setRecordings((prev) => {
          const idx = prev.indexOf(toDelete);
          if (idx !== -1) {
            const next = [...prev];
            next.splice(idx, 1);
            return next;
          }
          return prev;
        });
        return;
      }
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to delete recording',
        type: 'error',
      });
    }
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

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const minsText = `${mins}m`;
    const secsText = `${secs}s`;
    return `${minsText} ${secsText}`;
  };

  const RightAction = ({
    item,
    drag,
  }: {
    item: Recording;
    drag: SharedValue<number>;
  }) => {
    const styleAnimation = useAnimatedStyle(() => ({
      transform: [{ translateX: drag.value + 80 }],
    }));

    return (
      <Pressable onPress={() => handleDeleteRecording(item)}>
        <Reanimated.View style={[styleAnimation, styles.swipeDeleteAction]}>
          <IconSymbol
            ios_icon_name="trash.fill"
            android_material_icon_name="delete"
            size={24}
            color="#FFFFFF"
          />
        </Reanimated.View>
      </Pressable>
    );
  };

  const RecordingCardContent = ({ item }: { item: Recording }) => {
    const statusColor = getStatusColor(item.status);
    const statusLabel = getStatusLabel(item.status);
    const durationText = item.audioDuration ? formatDuration(item.audioDuration) : 'N/A';
    const dateText = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Unknown';
    const needsAttention = item.status === 'error' || (item.status === 'pending' && !item.audioPath);
    const isThisPlaying = playingRecordingId === item.id && playerStatus?.playing;

    return (
      <TouchableOpacity
        style={styles.recordingCard}
        onPress={() => handleRecordingPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.recordingHeader}>
          <View style={styles.recordingHeaderLeft}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
            {needsAttention && (
              <IconSymbol
                ios_icon_name="exclamationmark.circle.fill"
                android_material_icon_name="error"
                size={20}
                color={colors.statusError}
              />
            )}
          </View>
          <View style={styles.recordingHeaderRight}>
            {Platform.OS === 'web' && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  handleDeleteRecording(item);
                }}
                style={styles.webDeleteButton}
              >
                <IconSymbol
                  ios_icon_name="trash.fill"
                  android_material_icon_name="delete"
                  size={18}
                  color={colors.statusError}
                />
              </Pressable>
            )}
            <Text style={styles.recordingDate}>{dateText}</Text>
          </View>
        </View>

        <View style={styles.recordingMeta}>
          {item.audioPath && item.id && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handlePlayPause(item);
              }}
              style={styles.inlinePlayButton}
            >
              <IconSymbol
                ios_icon_name={isThisPlaying ? 'pause.fill' : 'play.fill'}
                android_material_icon_name={isThisPlaying ? 'pause' : 'play-arrow'}
                size={18}
                color="#FFFFFF"
              />
            </Pressable>
          )}
          <View style={styles.metaItem}>
            <IconSymbol
              ios_icon_name="clock.fill"
              android_material_icon_name="access-time"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={styles.metaText}>{durationText}</Text>
          </View>
        </View>

        {item.llmOutput && (
          <Text style={styles.recordingPreview} numberOfLines={2}>
            {item.llmOutput}
          </Text>
        )}

        {needsAttention && !item.audioPath && (
          <Text style={styles.recordingWarning}>
            Audio upload required
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderRecording = ({ item }: { item: Recording }) => {
    // On web, skip ReanimatedSwipeable to avoid SwipeDirection crash
    if (Platform.OS === 'web') {
      return <RecordingCardContent item={item} />;
    }

    return (
      <ReanimatedSwipeable
        friction={2}
        enableTrackpadTwoFingerGesture
        rightThreshold={40}
        renderRightActions={(_prog, drag) => (
          <RightAction item={item} drag={drag} />
        )}
        overshootRight={false}
      >
        <RecordingCardContent item={item} />
      </ReanimatedSwipeable>
    );
  };

  const emptyComponent = () => (
    <View style={styles.emptyContainer}>
      <IconSymbol
        ios_icon_name="mic.badge.plus"
        android_material_icon_name="mic"
        size={64}
        color={colors.textSecondary}
      />
      <Text style={styles.emptyTitle}>No Recordings Yet</Text>
      <Text style={styles.emptyText}>
        Start your first recording to transcribe and process audio
      </Text>
    </View>
  );

  const projectName = project?.name || 'Project';

  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: projectName,
          headerBackTitle: 'Back',
        }}
      />

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleNewRecording}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="mic.fill"
            android_material_icon_name="mic"
            size={20}
            color={colors.card}
          />
          <Text style={styles.actionButtonText}>New Recording</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={handleExportCSV}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="square.and.arrow.up"
            android_material_icon_name="file-download"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
            Export CSV
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={recordings}
        renderItem={renderRecording}
        keyExtractor={(item, index) => item.id || `recording-${index}`}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={!loading ? emptyComponent : null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      />

      <Modal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onClose={() => {
          setModal({ ...modal, visible: false });
          setRecordingToDelete(null);
        }}
        onConfirm={modal.type === 'confirm' ? confirmDeleteRecording : undefined}
        confirmText={modal.type === 'confirm' ? 'Delete' : 'OK'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  actionButtonText: {
    color: colors.card,
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: colors.primary,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  recordingCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  recordingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recordingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webDeleteButton: {
    padding: 4,
    borderRadius: 4,
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
  recordingDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  recordingMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  inlinePlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  recordingPreview: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  recordingWarning: {
    fontSize: 13,
    color: colors.statusError,
    marginTop: 8,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  swipeDeleteAction: {
    width: 80,
    height: '100%',
    backgroundColor: colors.statusError,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
});
