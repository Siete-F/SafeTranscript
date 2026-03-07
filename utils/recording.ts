import { colors } from '@/styles/commonStyles';
import type { Recording } from '@/types';

const STATUS_COLORS: Record<Recording['status'], string> = {
  pending: colors.statusPending,
  transcribing: colors.statusTranscribing,
  anonymizing: colors.statusAnonymizing,
  processing: colors.statusProcessing,
  done: colors.statusDone,
  stale: colors.statusStale,
  error: colors.statusError,
};

const STATUS_LABELS: Record<Recording['status'], string> = {
  pending: 'Pending',
  transcribing: 'Transcribing',
  anonymizing: 'Anonymizing',
  processing: 'Processing',
  done: 'Done',
  stale: 'Stale',
  error: 'Error',
};

export function getStatusColor(status: Recording['status']): string {
  return STATUS_COLORS[status];
}

export function getStatusLabel(status: Recording['status']): string {
  return STATUS_LABELS[status];
}

/** Format seconds as "Xm Xs" (e.g. "3m 24s") */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

/** Format seconds as "MM:SS" (e.g. "03:24") */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
