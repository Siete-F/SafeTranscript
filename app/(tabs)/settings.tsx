
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
import { authenticatedGet, authenticatedPut } from '@/utils/api';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsScreen() {
  const { signOut } = useAuth();
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

  useEffect(() => {
    console.log('[SettingsScreen] Loading API keys');
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      console.log('[SettingsScreen] Fetching API keys from backend');
      const data = await authenticatedGet<ApiKeys>('/api/api-keys');
      setApiKeys(data);
      console.log('[SettingsScreen] Loaded API keys');
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
    console.log('[SettingsScreen] User tapped Save API Keys button');
    setLoading(true);
    try {
      const keysToUpdate: ApiKeys = {};
      if (openaiKey) {
        keysToUpdate.openaiKey = openaiKey;
      }
      if (geminiKey) {
        keysToUpdate.geminiKey = geminiKey;
      }
      if (mistralKey) {
        keysToUpdate.mistralKey = mistralKey;
      }

      console.log('[SettingsScreen] Saving API keys to backend');
      await authenticatedPut('/api/api-keys', keysToUpdate);
      
      setModal({
        visible: true,
        title: 'Success',
        message: 'API keys saved successfully',
        type: 'success',
      });
      setOpenaiKey('');
      setGeminiKey('');
      setMistralKey('');
      loadApiKeys();
    } catch (error) {
      console.error('[SettingsScreen] Error saving API keys:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to save API keys',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('[SettingsScreen] Error signing out:', error);
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
            Configure your API keys for transcription and LLM processing. Keys are encrypted and stored securely.
          </Text>

          <View style={styles.keyCard}>
            <View style={styles.keyHeader}>
              <IconSymbol
                ios_icon_name="brain"
                android_material_icon_name="psychology"
                size={24}
                color={colors.primary}
              />
              <Text style={styles.keyTitle}>OpenAI</Text>
            </View>
            <Text style={styles.keyStatus}>
              Current: {openaiKeyDisplay}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter new OpenAI API key"
              placeholderTextColor={colors.textSecondary}
              value={openaiKey}
              onChangeText={setOpenaiKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.keyCard}>
            <View style={styles.keyHeader}>
              <IconSymbol
                ios_icon_name="sparkles"
                android_material_icon_name="auto-awesome"
                size={24}
                color={colors.secondary}
              />
              <Text style={styles.keyTitle}>Google Gemini</Text>
            </View>
            <Text style={styles.keyStatus}>
              Current: {geminiKeyDisplay}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter new Gemini API key"
              placeholderTextColor={colors.textSecondary}
              value={geminiKey}
              onChangeText={setGeminiKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.keyCard}>
            <View style={styles.keyHeader}>
              <IconSymbol
                ios_icon_name="bolt.fill"
                android_material_icon_name="flash-on"
                size={24}
                color={colors.accent}
              />
              <Text style={styles.keyTitle}>Mistral AI</Text>
            </View>
            <Text style={styles.keyStatus}>
              Current: {mistralKeyDisplay}
            </Text>
            <Text style={styles.keyNote}>
              Used for Voxtral Transcribe 2 audio transcription and LLM processing
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter new Mistral API key"
              placeholderTextColor={colors.textSecondary}
              value={mistralKey}
              onChangeText={setMistralKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSaveKeys}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.saveButtonText}>
              {loading ? 'Saving...' : 'Save API Keys'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <IconSymbol
              ios_icon_name="arrow.right.square"
              android_material_icon_name="logout"
              size={20}
              color={colors.error}
            />
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Secure Scribe - Audio Transcription & PII Anonymization
            </Text>
            <Text style={styles.infoText}>Version 1.0.0</Text>
          </View>
        </View>
      </ScrollView>

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
  header: {
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  keyCard: {
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
  keyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  keyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  keyStatus: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  keyNote: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 14,
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
  },
});
