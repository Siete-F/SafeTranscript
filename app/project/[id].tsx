
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, commonStyles } from '@/styles/commonStyles';
import { Project, Recording } from '@/types';
import { authenticatedGet, authenticatedGetText } from '@/utils/api';
import { Modal } from '@/components/ui/Modal';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

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
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const loadProject = useCallback(async () => {
    try {
      console.log('[ProjectDetailScreen] Fetching project details from API');
      const data = await authenticatedGet<Project>(`/api/projects/${id}`);
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
      console.log('[ProjectDetailScreen] Fetching recordings from API');
      const data = await authenticatedGet<Recording[]>(`/api/projects/${id}/recordings`);
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
    loadRecordings();
  }, [id, loadProject, loadRecordings]);

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
    router.push(`/recording/${recording.id}`);
  };

  const handleExportCSV = async () => {
    console.log('[ProjectDetailScreen] User tapped Export CSV button');
    try {
      const csvData = await authenticatedGetText(`/api/projects/${id}/export-csv`);
      
      if (Platform.OS === 'web') {
        // Web platform: Create a blob and trigger download
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `project_${id}_export.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setModal({
          visible: true,
          title: 'Export Complete',
          message: 'CSV file has been downloaded',
          type: 'success',
        });
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

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const minsText = `${mins}m`;
    const secsText = `${secs}s`;
    return `${minsText} ${secsText}`;
  };

  const renderRecording = ({ item }: { item: Recording }) => {
    const statusColor = getStatusColor(item.status);
    const statusLabel = getStatusLabel(item.status);
    const durationText = item.audioDuration ? formatDuration(item.audioDuration) : 'N/A';
    const dateText = new Date(item.createdAt).toLocaleDateString();

    return (
      <TouchableOpacity
        style={styles.recordingCard}
        onPress={() => handleRecordingPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.recordingHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
          <Text style={styles.recordingDate}>{dateText}</Text>
        </View>

        <View style={styles.recordingMeta}>
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
      </TouchableOpacity>
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
        keyExtractor={(item) => item.id}
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
        onClose={() => setModal({ ...modal, visible: false })}
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
