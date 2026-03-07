import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { Project, LLM_PROVIDERS } from '@/types';

export interface ProjectConfigUpdate {
  name: string;
  description?: string;
  llmProvider: 'openai' | 'gemini' | 'mistral';
  llmModel: string;
  llmPrompt: string;
  enableLlm: boolean;
  enableAnonymization: boolean;
  sensitiveWords: string[];
}

interface ProjectConfigModalProps {
  visible: boolean;
  project: Project;
  saving: boolean;
  onClose: () => void;
  onSave: (updates: ProjectConfigUpdate) => void;
  onDeleteProject: () => void;
}

export function ProjectConfigModal({
  visible,
  project,
  saving,
  onClose,
  onSave,
  onDeleteProject,
}: ProjectConfigModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [llmProvider, setLlmProvider] = useState<'openai' | 'gemini' | 'mistral'>('gemini');
  const [llmModel, setLlmModel] = useState('');
  const [llmPrompt, setLlmPrompt] = useState('');
  const [enableLlm, setEnableLlm] = useState(true);
  const [enableAnon, setEnableAnon] = useState(true);
  const [sensitiveWords, setSensitiveWords] = useState('');

  useEffect(() => {
    if (visible && project) {
      setName(project.name);
      setDescription(project.description || '');
      setLlmProvider(project.llmProvider);
      setLlmModel(project.llmModel);
      setLlmPrompt(project.llmPrompt);
      setEnableLlm(project.enableLlm);
      setEnableAnon(project.enableAnonymization);
      setSensitiveWords((project.sensitiveWords || []).join(', '));
    }
  }, [visible, project]);

  const handleSave = () => {
    const parsedWords = sensitiveWords
      .split(',')
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    onSave({
      name,
      description: description || undefined,
      llmProvider,
      llmModel,
      llmPrompt,
      enableLlm,
      enableAnonymization: enableAnon,
      sensitiveWords: parsedWords,
    });
  };

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Project Settings</Text>
            <TouchableOpacity
              onPress={handleSave}
              style={styles.headerButton}
              disabled={saving}
            >
              <Text style={[styles.saveText, saving && { opacity: 0.5 }]}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.label}>Project Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter project name"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
            />

            <View style={styles.switchRow}>
              <Text style={styles.label}>Enable LLM Processing</Text>
              <Switch
                value={enableLlm}
                onValueChange={setEnableLlm}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            <Text style={styles.hint}>
              When disabled, recordings are transcribed only — no anonymization or LLM analysis.
            </Text>

            {enableLlm && (
              <>
                <Text style={styles.label}>LLM Provider</Text>
                <View style={styles.chipRow}>
                  {(Object.keys(LLM_PROVIDERS) as Array<keyof typeof LLM_PROVIDERS>).map((key) => (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.chip,
                        llmProvider === key && styles.chipActive,
                      ]}
                      onPress={() => {
                        setLlmProvider(key as 'openai' | 'gemini' | 'mistral');
                        setLlmModel(LLM_PROVIDERS[key].models[0].id);
                      }}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          llmProvider === key && styles.chipTextActive,
                        ]}
                      >
                        {LLM_PROVIDERS[key].name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Model</Text>
                <View style={styles.chipRow}>
                  {LLM_PROVIDERS[llmProvider].models.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.chip,
                        llmModel === m.id && styles.chipActive,
                      ]}
                      onPress={() => setLlmModel(m.id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          llmModel === m.id && styles.chipTextActive,
                        ]}
                      >
                        {m.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>LLM Prompt</Text>
                <TextInput
                  style={[styles.input, styles.multiline, { minHeight: 100 }]}
                  value={llmPrompt}
                  onChangeText={setLlmPrompt}
                  placeholder="Enter prompt for LLM processing"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={5}
                />

                <View style={styles.switchRow}>
                  <Text style={styles.label}>Enable Anonymization</Text>
                  <Switch
                    value={enableAnon}
                    onValueChange={setEnableAnon}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>

                <Text style={styles.label}>Sensitive Words</Text>
                <TextInput
                  style={styles.input}
                  value={sensitiveWords}
                  onChangeText={setSensitiveWords}
                  placeholder="Comma-separated words to anonymize"
                  placeholderTextColor={colors.textSecondary}
                />
                <Text style={styles.hint}>
                  These words will always be anonymized regardless of PII detection.
                </Text>
              </>
            )}

            <View style={styles.dangerSection}>
              <Text style={styles.dangerTitle}>Danger Zone</Text>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={onDeleteProject}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="trash.fill"
                  android_material_icon_name="delete"
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.deleteButtonText}>Delete Project</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  headerButton: {
    minWidth: 60,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  cancelText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'right',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    marginTop: 16,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 15,
    color: colors.text,
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    color: colors.text,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  dangerSection: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.statusError,
    marginBottom: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.statusError,
    borderRadius: 8,
    paddingVertical: 12,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
