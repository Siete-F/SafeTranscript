
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, commonStyles } from '@/styles/commonStyles';
import { ApiKeys } from '@/types';
import { getMaskedApiKeys, saveApiKeys } from '@/db/operations/apikeys';
import { Modal } from '@/components/ui/Modal';
import {
  isLocalModelSupported,
  checkModelExists,
  downloadModel,
  deleteModel,
} from '@/services/LocalModelManager';
import {
  checkGLiNERModelExists,
  downloadGLiNERModel,
  deleteGLiNERModel,
} from '@/services/gliner/GLiNERModelManager';
import { disposeGLiNER } from '@/services/gliner/GLiNERInference';

const localModelAvailable = isLocalModelSupported();

export default function SettingsScreen() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [loading, setLoading] = useState(false);
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [mistralKey, setMistralKey] = useState('');
  const [modal, setModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'success',
  });

  const [modelDownloaded, setModelDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  const [piiModelDownloaded, setPiiModelDownloaded] = useState(false);
  const [piiDownloadProgress, setPiiDownloadProgress] = useState(0);
  const [isPiiDownloading, setIsPiiDownloading] = useState(false);

  useEffect(() => {
    loadApiKeys();
    if (localModelAvailable) {
      checkModelExists().then(setModelDownloaded).catch(() => setModelDownloaded(false));
    }
    checkGLiNERModelExists().then(setPiiModelDownloaded).catch(() => setPiiModelDownloaded(false));
  }, []);

  const loadApiKeys = async () => {
    try {
      const data = await getMaskedApiKeys();
      setApiKeys(data);
    } catch (error) {
      console.error('[SettingsScreen] Error loading API keys:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to load API keys',
        type: 'error',
      });
    }
  };

  const handleSaveKeys = async () => {
    setLoading(true);
    try {
      const keysToUpdate: ApiKeys = {};
      if (openaiKey) keysToUpdate.openaiKey = openaiKey;
      if (geminiKey) keysToUpdate.geminiKey = geminiKey;
      if (mistralKey) keysToUpdate.mistralKey = mistralKey;

      await saveApiKeys(keysToUpdate);
      setModal({ visible: true, title: 'Success', message: 'API keys saved successfully', type: 'success' });
      setOpenaiKey('');
      setGeminiKey('');
      setMistralKey('');
      loadApiKeys();
    } catch (error) {
      console.error('[SettingsScreen] Error saving API keys:', error);
      setModal({ visible: true, title: 'Error', message: error instanceof Error ? error.message : 'Failed to save API keys', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadModel = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      await downloadModel((p) => setDownloadProgress(p));
      setModelDownloaded(true);
      setModal({ visible: true, title: 'Success', message: 'Offline model downloaded successfully.', type: 'success' });
    } catch (error) {
      setModal({ visible: true, title: 'Error', message: error instanceof Error ? error.message : 'Failed to download model', type: 'error' });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteModel = async () => {
    try {
      await deleteModel();
      setModelDownloaded(false);
      setModal({ visible: true, title: 'Success', message: 'Offline model removed.', type: 'success' });
    } catch (error) {
      setModal({ visible: true, title: 'Error', message: error instanceof Error ? error.message : 'Failed to delete model', type: 'error' });
    }
  };

  const handleDownloadPiiModel = async () => {
    setIsPiiDownloading(true);
    setPiiDownloadProgress(0);
    try {
      await downloadGLiNERModel((p) => setPiiDownloadProgress(p));
      setPiiModelDownloaded(true);
      setModal({ visible: true, title: 'Success', message: 'PII detection model downloaded successfully.', type: 'success' });
    } catch (error) {
      setModal({ visible: true, title: 'Error', message: error instanceof Error ? error.message : 'Failed to download PII model', type: 'error' });
    } finally {
      setIsPiiDownloading(false);
    }
  };

  const handleDeletePiiModel = async () => {
    try {
      await disposeGLiNER();
      await deleteGLiNERModel();
      setPiiModelDownloaded(false);
      setModal({ visible: true, title: 'Success', message: 'PII detection model removed. Regex fallback will be used.', type: 'success' });
    } catch (error) {
      setModal({ visible: true, title: 'Error', message: error instanceof Error ? error.message : 'Failed to delete PII model', type: 'error' });
    }
  };

  const openaiKeyDisplay = apiKeys.openaiKey || 'Not set';
  const geminiKeyDisplay = apiKeys.geminiKey || 'Not set';
  const mistralKeyDisplay = apiKeys.mistralKey || 'Not set';

  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API Keys</Text>
          <Text style={styles.sectionDescription}>
            Configure your API keys for transcription and LLM processing. Keys are stored locally on this device.
          </Text>

          <View style={styles.keyCard}>
            <View style={styles.keyHeader}>
              <IconSymbol ios_icon_name="brain" android_material_icon_name="psychology" size={24} color={colors.primary} />
              <Text style={styles.keyTitle}>OpenAI</Text>
            </View>
            <Text style={styles.keyStatus}>Current: {openaiKeyDisplay}</Text>
            <TextInput style={styles.input} placeholder="Enter new OpenAI API key" placeholderTextColor={colors.textSecondary} value={openaiKey} onChangeText={setOpenaiKey} secureTextEntry autoCapitalize="none" autoCorrect={false} />
          </View>

          <View style={styles.keyCard}>
            <View style={styles.keyHeader}>
              <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={24} color={colors.secondary} />
              <Text style={styles.keyTitle}>Google Gemini</Text>
            </View>
            <Text style={styles.keyStatus}>Current: {geminiKeyDisplay}</Text>
            <TextInput style={styles.input} placeholder="Enter new Gemini API key" placeholderTextColor={colors.textSecondary} value={geminiKey} onChangeText={setGeminiKey} secureTextEntry autoCapitalize="none" autoCorrect={false} />
          </View>

          <View style={styles.keyCard}>
            <View style={styles.keyHeader}>
              <IconSymbol ios_icon_name="bolt.fill" android_material_icon_name="flash-on" size={24} color={colors.accent} />
              <Text style={styles.keyTitle}>Mistral AI</Text>
            </View>
            <Text style={styles.keyStatus}>Current: {mistralKeyDisplay}</Text>
            <Text style={styles.keyNote}>Used for Voxtral Transcribe 2 audio transcription and LLM processing</Text>
            <TextInput style={styles.input} placeholder="Enter new Mistral API key" placeholderTextColor={colors.textSecondary} value={mistralKey} onChangeText={setMistralKey} secureTextEntry autoCapitalize="none" autoCorrect={false} />
          </View>

          <TouchableOpacity style={[styles.saveButton, loading && styles.saveButtonDisabled]} onPress={handleSaveKeys} disabled={loading} activeOpacity={0.7}>
            <Text style={styles.saveButtonText}>{loading ? 'Saving...' : 'Save API Keys'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, !localModelAvailable && styles.sectionDisabled]}>
          <Text style={styles.sectionTitle}>Offline Transcription</Text>
          <Text style={styles.sectionDescription}>
            {localModelAvailable
              ? 'Download the Voxtral Mini 4B model (~2.5 GB) for on-device transcription.'
              : 'Local transcription is only available on iOS and Android devices.'}
          </Text>
          <View style={styles.keyCard}>
            <View style={styles.keyHeader}>
              <IconSymbol ios_icon_name="arrow.down.circle" android_material_icon_name="download" size={24} color={localModelAvailable ? colors.primary : colors.textSecondary} />
              <Text style={[styles.keyTitle, !localModelAvailable && styles.textDisabled]}>Voxtral Mini 4B</Text>
            </View>
            <Text style={styles.keyStatus}>Status: {modelDownloaded ? 'Downloaded ✓' : 'Not downloaded'}</Text>
            {isDownloading && (
              <View style={styles.progressBarContainer}>
                {(() => { const pct = Math.round(downloadProgress * 100); return (<><View style={[styles.progressBar, { width: `${pct}%` }]} /><Text style={styles.progressText}>{pct}%</Text></>); })()}
              </View>
            )}
            {localModelAvailable && !modelDownloaded && !isDownloading && (
              <TouchableOpacity style={styles.saveButton} onPress={handleDownloadModel} activeOpacity={0.7}>
                <Text style={styles.saveButtonText}>Download Offline Model</Text>
              </TouchableOpacity>
            )}
            {localModelAvailable && modelDownloaded && (
              <TouchableOpacity style={styles.deleteModelButton} onPress={handleDeleteModel} activeOpacity={0.7}>
                <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={colors.error} />
                <Text style={styles.deleteModelButtonText}>Remove Model</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PII Detection Model</Text>
          <Text style={styles.sectionDescription}>
            Download the GLiNER PII model (~50 MB) for improved entity recognition. When not downloaded, regex-based detection is used.
          </Text>
          <View style={styles.keyCard}>
            <View style={styles.keyHeader}>
              <IconSymbol ios_icon_name="shield.checkered" android_material_icon_name="security" size={24} color={colors.secondary} />
              <Text style={styles.keyTitle}>GLiNER PII Edge</Text>
            </View>
            <Text style={styles.keyStatus}>Status: {piiModelDownloaded ? 'Downloaded ✓' : 'Not downloaded (using regex fallback)'}</Text>
            <Text style={styles.keyNote}>Detects 16+ PII types including names, emails, phone numbers, SSNs, addresses, and more</Text>
            {isPiiDownloading && (
              <View style={styles.progressBarContainer}>
                {(() => { const pct = Math.round(piiDownloadProgress * 100); return (<><View style={[styles.progressBar, { width: `${pct}%` }]} /><Text style={styles.progressText}>{pct}%</Text></>); })()}
              </View>
            )}
            {!piiModelDownloaded && !isPiiDownloading && (
              <TouchableOpacity style={styles.saveButton} onPress={handleDownloadPiiModel} activeOpacity={0.7}>
                <Text style={styles.saveButtonText}>Download PII Model</Text>
              </TouchableOpacity>
            )}
            {piiModelDownloaded && (
              <TouchableOpacity style={styles.deleteModelButton} onPress={handleDeletePiiModel} activeOpacity={0.7}>
                <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={colors.error} />
                <Text style={styles.deleteModelButtonText}>Remove Model</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>Safe Transcript - Audio Transcription & PII Anonymization</Text>
            <Text style={styles.infoText}>Version 1.0.1 (Local)</Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={modal.visible} title={modal.title} message={modal.message} type={modal.type} onClose={() => setModal({ ...modal, visible: false })} />
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
  sectionDescription: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  keyCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  keyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  keyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  keyStatus: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
  keyNote: { fontSize: 12, color: colors.textSecondary, marginBottom: 12, fontStyle: 'italic' },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, fontSize: 14, color: colors.text },
  saveButton: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  infoCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  infoText: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
  deleteModelButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, padding: 16, gap: 12 },
  deleteModelButtonText: { fontSize: 16, fontWeight: '600', color: colors.error },
  sectionDisabled: { opacity: 0.5 },
  textDisabled: { color: colors.textSecondary },
  progressBarContainer: { height: 24, backgroundColor: colors.border, borderRadius: 12, marginBottom: 12, overflow: 'hidden', justifyContent: 'center' },
  progressBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.primary, borderRadius: 12 },
  progressText: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'center' },
});
