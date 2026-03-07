
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, commonStyles } from '@/styles/commonStyles';
import { Modal } from '@/components/ui/Modal';
import { ApiKeysSection } from '@/components/settings/ApiKeysSection';
import { WhisperModelSection } from '@/components/settings/WhisperModelSection';
import { PiiModelSection } from '@/components/settings/PiiModelSection';
import { StorageSection } from '@/components/settings/StorageSection';
import { useModal } from '@/hooks/useModal';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export default function SettingsScreen() {
  const { modal, showModal, hideModal } = useModal();

  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <ApiKeysSection showModal={showModal} />
        <WhisperModelSection showModal={showModal} />
        <PiiModelSection showModal={showModal} />
        {isNative && <StorageSection showModal={showModal} />}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>Safe Transcript - Audio Transcription & PII Anonymization</Text>
            <Text style={styles.infoText}>Version 1.0.1 (Local)</Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={modal.visible} title={modal.title} message={modal.message} type={modal.type} onClose={hideModal} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingVertical: 16, paddingTop: Platform.OS === 'android' ? 48 : 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 28, fontWeight: '700', color: colors.text },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 8 },
  infoCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  infoText: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
});
