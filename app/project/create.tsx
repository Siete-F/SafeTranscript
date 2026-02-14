
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Switch,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, commonStyles } from '@/styles/commonStyles';
import { LLM_PROVIDERS, CustomField } from '@/types';
import { authenticatedPost } from '@/utils/api';
import { Modal } from '@/components/ui/Modal';

export default function CreateProjectScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [llmProvider, setLlmProvider] = useState<'openai' | 'gemini' | 'mistral'>('gemini');
  const [llmModel, setLlmModel] = useState('gemini-1.5-flash');
  const [llmPrompt, setLlmPrompt] = useState('Summarize the key points and action items from this recording.');
  const [enableAnonymization, setEnableAnonymization] = useState(true);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [sensitiveWordsText, setSensitiveWordsText] = useState('');
  const [loading, setLoading] = useState(false);
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

  const handleSave = async () => {
    if (!name.trim()) {
      setModal({
        visible: true,
        title: 'Validation Error',
        message: 'Please enter a project name',
        type: 'error',
      });
      return;
    }

    if (!llmPrompt.trim()) {
      setModal({
        visible: true,
        title: 'Validation Error',
        message: 'Please enter an LLM prompt',
        type: 'error',
      });
      return;
    }

    setLoading(true);
    try {
      console.log('[CreateProjectScreen] Creating project');
      const parsedSensitiveWords = sensitiveWordsText
        .split(',')
        .map((w) => w.trim())
        .filter((w) => w.length > 0);
      const projectData = {
        name,
        description: description || undefined,
        llmProvider,
        llmModel,
        llmPrompt,
        enableAnonymization,
        customFields: (customFields && customFields.length > 0) ? customFields : undefined,
        sensitiveWords: parsedSensitiveWords.length > 0 ? parsedSensitiveWords : undefined,
      };
      
      await authenticatedPost('/api/projects', projectData);

      setModal({
        visible: true,
        title: 'Success',
        message: 'Project created successfully',
        type: 'success',
      });
      
      // Navigate back after a short delay
      setTimeout(() => {
        router.back();
      }, 1000);
    } catch (error) {
      console.error('[CreateProjectScreen] Error creating project:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to create project',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomField = () => {
    const newField: CustomField = {
      name: `Field ${customFields.length + 1}`,
      type: 'text',
    };
    setCustomFields([...customFields, newField]);
  };

  const handleRemoveCustomField = (index: number) => {
    const updated = customFields.filter((_, i) => i !== index);
    setCustomFields(updated);
  };

  const handleProviderChange = (provider: 'openai' | 'gemini' | 'mistral') => {
    setLlmProvider(provider);
    const firstModel = LLM_PROVIDERS[provider].models[0].id;
    setLlmModel(firstModel);
  };

  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Create Project',
          headerBackTitle: 'Cancel',
        }}
      />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Project Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Meeting Notes"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="What is this project for?"
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LLM Configuration</Text>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Provider</Text>
            <View style={styles.providerButtons}>
              {Object.entries(LLM_PROVIDERS).map(([key, provider]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.providerButton,
                    llmProvider === key && styles.providerButtonActive,
                  ]}
                  onPress={() => handleProviderChange(key as any)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.providerButtonText,
                      llmProvider === key && styles.providerButtonTextActive,
                    ]}
                  >
                    {provider.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Model</Text>
            <View style={styles.modelButtons}>
              {LLM_PROVIDERS[llmProvider].models.map((model) => (
                <TouchableOpacity
                  key={model.id}
                  style={[
                    styles.modelButton,
                    llmModel === model.id && styles.modelButtonActive,
                  ]}
                  onPress={() => setLlmModel(model.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.modelButtonText,
                      llmModel === model.id && styles.modelButtonTextActive,
                    ]}
                  >
                    {model.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Processing Prompt *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Instructions for the LLM..."
              placeholderTextColor={colors.textSecondary}
              value={llmPrompt}
              onChangeText={setLlmPrompt}
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Security</Text>

          <View style={styles.switchContainer}>
            <View style={styles.switchLabel}>
              <IconSymbol
                ios_icon_name="lock.fill"
                android_material_icon_name="lock"
                size={20}
                color={enableAnonymization ? colors.accent : colors.textSecondary}
              />
              <View style={styles.switchTextContainer}>
                <Text style={styles.switchTitle}>Enable PII Anonymization</Text>
                <Text style={styles.switchDescription}>
                  Automatically detect and mask personal information
                </Text>
              </View>
            </View>
            <Switch
              value={enableAnonymization}
              onValueChange={setEnableAnonymization}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.card}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transcription Keywords</Text>

          <Text style={styles.sectionDescription}>
            Add important words or phrases (e.g., proper nouns, technical terms, company names) that the transcription model should pay special attention to for improved accuracy. Separate keywords with commas.
          </Text>

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="e.g., Acme Corp, TensorFlow, Dr. Smith"
            placeholderTextColor={colors.textSecondary}
            value={sensitiveWordsText}
            onChangeText={setSensitiveWordsText}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Custom Fields</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddCustomField}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="plus"
                android_material_icon_name="add"
                size={20}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          {customFields.length === 0 && (
            <Text style={styles.emptyText}>
              No custom fields. Add fields to collect additional data per recording.
            </Text>
          )}

          {customFields.map((field, index) => (
            <View key={index} style={styles.customFieldRow}>
              <TextInput
                style={[styles.input, styles.customFieldInput]}
                placeholder="Field name"
                placeholderTextColor={colors.textSecondary}
                value={field.name}
                onChangeText={(text) => {
                  const updated = [...customFields];
                  updated[index].name = text;
                  setCustomFields(updated);
                }}
              />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveCustomField(index)}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="trash"
                  android_material_icon_name="delete"
                  size={20}
                  color={colors.error}
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>
            {loading ? 'Creating...' : 'Create Project'}
          </Text>
        </TouchableOpacity>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  providerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  providerButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  providerButtonActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}15`,
  },
  providerButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  providerButtonTextActive: {
    color: colors.primary,
  },
  modelButtons: {
    gap: 8,
  },
  modelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  modelButtonActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}15`,
  },
  modelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  modelButtonTextActive: {
    color: colors.primary,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  switchLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  switchTextContainer: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  switchDescription: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  customFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  customFieldInput: {
    flex: 1,
  },
  removeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 16,
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
});
