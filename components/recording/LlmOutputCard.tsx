import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';

interface LlmOutputCardProps {
  output: string;
  onCopy: () => void;
}

export function LlmOutputCard({ output, onCopy }: LlmOutputCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>LLM Output</Text>
        <TouchableOpacity
          style={styles.copyButton}
          onPress={onCopy}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="doc.on.doc"
            android_material_icon_name="content-copy"
            size={20}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>
      <Text style={styles.text}>{output}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  copyButton: {
    padding: 4,
  },
  text: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
});
