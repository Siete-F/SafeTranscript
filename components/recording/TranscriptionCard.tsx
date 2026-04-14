import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import type { TranscriptionSource, TranscriptionSegment } from '@/types';

const SPEAKER_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // purple
  '#EF4444', // red
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
];

interface TranscriptionCardProps {
  transcription: string;
  transcriptionSource?: TranscriptionSource;
  transcriptionData?: TranscriptionSegment[];
  speakerMap?: Record<string, string>;
  anonymizedTranscription?: string;
  piiMappings?: Record<string, string>;
  hasMistralKey: boolean;
  hasSelfHostedUrl: boolean;
  retranscribing: boolean;
  onRetranscribe: () => void;
  onRetranscribeSelfHosted: () => void;
  onSpeakerRename?: (speakerId: string, newName: string) => void;
}

interface MergedTurn {
  speaker: string;
  startMs: number;
  endMs?: number;
  text: string;
}

function mergeConsecutiveSpeakers(segments: TranscriptionSegment[]): MergedTurn[] {
  const merged: MergedTurn[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.endMs = seg.endTimestamp ?? seg.timestamp;
      last.text += ' ' + seg.text;
    } else {
      merged.push({
        speaker: seg.speaker,
        startMs: seg.timestamp,
        endMs: seg.endTimestamp,
        text: seg.text,
      });
    }
  }
  return merged;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function hasDiarization(segments: TranscriptionSegment[]): boolean {
  if (segments.length < 2) return false;
  const speakers = new Set(segments.map(s => s.speaker));
  return speakers.size > 1;
}

function getSpeakerColor(speakerId: string, allSpeakers: string[]): string {
  const idx = allSpeakers.indexOf(speakerId);
  return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
}

