import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import {
  getSelfHostedTranscriptionUrl,
  getSelfHostedTranscriptionToken,
  setSelfHostedTranscriptionUrl,
  setSelfHostedTranscriptionToken,
} from '@/db/operations/settings';
import type { ModalType } from '@/hooks/useModal';

interface SelfHostedTranscriptionSectionProps {
  showModal: (title: string, message: string, type: ModalType) => void;
}

const MAX_URL_DISPLAY_LENGTH = 40;

export function SelfHostedTranscriptionSection({ showModal }: SelfHostedTranscriptionSectionProps) {
  const router = useRouter();
  const [savedUrl, setSavedUrl] = useState<string>('');
  const [savedToken, setSavedToken] = useState<string>('');
  const [urlInput, setUrlInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const url = await getSelfHostedTranscriptionUrl();
      const token = await getSelfHostedTranscriptionToken();
      setSavedUrl(url ?? '');
      setSavedToken(token ?? '');
    } catch (error) {
      console.error('[SelfHostedTranscriptionSection] Error loading settings:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const newUrl = urlInput.trim();
      const newToken = tokenInput.trim();
      await setSelfHostedTranscriptionUrl(newUrl);
      await setSelfHostedTranscriptionToken(newToken);
      setSavedUrl(newUrl);
      setSavedToken(newToken);
      setUrlInput('');
      setTokenInput('');
      showModal('Saved', 'Self-hosted transcription settings saved.', 'success');
    } catch (error) {
      console.error('[SelfHostedTranscriptionSection] Error saving settings:', error);
      showModal('Error', error instanceof Error ? error.message : 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    const urlToTest = urlInput.trim() || savedUrl;
    if (!urlToTest) {
      showModal('No URL', 'Enter or save an endpoint URL first.', 'error');
      return;
    }
    setTesting(true);
    try {
      const base = urlToTest.replace(/\/+$/, '');
      const healthUrl = `${base}/health`;
      const tokenToUse = tokenInput.trim() || savedToken;
      const headers: Record<string, string> = {};
      if (tokenToUse) headers['Authorization'] = `Bearer ${tokenToUse}`;

      const response = await fetch(healthUrl, { method: 'GET', headers });
      if (response.ok) {
        showModal('Connected', `Successfully reached ${healthUrl}`, 'success');
      } else {
        showModal('Reachable', `Server responded with status ${response.status}. The endpoint is reachable but returned an error. Check that the service is running.`, 'info');
      }
    } catch (error) {
      showModal(
        'Connection Failed',
        `Could not reach the endpoint. Make sure the server is running and the device is on the same network.\n\nError: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    } finally {
      setTesting(false);
    }
  };

  const handleOpenHelp = () => {
    router.push('/self-hosted-help');
  };

  const urlDisplay = savedUrl
    ? (savedUrl.length > MAX_URL_DISPLAY_LENGTH ? `${savedUrl.substring(0, MAX_URL_DISPLAY_LENGTH)}…` : savedUrl)
    : 'Not configured';
  const tokenDisplay = savedToken ? '••••••••' : 'Not set';

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Self-Hosted Transcription</Text>
      <Text style={styles.sectionDescription}>
        Point the app at your own transcription server (e.g. vllm with Voxtral or faster-whisper-server) running on your home or company network. The server must expose an OpenAI-compatible <Text style={styles.code}>/v1/audio/transcriptions</Text> endpoint.
      </Text>

      <View style={styles.keyCard}>
        <View style={styles.keyHeader}>
          <IconSymbol ios_icon_name="server.rack" android_material_icon_name="dns" size={24} color={colors.secondary} />
          <Text style={styles.keyTitle}>Endpoint</Text>
        </View>
        <Text style={styles.keyStatus}>Current URL: {urlDisplay}</Text>
        <TextInput
          style={styles.input}
          placeholder="http://192.168.1.100:8000"
          placeholderTextColor={colors.textSecondary}
          value={urlInput}
          onChangeText={setUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <View style={styles.keyHeader2}>
          <IconSymbol ios_icon_name="key.fill" android_material_icon_name="vpn-key" size={24} color={colors.secondary} />
          <Text style={styles.keyTitle}>Bearer Token (optional)</Text>
        </View>
        <Text style={styles.keyStatus}>Current token: {tokenDisplay}</Text>
        <TextInput
          style={styles.input}
          placeholder="Leave empty if no authentication is required"
          placeholderTextColor={colors.textSecondary}
          value={tokenInput}
          onChangeText={setTokenInput}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.testButton, testing && styles.buttonDisabled]}
            onPress={handleTestConnection}
            disabled={testing}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="network" android_material_icon_name="wifi" size={16} color={colors.secondary} />
            <Text style={styles.testButtonText}>{testing ? 'Testing…' : 'Test'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.helpLink} onPress={handleOpenHelp} activeOpacity={0.7}>
        <IconSymbol ios_icon_name="questionmark.circle" android_material_icon_name="help" size={16} color={colors.primary} />
        <Text style={styles.helpLinkText}>How to host your own transcription server →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 8 },
  sectionDescription: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  code: { fontFamily: 'monospace', fontSize: 13, color: colors.text },
  keyCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  keyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  keyHeader2: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8, gap: 8 },
  keyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  keyStatus: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, fontSize: 14, color: colors.text, marginBottom: 4 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  testButton: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, borderWidth: 1.5, borderColor: colors.secondary, borderRadius: 8, paddingVertical: 11, justifyContent: 'center' },
  testButtonText: { color: colors.secondary, fontSize: 15, fontWeight: '600' },
  saveButton: { flex: 2, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
  helpLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  helpLinkText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
});
