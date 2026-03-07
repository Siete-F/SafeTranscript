import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Pressable,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { Recording } from '@/types';
import { getStatusColor, getStatusLabel, formatDuration } from '@/utils/recording';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

interface RecordingCardProps {
  recording: Recording;
  isPlaying: boolean;
  onPress: (recording: Recording) => void;
  onDelete: (recording: Recording) => void;
  onPlayPause: (recording: Recording) => void;
}

function SwipeDeleteAction({
  recording,
  drag,
  onDelete,
}: {
  recording: Recording;
  drag: SharedValue<number>;
  onDelete: (recording: Recording) => void;
}) {
  const styleAnimation = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + 80 }],
  }));

  return (
    <Pressable onPress={() => onDelete(recording)}>
      <Reanimated.View style={[styleAnimation, styles.swipeDeleteAction]}>
        <IconSymbol
          ios_icon_name="trash.fill"
          android_material_icon_name="delete"
          size={24}
          color="#FFFFFF"
        />
      </Reanimated.View>
    </Pressable>
  );
}

function CardContent({
  recording,
  isPlaying,
  onPress,
  onDelete,
  onPlayPause,
}: RecordingCardProps) {
  const statusColor = getStatusColor(recording.status);
  const statusLabel = getStatusLabel(recording.status);
  const durationText = recording.audioDuration ? formatDuration(recording.audioDuration) : 'N/A';
  const dateText = recording.createdAt ? new Date(recording.createdAt).toLocaleDateString() : 'Unknown';
  const needsAttention = recording.status === 'error' || (recording.status === 'pending' && !recording.audioPath);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(recording)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
          {needsAttention && (
            <IconSymbol
              ios_icon_name="exclamationmark.circle.fill"
              android_material_icon_name="error"
              size={20}
              color={colors.statusError}
            />
          )}
        </View>
        <View style={styles.headerRight}>
          {Platform.OS === 'web' && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onDelete(recording);
              }}
              style={styles.webDeleteButton}
            >
              <IconSymbol
                ios_icon_name="trash.fill"
                android_material_icon_name="delete"
                size={18}
                color={colors.statusError}
              />
            </Pressable>
          )}
          <Text style={styles.date}>{dateText}</Text>
        </View>
      </View>

      <View style={styles.meta}>
        {recording.audioPath && recording.id && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onPlayPause(recording);
            }}
            style={styles.inlinePlayButton}
          >
            <IconSymbol
              ios_icon_name={isPlaying ? 'pause.fill' : 'play.fill'}
              android_material_icon_name={isPlaying ? 'pause' : 'play-arrow'}
              size={18}
              color="#FFFFFF"
            />
          </Pressable>
        )}
        <View style={styles.metaItem}>
          <IconSymbol
            ios_icon_name="clock.fill"
            android_material_icon_name="access-time"
            size={16}
            color={colors.textSecondary}
          />
          <Text style={styles.metaText}>{durationText}</Text>
        </View>
      </View>

      {recording.llmOutput && (
        <Text style={styles.preview} numberOfLines={2}>
          {recording.llmOutput}
        </Text>
      )}

      {needsAttention && !recording.audioPath && (
        <Text style={styles.warning}>Audio upload required</Text>
      )}
    </TouchableOpacity>
  );
}

export function RecordingCard(props: RecordingCardProps) {
  if (Platform.OS === 'web') {
    return <CardContent {...props} />;
  }

  return (
    <ReanimatedSwipeable
      friction={2}
      enableTrackpadTwoFingerGesture
      rightThreshold={40}
      renderRightActions={(_prog, drag) => (
        <SwipeDeleteAction
          recording={props.recording}
          drag={drag}
          onDelete={props.onDelete}
        />
      )}
      overshootRight={false}
    >
      <CardContent {...props} />
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webDeleteButton: {
    padding: 4,
    borderRadius: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  date: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  meta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  inlinePlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  preview: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  warning: {
    fontSize: 13,
    color: colors.statusError,
    marginTop: 8,
    fontStyle: 'italic',
  },
  swipeDeleteAction: {
    width: 80,
    height: '100%',
    backgroundColor: colors.statusError,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
});
