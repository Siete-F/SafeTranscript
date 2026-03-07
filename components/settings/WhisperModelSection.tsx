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
  isLocalModelSupported,
  checkWhisperModelExists,
  downloadWhisperModel,
  deleteWhisperModel,
  getDownloadedWhisperVariant,
  WHISPER_VARIANTS,
  DEFAULT_WHISPER_VARIANT,
} from '@/services/LocalModelManager';
import type { WhisperVariantId } from '@/services/LocalModelManager';
import type { ModalType } from '@/hooks/useModal';

const localModelAvailable = isLocalModelSupported();

interface WhisperModelSectionProps {
  showModal: (title: string, message: string, type: ModalType) => void;
}

export function WhisperModelSection({ showModal }: WhisperModelSectionProps) {
  const [modelDownloaded, setModelDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<WhisperVariantId>(DEFAULT_WHISPER_VARIANT);
  const [downloadedVariant, setDownloadedVariant] = useState<WhisperVariantId | null>(null);

  useEffect(() => {
    if (localModelAvailable) {
      checkWhisperModelExists().then(setModelDownloaded).catch(() => setModelDownloaded(false));
      getDownloadedWhisperVariant().then((v) => {
        setDownloadedVariant(v);
        if (v) setSelectedVariant(v);
      }).catch(() => {});
    }
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      await downloadWhisperModel((p) => setDownloadProgress(p), selectedVariant);
      setModelDownloaded(true);
      setDownloadedVariant(selectedVariant);
      const variant = WHISPER_VARIANTS[selectedVariant];
      showModal('Success', `${variant.name} downloaded successfully.`, 'success');
    } catch (error) {
      showModal('Error', error instanceof Error ? error.message : 'Failed to download model', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteWhisperModel();
      setModelDownloaded(false);
      setDownloadedVariant(null);
      showModal('Success', 'Whisper model removed.', 'success');
    } catch (error) {
      showModal('Error', error instanceof Error ? error.message : 'Failed to delete model', 'error');
    }
  };

  return (
    <View style={[styles.section, !localModelAvailable && styles.sectionDisabled]}>
      <Text style={styles.sectionTitle}>Offline Transcription</Text>
      <Text style={styles.sectionDescription}>
        {localModelAvailable
          ? 'Download a Whisper multilingual model for on-device transcription. Supports Dutch and 90+ languages. No API key needed. Audio is recorded as WAV for local processing.'
          : 'Local transcription is only available on iOS and Android devices.'}
      </Text>

      {localModelAvailable && !modelDownloaded && !isDownloading && (
        <View style={styles.keyCard}>
          <Text style={[styles.keyTitle, { marginBottom: 12 }]}>Choose Model Size</Text>
          {(Object.keys(WHISPER_VARIANTS) as WhisperVariantId[]).map((variantId) => {
            const variant = WHISPER_VARIANTS[variantId];
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
          <IconSymbol ios_icon_name="arrow.down.circle" android_material_icon_name="download" size={24} color={localModelAvailable ? colors.primary : colors.textSecondary} />
          <Text style={[styles.keyTitle, !localModelAvailable && styles.textDisabled]}>Whisper (ExecuTorch)</Text>
        </View>
        <Text style={styles.keyStatus}>
          Status: {(() => {
            if (!modelDownloaded) return 'Not downloaded';
            const variantName = downloadedVariant ? WHISPER_VARIANTS[downloadedVariant].name : 'Unknown';
            return `Downloaded ✓ (${variantName})`;
          })()}
        </Text>
        <Text style={styles.keyNote}>
          {modelDownloaded
            ? 'Local transcription active — new recordings will be transcribed on-device without an API key. On iOS, audio is recorded as WAV for direct processing. On Android, M4A is auto-converted to WAV.'
            : 'When downloaded, new recordings will be transcribed locally on iOS and Android. No API key needed for transcription.'}
        </Text>
        {isDownloading && (
          <View style={styles.progressBarContainer}>
            {(() => { const pct = Math.round(downloadProgress * 100); return (<><View style={[styles.progressBar, { width: `${pct}%` }]} /><Text style={styles.progressText}>{pct}%</Text></>); })()}
          </View>
        )}
        {localModelAvailable && !modelDownloaded && !isDownloading && (
          <TouchableOpacity style={styles.saveButton} onPress={handleDownload} activeOpacity={0.7}>
            <Text style={styles.saveButtonText}>
              Download {WHISPER_VARIANTS[selectedVariant].name} ({WHISPER_VARIANTS[selectedVariant].totalSizeMB} MB)
            </Text>
          </TouchableOpacity>
        )}
        {localModelAvailable && modelDownloaded && (
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
  sectionDisabled: { opacity: 0.5 },
  textDisabled: { color: colors.textSecondary },
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
