import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import {
  checkGLiNERModelExists,
  downloadGLiNERModel,
  deleteGLiNERModel,
  getDownloadedVariant,
} from '@/services/gliner/GLiNERModelManager';
import { disposeGLiNER } from '@/services/gliner/GLiNERInference';
import { MODEL_VARIANTS, DEFAULT_VARIANT } from '@/services/gliner/config';
import type { ModelVariantId } from '@/services/gliner/config';
import type { ModalType } from '@/hooks/useModal';

interface PiiModelSectionProps {
  showModal: (title: string, message: string, type: ModalType) => void;
}

export function PiiModelSection({ showModal }: PiiModelSectionProps) {
  const [modelDownloaded, setModelDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<ModelVariantId>(DEFAULT_VARIANT);
  const [downloadedVariant, setDownloadedVariant] = useState<ModelVariantId | null>(null);

  useEffect(() => {
    checkGLiNERModelExists().then(setModelDownloaded).catch(() => setModelDownloaded(false));
    getDownloadedVariant().then((v) => {
      setDownloadedVariant(v);
      if (v) setSelectedVariant(v);
    }).catch(() => {});
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      await disposeGLiNER();
      await downloadGLiNERModel((p) => setDownloadProgress(p), selectedVariant);
      setModelDownloaded(true);
      setDownloadedVariant(selectedVariant);
      const variant = MODEL_VARIANTS[selectedVariant];
      showModal('Success', `${variant.name} downloaded successfully.`, 'success');
    } catch (error) {
      showModal('Error', error instanceof Error ? error.message : 'Failed to download PII model', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await disposeGLiNER();
      await deleteGLiNERModel();
      setModelDownloaded(false);
      setDownloadedVariant(null);
      showModal('Success', 'PII detection model removed. Regex fallback will be used.', 'success');
    } catch (error) {
      showModal('Error', error instanceof Error ? error.message : 'Failed to delete PII model', 'error');
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>PII Detection Model</Text>
      <Text style={styles.sectionDescription}>
        Download a GLiNER multilingual model for improved entity recognition (names, organizations, locations, and more). Supports Dutch and 100+ languages. When not downloaded, regex-based detection is used as fallback.
      </Text>

      {!modelDownloaded && !isDownloading && (
        <View style={styles.keyCard}>
          <Text style={[styles.keyTitle, { marginBottom: 12 }]}>Choose Model Size</Text>
          {(Object.keys(MODEL_VARIANTS) as ModelVariantId[]).map((variantId) => {
            const variant = MODEL_VARIANTS[variantId];
            const isSelected = selectedVariant === variantId;
            return (
              <TouchableOpacity
                key={variantId}
                style={[styles.variantOption, isSelected && styles.variantOptionSelected]}
                onPress={() => setSelectedVariant(variantId)}
                activeOpacity={0.7}
              >
                <View style={styles.variantRadio}>
                  <View style={[styles.variantRadioInner, isSelected && styles.variantRadioInnerSelected]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.variantName, isSelected && styles.variantNameSelected]}>
                    {variant.name}
                  </Text>
                  <Text style={styles.variantDesc}>{variant.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.keyCard}>
        <View style={styles.keyHeader}>
          <IconSymbol ios_icon_name="shield.checkered" android_material_icon_name="security" size={24} color={colors.secondary} />
          <Text style={styles.keyTitle}>GLiNER Multi v2.1</Text>
        </View>
        <Text style={styles.keyStatus}>
          Status: {(() => {
            if (!modelDownloaded) return 'Not downloaded (using regex fallback)';
            const variantName = downloadedVariant ? MODEL_VARIANTS[downloadedVariant].name : 'Unknown variant';
            return `Downloaded ✓ (${variantName})`;
          })()}
        </Text>
        <Text style={styles.keyNote}>
          {modelDownloaded
            ? 'Hybrid mode active: GLiNER detects names, organizations & locations + regex catches emails, phones, SSNs, and other structured patterns.'
            : `Detects 20+ PII types including person names, organizations, locations, emails, phone numbers, IBANs, and more. Works in Dutch and English.`}
        </Text>
        {isDownloading && (
          <View style={styles.progressBarContainer}>
            {(() => { const pct = Math.round(downloadProgress * 100); return (<><View style={[styles.progressBar, { width: `${pct}%` }]} /><Text style={styles.progressText}>{pct}%</Text></>); })()}
          </View>
        )}
        {!modelDownloaded && !isDownloading && (
          <TouchableOpacity style={styles.saveButton} onPress={handleDownload} activeOpacity={0.7}>
            <Text style={styles.saveButtonText}>
              Download {MODEL_VARIANTS[selectedVariant].name} ({MODEL_VARIANTS[selectedVariant].sizeMB} MB)
            </Text>
          </TouchableOpacity>
        )}
        {modelDownloaded && !isDownloading && (
          <TouchableOpacity style={styles.deleteModelButton} onPress={handleDelete} activeOpacity={0.7}>
            <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={colors.error} />
            <Text style={styles.deleteModelButtonText}>Remove Model</Text>
          </TouchableOpacity>
        )}
      </View>
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
  saveButton: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  deleteModelButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, padding: 16, gap: 12 },
  deleteModelButtonText: { fontSize: 16, fontWeight: '600', color: colors.error },
  progressBarContainer: { height: 24, backgroundColor: colors.border, borderRadius: 12, marginBottom: 12, overflow: 'hidden', justifyContent: 'center' },
  progressBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.primary, borderRadius: 12 },
  progressText: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'center' },
  variantOption: { flexDirection: 'row' as const, alignItems: 'center' as const, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginBottom: 8, gap: 10 },
  variantOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  variantRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.textSecondary, alignItems: 'center' as const, justifyContent: 'center' as const },
  variantRadioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'transparent' },
  variantRadioInnerSelected: { backgroundColor: colors.primary },
  variantName: { fontSize: 15, fontWeight: '600', color: colors.text },
  variantNameSelected: { color: colors.primary },
  variantDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
