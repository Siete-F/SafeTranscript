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
import { ApiKeys } from '@/types';
import { getMaskedApiKeys, saveApiKeys } from '@/db/operations/apikeys';
import type { ModalType } from '@/hooks/useModal';

interface ApiKeysSectionProps {
  showModal: (title: string, message: string, type: ModalType) => void;
}

export function ApiKeysSection({ showModal }: ApiKeysSectionProps) {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [loading, setLoading] = useState(false);
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [mistralKey, setMistralKey] = useState('');

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      const data = await getMaskedApiKeys();
      setApiKeys(data);
    } catch (error) {
      console.error('[ApiKeysSection] Error loading API keys:', error);
      showModal('Error', error instanceof Error ? error.message : 'Failed to load API keys', 'error');
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
      showModal('Success', 'API keys saved successfully', 'success');
      setOpenaiKey('');
      setGeminiKey('');
      setMistralKey('');
      loadApiKeys();
    } catch (error) {
      console.error('[ApiKeysSection] Error saving API keys:', error);
      showModal('Error', error instanceof Error ? error.message : 'Failed to save API keys', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openaiKeyDisplay = apiKeys.openaiKey || 'Not set';
  const geminiKeyDisplay = apiKeys.geminiKey || 'Not set';
  const mistralKeyDisplay = apiKeys.mistralKey || 'Not set';

  return (
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
  keyNote: { fontSize: 12, color: colors.textSecondary, marginBottom: 12, fontStyle: 'italic' },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, fontSize: 14, color: colors.text },
  saveButton: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
