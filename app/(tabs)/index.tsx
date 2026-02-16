
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, commonStyles } from '@/styles/commonStyles';
import { Project } from '@/types';
import { authenticatedGet } from '@/utils/api';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';

export default function ProjectsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  useEffect(() => {
    // Only load projects if user is authenticated
    if (!user) {
      console.log('[ProjectsScreen] No user, skipping project load');
      setLoading(false);
      return;
    }
    console.log('[ProjectsScreen] Loading projects');
    loadProjects();
  }, [user]);

  const loadProjects = async () => {
    try {
      console.log('[ProjectsScreen] Fetching projects from API');
      const data = await authenticatedGet<Project[]>('/api/projects');
      setProjects(data);
      console.log('[ProjectsScreen] Loaded projects:', data.length);
    } catch (error) {
      console.error('[ProjectsScreen] Error loading projects:', error);
      setErrorModal({
        visible: true,
        message: error instanceof Error ? error.message : 'Failed to load projects',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    console.log('ProjectsScreen: User triggered refresh');
    setRefreshing(true);
    loadProjects();
  };

  const handleCreateProject = () => {
    console.log('ProjectsScreen: User tapped Create Project button');
    router.push('/project/create');
  };

  const handleProjectPress = (project: Project) => {
    console.log('ProjectsScreen: User tapped project:', project.name);
    router.push(`/project/${project.id}`);
  };

  const renderProject = ({ item }: { item: Project }) => {
    const providerName = item.llmProvider.toUpperCase();
    const recordingCountText = `${item.recordingCount || 0} recordings`;
    const anonymizationText = item.enableAnonymization ? 'PII Protected' : 'No PII Protection';

    return (
      <TouchableOpacity
        style={styles.projectCard}
        onPress={() => handleProjectPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.projectHeader}>
          <View style={styles.projectIcon}>
            <IconSymbol
              ios_icon_name="folder.fill"
              android_material_icon_name="folder"
              size={24}
              color={colors.primary}
            />
          </View>
          <View style={styles.projectInfo}>
            <Text style={styles.projectName}>{item.name}</Text>
            {item.description && (
              <Text style={styles.projectDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}
          </View>
        </View>
        
        <View style={styles.projectMeta}>
          <View style={styles.metaItem}>
            <IconSymbol
              ios_icon_name="mic.fill"
              android_material_icon_name="mic"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={styles.metaText}>{recordingCountText}</Text>
          </View>
          <View style={styles.metaItem}>
            <IconSymbol
              ios_icon_name="brain"
              android_material_icon_name="psychology"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={styles.metaText}>{providerName}</Text>
          </View>
          {item.enableAnonymization && (
            <View style={styles.metaItem}>
              <IconSymbol
                ios_icon_name="lock.fill"
                android_material_icon_name="lock"
                size={16}
                color={colors.accent}
              />
              <Text style={[styles.metaText, { color: colors.accent }]}>
                {anonymizationText}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const emptyComponent = () => (
    <View style={styles.emptyContainer}>
      <IconSymbol
        ios_icon_name="folder.badge.plus"
        android_material_icon_name="create-new-folder"
        size={64}
        color={colors.textSecondary}
      />
      <Text style={styles.emptyTitle}>No Projects Yet</Text>
      <Text style={styles.emptyText}>
        Create your first project to start recording and transcribing audio
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Projects</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={handleCreateProject}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="plus"
            android_material_icon_name="add"
            size={24}
            color={colors.card}
          />
        </TouchableOpacity>
      </View>

      <FlatList
        data={projects}
        renderItem={renderProject}
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
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        type="error"
        onClose={() => setErrorModal({ visible: false, message: '' })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  createButton: {
    backgroundColor: colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  projectCard: {
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
  projectHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  projectIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  projectDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  projectMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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
