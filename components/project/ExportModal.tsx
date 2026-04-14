
import {
  Modal as RNModal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export type ExportFormat = 'json' | 'xls';

interface ExportModalProps {
  visible: boolean;
  /** Whether an export is currently in progress */
  exporting: boolean;
  /** Format currently being exported (null = none in progress) */
  exportingFormat: ExportFormat | null;
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
}

export function ExportModal({
  visible,
  exporting,
  exportingFormat,
  onClose,
  onExport,
}: Readonly<ExportModalProps>) {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <IconSymbol
              ios_icon_name="square.and.arrow.up"
              android_material_icon_name="file-download"
              size={48}
              color={colors.primary}
            />
          </View>

          <Text style={styles.title}>Export Project</Text>
          <Text style={styles.subtitle}>
            Choose a format. The file will be saved inside the project folder
            {Platform.OS !== 'web' ? ' and you can share it afterwards' : ''}.
          </Text>

          <View style={styles.formatButtons}>
            <TouchableOpacity
              style={[styles.formatButton, exporting && styles.formatButtonDisabled]}
              onPress={() => onExport('json')}
              activeOpacity={0.7}
              disabled={exporting}
            >
              {exporting && exportingFormat === 'json' ? (
                <ActivityIndicator color={colors.card} size="small" />
              ) : (
                <IconSymbol
                  ios_icon_name="doc.text"
                  android_material_icon_name="description"
                  size={28}
                  color={colors.card}
                />
              )}
              <Text style={styles.formatButtonTitle}>JSON</Text>
              <Text style={styles.formatButtonSubtitle}>Structured data</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.formatButton, styles.formatButtonExcel, exporting && styles.formatButtonDisabled]}
              onPress={() => onExport('xls')}
              activeOpacity={0.7}
              disabled={exporting}
            >
              {exporting && exportingFormat === 'xls' ? (
                <ActivityIndicator color={colors.card} size="small" />
              ) : (
                <IconSymbol
                  ios_icon_name="tablecells"
                  android_material_icon_name="table-chart"
                  size={28}
                  color={colors.card}
                />
              )}
              <Text style={styles.formatButtonTitle}>Excel</Text>
              <Text style={styles.formatButtonSubtitle}>Opens in Excel / Numbers</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            activeOpacity={0.7}
            disabled={exporting}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  formatButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  formatButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 8,
  },
  formatButtonExcel: {
    backgroundColor: '#217346',
  },
  formatButtonDisabled: {
    opacity: 0.6,
  },
  formatButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.card,
  },
  formatButtonSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});
