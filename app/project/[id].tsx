
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
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, commonStyles } from '@/styles/commonStyles';
import { Project, Recording } from '@/types';
import { getProjectById, updateProject, deleteProject } from '@/db/operations/projects';
import { getRecordingsByProject, deleteRecording, updateRecording } from '@/db/operations/recordings';
import { exportProjectJSON, exportProjectXLS } from '@/db/operations/export';
import { exportsDir, exportFilePath } from '@/services/fileStorage';
import { getAudioFileUri } from '@/services/audioStorage';
import { runProcessingPipeline } from '@/services/processing';
import { Modal } from '@/components/ui/Modal';
import { RecordingCard } from '@/components/project/RecordingCard';
import { ProjectConfigModal, type ProjectConfigUpdate } from '@/components/project/ProjectConfigModal';
import { ExportModal, type ExportFormat } from '@/components/project/ExportModal';
import { useModal } from '@/hooks/useModal';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { modal, setModal, showModal, hideModal } = useModal();
  const [recordingToDelete, setRecordingToDelete] = useState<Recording | null>(null);
  const [playingRecordingId, setPlayingRecordingId] = useState<string | null>(null);
  const [playableAudioUrl, setPlayableAudioUrl] = useState('');

  const [configVisible, setConfigVisible] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  const [reprocessVisible, setReprocessVisible] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const [deleteProjectVisible, setDeleteProjectVisible] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportedFileUri, setExportedFileUri] = useState<string | null>(null);

  const audioPlayer = useAudioPlayer(playableAudioUrl);
  const playerStatus = useAudioPlayerStatus(audioPlayer);

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
      showModal('Error', error instanceof Error ? error.message : 'Failed to load project', 'error');
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
      showModal('Error', error instanceof Error ? error.message : 'Failed to load recordings', 'error');
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    console.log('[ProjectDetailScreen] Loading project:', id);
    loadProject();
  }, [id, loadProject]);

  useFocusEffect(
    useCallback(() => {
      console.log('[ProjectDetailScreen] Screen focused, reloading recordings');
      loadRecordings();
    }, [loadRecordings])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadRecordings();
  };

  const handleNewRecording = () => {
    router.push(`/recording/new?projectId=${id}`);
  };

  const handleRecordingPress = (recording: Recording) => {
    if (!recording.id) {
      showModal('Invalid Recording', 'This recording was not created properly. You can delete it by swiping left or using the delete button.', 'error');
      return;
    }
    router.push(`/recording/${recording.id}`);
  };

  const handleExport = async (format: ExportFormat) => {
    setExporting(true);
    setExportingFormat(format);
    try {
      const data = format === 'json'
        ? await exportProjectJSON(id!)
        : await exportProjectXLS(id!);
      const mimeType = format === 'json' ? 'application/json' : 'application/vnd.ms-excel';
      const fileName = `export.${format}`;

      if (Platform.OS === 'web') {
        const blob = new Blob([data], { type: `${mimeType};charset=utf-8;` });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `project_${id}_${fileName}`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 100);
        setExportModalVisible(false);
        showModal('Export Complete', `${format.toUpperCase()} file downloaded.`, 'success');
      } else {
        // Ensure exports directory exists and write file
        const dir = exportsDir(id!);
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
        const fileUri = exportFilePath(id!, format);
        await FileSystem.writeAsStringAsync(fileUri, data);
        setExportModalVisible(false);
        setExportedFileUri(fileUri);
      }
    } catch (error) {
      console.error(`[ProjectDetailScreen] Error exporting ${format}:`, error);
      setExportModalVisible(false);
      showModal('Error', error instanceof Error ? error.message : `Failed to export ${format.toUpperCase()}`, 'error');
    } finally {
      setExporting(false);
      setExportingFormat(null);
    }
  };

  const handleShareExportedFile = async () => {
    if (!exportedFileUri) return;
    const uri = exportedFileUri;
    setExportedFileUri(null);
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch (error) {
      console.error('[ProjectDetailScreen] Error sharing export:', error);
    }
  };

  const handleSaveConfig = async (updates: ProjectConfigUpdate) => {
    if (!project) return;
    if (!updates.name.trim()) {
      showModal('Validation Error', 'Project name is required.', 'error');
      return;
    }
    setConfigSaving(true);
    try {
      const promptChanged = updates.llmPrompt !== project.llmPrompt;
      const llmToggleChanged = updates.enableLlm !== project.enableLlm;
      const providerChanged = updates.llmProvider !== project.llmProvider;
      const modelChanged = updates.llmModel !== project.llmModel;

      await updateProject(project.id, {
        name: updates.name,
        description: updates.description,
        llmProvider: updates.llmProvider,
        llmModel: updates.llmModel,
        llmPrompt: updates.llmPrompt,
        enableLlm: updates.enableLlm,
        enableAnonymization: updates.enableAnonymization,
        sensitiveWords: updates.sensitiveWords,
      });

      if (promptChanged || llmToggleChanged || providerChanged || modelChanged) {
        const doneRecordings = recordings.filter((r) => r.status === 'done');
        for (const rec of doneRecordings) {
          await updateRecording(rec.id, { status: 'stale' });
        }
        await loadRecordings();
      }

      await loadProject();
      setConfigVisible(false);

      if ((promptChanged || llmToggleChanged || providerChanged || modelChanged) && recordings.some((r) => r.status === 'done' || r.status === 'stale')) {
        setReprocessVisible(true);
      } else {
        showModal('Saved', 'Project settings updated.', 'success');
      }
    } catch (error) {
      console.error('[ProjectDetailScreen] Error saving config:', error);
      showModal('Error', error instanceof Error ? error.message : 'Failed to save settings', 'error');
    } finally {
      setConfigSaving(false);
    }
  };

  const handleReprocessAll = async () => {
    setReprocessing(true);
    try {
      const staleRecordings = recordings.filter((r) => r.status === 'stale');
      for (const rec of staleRecordings) {
        try {
          await runProcessingPipeline(rec.id, id!, { skipTranscription: true });
        } catch (e) {
          console.error(`[ProjectDetailScreen] Reprocess error for ${rec.id}:`, e);
        }
      }
      await loadRecordings();
      setReprocessVisible(false);
      showModal('Done', `Reprocessed ${staleRecordings.length} recording(s).`, 'success');
    } catch (error) {
      showModal('Error', error instanceof Error ? error.message : 'Failed to reprocess', 'error');
    } finally {
      setReprocessing(false);
    }
  };

  const handleDeleteProject = async () => {
    setDeletingProject(true);
    try {
      for (const rec of recordings) {
        try {
          await deleteRecording(rec.id);
        } catch (e) {
          console.error(`[ProjectDetailScreen] Error deleting recording ${rec.id}:`, e);
        }
      }
      await deleteProject(id!);
      setDeleteProjectVisible(false);
      setConfigVisible(false);
      router.replace('/');
    } catch (error) {
      console.error('[ProjectDetailScreen] Error deleting project:', error);
      setDeletingProject(false);
      showModal('Error', error instanceof Error ? error.message : 'Failed to delete project', 'error');
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
    hideModal();
    setRecordingToDelete(null);
    try {
      if (toDelete.id) {
        await deleteRecording(toDelete.id);
      }
      setRecordings((prev) => {
        if (toDelete.id) {
          return prev.filter((r) => r.id !== toDelete.id);
        }
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
      showModal('Error', error instanceof Error ? error.message : 'Failed to delete recording', 'error');
    }
  };

  const renderRecording = ({ item }: { item: Recording }) => (
    <RecordingCard
      recording={item}
      isPlaying={playingRecordingId === item.id && !!playerStatus?.playing}
      onPress={handleRecordingPress}
      onDelete={handleDeleteRecording}
      onPlayPause={handlePlayPause}
    />
  );

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
          headerRight: () => (
            <Pressable onPress={() => setConfigVisible(true)} style={{ padding: 8 }}>
              <IconSymbol
                ios_icon_name="gearshape.fill"
                android_material_icon_name="settings"
                size={22}
                color={colors.primary}
              />
            </Pressable>
          ),
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
          onPress={() => setExportModalVisible(true)}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="square.and.arrow.up"
            android_material_icon_name="file-download"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
            Export
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
          hideModal();
          setRecordingToDelete(null);
        }}
        onConfirm={modal.type === 'confirm' ? confirmDeleteRecording : undefined}
        confirmText={modal.type === 'confirm' ? 'Delete' : 'OK'}
      />

      <Modal
        visible={reprocessVisible}
        title="Reprocess Recordings?"
        message="LLM settings have changed. Would you like to reprocess all affected recordings with the new settings?"
        type="confirm"
        onClose={() => setReprocessVisible(false)}
        onConfirm={handleReprocessAll}
        confirmText={reprocessing ? 'Reprocessing...' : 'Reprocess All'}
        cancelText="Skip"
      />

      <Modal
        visible={deleteProjectVisible}
        title="Delete Project"
        message={`Are you sure you want to delete "${project?.name}"? This will permanently remove the project and all ${recordings.length} recording(s). This action cannot be undone.`}
        type="confirm"
        onClose={() => { if (!deletingProject) setDeleteProjectVisible(false); }}
        onConfirm={handleDeleteProject}
        confirmText={deletingProject ? 'Deleting...' : 'Delete Forever'}
        cancelText="Cancel"
      />

      {project && (
        <ProjectConfigModal
          visible={configVisible}
          project={project}
          saving={configSaving}
          onClose={() => setConfigVisible(false)}
          onSave={handleSaveConfig}
          onDeleteProject={() => setDeleteProjectVisible(true)}
        />
      )}

      <ExportModal
        visible={exportModalVisible}
        exporting={exporting}
        exportingFormat={exportingFormat}
        onClose={() => { if (!exporting) setExportModalVisible(false); }}
        onExport={handleExport}
      />

      <Modal
        visible={!!exportedFileUri}
        title="Export Saved"
        message={`File saved inside the project's exports folder.\n\nTap "Share" to open or share it with another app.`}
        type="confirm"
        onClose={() => setExportedFileUri(null)}
        onConfirm={handleShareExportedFile}
        confirmText="Share"
        cancelText="Close"
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
});
