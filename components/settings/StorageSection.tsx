import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { Modal } from '@/components/ui/Modal';
import { getStorageRoot, getDefaultStorageRoot } from '@/services/fileStorage';
import {
  validatePath,
  detectExistingData,
  changeStorageRoot,
  normalisePath,
} from '@/services/storageMigration';
import type { ModalType } from '@/hooks/useModal';

interface StorageSectionProps {
  showModal: (title: string, message: string, type: ModalType) => void;
}

export function StorageSection({ showModal }: StorageSectionProps) {
  const [currentStorageRoot, setCurrentStorageRoot] = useState<string>('');
  const [newStoragePath, setNewStoragePath] = useState<string>('');
  const [storageChanging, setStorageChanging] = useState(false);
  const [migrationModal, setMigrationModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    choice: 'copy' | 'clean' | 'adopt' | null;
    newPath: string;
  }>({
    visible: false,
    title: '',
    message: '',
    choice: null,
    newPath: '',
  });

  useEffect(() => {
    setCurrentStorageRoot(getStorageRoot());
    setNewStoragePath(getStorageRoot());
  }, []);

  const handleChangeStorageRoot = async () => {
    const normalised = normalisePath(newStoragePath);
    if (!normalised) {
      showModal('Error', 'Please enter a valid path.', 'error');
      return;
    }
    if (normalised === currentStorageRoot) {
      showModal('Info', 'This is already the current storage location.', 'info');
      return;
    }

    setStorageChanging(true);
    try {
      const validation = await validatePath(normalised);
      if (!validation.valid) {
        showModal('Error', validation.error ?? 'Path is not valid.', 'error');
        return;
      }

      const detection = await detectExistingData(normalised);

      if (detection.hasExistingData) {
        setMigrationModal({
          visible: true,
          title: 'Existing Data Found',
          message: `Found ${detection.projectCount} project(s) at the new location (${detection.projectNames.join(', ')}). This will be used as your data going forward.`,
          choice: 'adopt',
          newPath: normalised,
        });
      } else {
        setMigrationModal({
          visible: true,
          title: 'Change Storage Location',
          message: 'The new location is empty. Do you want to copy all existing data there, or start with a clean slate?',
          choice: null,
          newPath: normalised,
        });
      }
    } catch (e: any) {
      showModal('Error', e.message ?? 'Failed to change storage location.', 'error');
    } finally {
      setStorageChanging(false);
    }
  };

  const handleMigrationConfirm = async (choice: 'copy' | 'clean' | 'adopt') => {
    setMigrationModal((prev) => ({ ...prev, visible: false }));
    setStorageChanging(true);
    try {
      const msg = await changeStorageRoot(migrationModal.newPath, choice);
      const newRoot = getStorageRoot();
      setCurrentStorageRoot(newRoot);
      setNewStoragePath(newRoot);
      showModal('Success', msg, 'success');
    } catch (e: any) {
      showModal('Error', e.message ?? 'Migration failed.', 'error');
    } finally {
      setStorageChanging(false);
    }
  };

  const handleResetStorageRoot = () => {
    const defaultRoot = getDefaultStorageRoot();
    if (defaultRoot === currentStorageRoot) {
      showModal('Info', 'Already using the default storage location.', 'info');
      return;
    }
    setNewStoragePath(defaultRoot);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Storage Location</Text>
      <Text style={styles.sectionDescription}>
        Choose where your projects, recordings, and transcriptions are stored on this device.
        Changing the location will not delete data from the previous location.
      </Text>

      <View style={styles.keyCard}>
        <View style={styles.keyHeader}>
          <IconSymbol ios_icon_name="folder.fill" android_material_icon_name="folder" size={24} color={colors.primary} />
          <Text style={styles.keyTitle}>Data Folder</Text>
        </View>
        <Text style={styles.keyStatus}>Current: {currentStorageRoot}</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter new storage path"
          placeholderTextColor={colors.textSecondary}
          value={newStoragePath}
          onChangeText={setNewStoragePath}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.saveButton, styles.flexButton, storageChanging && styles.saveButtonDisabled]}
            onPress={handleChangeStorageRoot}
            disabled={storageChanging}
            activeOpacity={0.7}
          >
            <Text style={styles.saveButtonText}>
              {storageChanging ? 'Changing...' : 'Change Location'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleResetStorageRoot}
            activeOpacity={0.7}
          >
            <Text style={styles.resetButtonText}>Reset to Default</Text>
          </TouchableOpacity>
        </View>
      </View>

      {migrationModal.choice === 'adopt' ? (
        <Modal
          visible={migrationModal.visible}
          title={migrationModal.title}
          message={migrationModal.message}
          type="confirm"
          confirmText="Use This Data"
          onClose={() => setMigrationModal((prev) => ({ ...prev, visible: false }))}
          onConfirm={() => handleMigrationConfirm('adopt')}
        />
      ) : (
        <Modal
          visible={migrationModal.visible}
          title={migrationModal.title}
          message={migrationModal.message}
          type="confirm"
          confirmText="Copy Data"
          cancelText="Start Clean"
          onClose={() => handleMigrationConfirm('clean')}
          onConfirm={() => handleMigrationConfirm('copy')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 8 },
  sectionDescription: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  keyCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  keyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  keyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  keyStatus: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, fontSize: 14, color: colors.text },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  saveButton: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  flexButton: { flex: 1 },
  resetButton: { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  resetButtonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