function renderTranscriptionWithPII(text: string, piiMappings?: Record<string, string>) {
  if (!piiMappings || Object.keys(piiMappings).length === 0) {
    return <Text style={styles.transcriptionText}>{text}</Text>;
  }

  const piiValues = Object.values(piiMappings)
    .filter((v) => v.length > 0)
    .sort((a, b) => b.length - a.length);

  if (piiValues.length === 0) {
    return <Text style={styles.transcriptionText}>{text}</Text>;
  }

  const escaped = piiValues.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(pattern);
  const piiSet = new Set(piiValues.map((v) => v.toLowerCase()));

  return (
    <Text style={styles.transcriptionText}>
      {parts.map((part, i) =>
        piiSet.has(part.toLowerCase()) ? (
          <Text key={i} style={styles.piiHighlight}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

export function TranscriptionCard({
  transcription,
  transcriptionSource,
  transcriptionData,
  speakerMap,
  anonymizedTranscription,
  piiMappings,
  hasMistralKey,
  hasSelfHostedUrl,
  retranscribing,
  onRetranscribe,
  onRetranscribeSelfHosted,
  onSpeakerRename,
}: TranscriptionCardProps) {
  const [showAnonymizedPayload, setShowAnonymizedPayload] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const showDiarized = transcriptionData && hasDiarization(transcriptionData);
  const mergedTurns = showDiarized ? mergeConsecutiveSpeakers(transcriptionData!) : [];
  const allSpeakers = showDiarized
    ? [...new Set(transcriptionData!.map(s => s.speaker))]
    : [];

  const getSpeakerDisplayName = (speakerId: string): string => {
    if (speakerMap?.[speakerId]) return speakerMap[speakerId];
    const idx = allSpeakers.indexOf(speakerId);
    return `Speaker ${idx + 1}`;
  };

  const handleStartRename = (speakerId: string) => {
    setEditingSpeaker(speakerId);
    setEditingName(getSpeakerDisplayName(speakerId));
  };

  const handleFinishRename = () => {
    if (editingSpeaker && editingName.trim() && onSpeakerRename) {
      onSpeakerRename(editingSpeaker, editingName.trim());
    }
    setEditingSpeaker(null);
    setEditingName('');
  };

  const handleCancelRename = () => {
    setEditingSpeaker(null);
    setEditingName('');
  };

  return (
    <View style={styles.card}>
      <View style={styles.outputHeader}>
        <Text style={styles.sectionTitle}>
          Transcription
          {transcriptionSource === 'whisper' && (
            <Text style={styles.sourceBadge}> (Whisper)</Text>
          )}
          {transcriptionSource === 'voxtral-api' && (
            <Text style={styles.sourceBadge}> (Voxtral)</Text>
          )}
          {transcriptionSource === 'self-hosted' && (
            <Text style={styles.sourceBadge}> (Self-Hosted)</Text>
          )}
        </Text>
        {anonymizedTranscription && (
          <TouchableOpacity
            style={[styles.payloadButton, showAnonymizedPayload && styles.payloadButtonActive]}
            onPress={() => setShowAnonymizedPayload(!showAnonymizedPayload)}
            activeOpacity={0.7}
          >
            <IconSymbol
              ios_icon_name="eye.fill"
              android_material_icon_name="visibility"
              size={18}
              color={showAnonymizedPayload ? colors.card : colors.primary}
            />
          </TouchableOpacity>
        )}
      </View>

      {showAnonymizedPayload && anonymizedTranscription ? (
        <>
          <Text style={styles.payloadLabel}>Anonymized payload sent to LLM:</Text>
          <Text style={styles.anonymizedText}>{anonymizedTranscription}</Text>
        </>
      ) : showDiarized ? (
        <View style={styles.conversationContainer}>
          {allSpeakers.length > 1 && (
            <View style={styles.speakerLegend}>
              {allSpeakers.map((speakerId) => {
                const speakerColor = getSpeakerColor(speakerId, allSpeakers);
                const isEditing = editingSpeaker === speakerId;

                return (
                  <View key={speakerId} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: speakerColor }]} />
                    {isEditing ? (
                      <View style={styles.renameRow}>
                        <TextInput
                          style={styles.renameInput}
                          value={editingName}
                          onChangeText={setEditingName}
                          onSubmitEditing={handleFinishRename}
                          onBlur={handleFinishRename}
                          autoFocus
                          selectTextOnFocus
                          returnKeyType="done"
                        />
                        <TouchableOpacity onPress={handleCancelRename} hitSlop={8}>
                          <IconSymbol
                            ios_icon_name="xmark.circle.fill"
                            android_material_icon_name="cancel"
                            size={18}
                            color={colors.textSecondary}
                          />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.speakerNameButton}
                        onPress={() => handleStartRename(speakerId)}
                        activeOpacity={0.6}
                      >
                        <Text style={[styles.legendName, { color: speakerColor }]}>
                          {getSpeakerDisplayName(speakerId)}
                        </Text>
                        <IconSymbol
                          ios_icon_name="pencil"
                          android_material_icon_name="edit"
                          size={12}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {mergedTurns.map((turn, i) => {
            const speakerColor = getSpeakerColor(turn.speaker, allSpeakers);
            const displayName = getSpeakerDisplayName(turn.speaker);
            const timeRange = turn.endMs != null
              ? `${formatTimestamp(turn.startMs)}–${formatTimestamp(turn.endMs)}`
              : formatTimestamp(turn.startMs);

            return (
              <View key={i} style={styles.turnContainer}>
                <View style={[styles.turnIndicator, { backgroundColor: speakerColor }]} />
                <View style={styles.turnContent}>
                  <View style={styles.turnHeader}>
                    <Text style={[styles.turnSpeaker, { color: speakerColor }]}>
                      {displayName}
                    </Text>
                    <Text style={styles.turnTimestamp}>{timeRange}</Text>
                  </View>
                  {renderTranscriptionWithPII(turn.text, piiMappings)}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        renderTranscriptionWithPII(transcription, piiMappings)
      )}

      {transcriptionSource === 'whisper' && (
        <View style={styles.retranscribeRow}>
          <TouchableOpacity
            style={[
              styles.retranscribeButton,
              styles.retranscribeButtonFlex,
              !hasMistralKey && styles.retranscribeButtonDisabled,
            ]}
            onPress={onRetranscribe}
            disabled={!hasMistralKey || retranscribing}
            activeOpacity={0.7}
          >
            {retranscribing ? (
              <ActivityIndicator size="small" color={hasMistralKey ? colors.card : colors.textSecondary} />
            ) : (
              <IconSymbol
                ios_icon_name="arrow.triangle.2.circlepath"
                android_material_icon_name="sync"
                size={16}
                color={hasMistralKey ? colors.card : colors.textSecondary}
              />
            )}
            <Text style={[
              styles.retranscribeButtonText,
              !hasMistralKey && styles.retranscribeButtonTextDisabled,
            ]}>
              {retranscribing ? 'Re-transcribing…' : 'Voxtral API'}
            </Text>
            {!hasMistralKey && (
              <Text style={styles.retranscribeHint}>Key required</Text>
            )}
          </TouchableOpacity>

          {hasSelfHostedUrl && (
            <TouchableOpacity
              style={[styles.retranscribeButton, styles.retranscribeButtonFlex, styles.retranscribeButtonSelfHosted]}
              onPress={onRetranscribeSelfHosted}
              disabled={retranscribing}
              activeOpacity={0.7}
            >
              {retranscribing ? (
                <ActivityIndicator size="small" color={colors.card} />
              ) : (
                <IconSymbol
                  ios_icon_name="server.rack"
                  android_material_icon_name="dns"
                  size={16}
                  color={colors.card}
                />
              )}
              <Text style={styles.retranscribeButtonText}>Self-Hosted</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
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
  outputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  transcriptionText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  piiHighlight: {
    fontWeight: '700',
    color: colors.accent,
  },
  sourceBadge: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  payloadButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: `${colors.primary}15`,
  },
  payloadButtonActive: {
    backgroundColor: colors.primary,
  },
  payloadLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  anonymizedText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: `${colors.border}40`,
    padding: 12,
    borderRadius: 8,
  },

  // Diarization / conversation view
  conversationContainer: {
    gap: 2,
  },
  speakerLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendName: {
    fontSize: 13,
    fontWeight: '600',
  },
  speakerNameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  renameInput: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    paddingVertical: 2,
    paddingHorizontal: 4,
    minWidth: 80,
  },
  turnContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  turnIndicator: {
    width: 3,
    borderRadius: 1.5,
    marginRight: 10,
  },
  turnContent: {
    flex: 1,
  },
  turnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  turnSpeaker: {
    fontSize: 13,
    fontWeight: '700',
  },
  turnTimestamp: {
    fontSize: 11,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // Retranscribe button
  retranscribeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  retranscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  retranscribeButtonFlex: {
    flex: 1,
  },
  retranscribeButtonSelfHosted: {
    backgroundColor: colors.secondary,
  },
  retranscribeButtonDisabled: {
    backgroundColor: `${colors.border}80`,
  },
  retranscribeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.card,
  },
  retranscribeButtonTextDisabled: {
    color: colors.textSecondary,
  },
  retranscribeHint: {
    fontSize: 11,
    color: colors.textSecondary,
    marginLeft: 4,
  },
});
