import { getRecordingsByProject } from './recordings';
import type { Recording } from '@/types';

// ---------------------------------------------------------------------------
// Shared data builder
// ---------------------------------------------------------------------------

interface ExportRow {
  date: string;
  time: string;
  customFields: Record<string, string>;
  transcription: string;
  anonymizedTranscription: string;
  llmOutput: string;
  status: string;
}

interface ExportData {
  customFieldNames: string[];
  rows: ExportRow[];
}

async function buildExportData(projectId: string): Promise<ExportData> {
  const recordings = await getRecordingsByProject(projectId);
  const doneRecordings = recordings.filter((r) => r.status === 'done');

  // Collect unique custom field names across all recordings
  const customFieldNameSet = new Set<string>();
  doneRecordings.forEach((r: Recording) => {
    if (r.customFieldValues) {
      Object.keys(r.customFieldValues).forEach((key) => customFieldNameSet.add(key));
    }
  });
  const customFieldNames = Array.from(customFieldNameSet).sort();

  const rows: ExportRow[] = doneRecordings.map((recording: Recording) => {
    const createdAt = new Date(recording.createdAt);
    const date = createdAt.toISOString().split('T')[0];
    const time = createdAt.toISOString().split('T')[1]?.substring(0, 8) || '';

    const customFields: Record<string, string> = {};
    customFieldNames.forEach((field) => {
      const value = recording.customFieldValues?.[field];
      customFields[field] = value !== undefined ? String(value) : '';
    });

    return {
      date,
      time,
      customFields,
      transcription: recording.transcription || '',
      anonymizedTranscription: recording.anonymizedTranscription || '',
      llmOutput: recording.llmOutput || '',
      status: recording.status,
    };
  });

  return { customFieldNames, rows };
}

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

/** Export completed recordings as a JSON string. */
export async function exportProjectJSON(projectId: string): Promise<string> {
  const { customFieldNames, rows } = await buildExportData(projectId);

  const output = rows.map((row) => {
    const entry: Record<string, string> = {
      date: row.date,
      time: row.time,
    };
    customFieldNames.forEach((field) => {
      entry[field] = row.customFields[field];
    });
    entry.transcription = row.transcription;
    entry.anonymized_transcription = row.anonymizedTranscription;
    entry.llm_output = row.llmOutput;
    entry.status = row.status;
    return entry;
  });

  return JSON.stringify(output, null, 2);
}

// ---------------------------------------------------------------------------
// Excel (SpreadsheetML XML) export
// ---------------------------------------------------------------------------

/**
 * Export completed recordings as a SpreadsheetML XML string (.xls).
 * No external library needed — Excel, Numbers, and LibreOffice all support
 * this format and open it directly.
 */
export async function exportProjectXLS(projectId: string): Promise<string> {
  const { customFieldNames, rows } = await buildExportData(projectId);

  const headers = [
    'Date',
    'Time',
    ...customFieldNames,
    'Transcription',
    'Anonymized Transcription',
    'LLM Output',
    'Status',
  ];

  const xmlRows: string[] = [];

  // Header row
  xmlRows.push(
    '<Row>' +
      headers.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('') +
      '</Row>',
  );

  // Data rows
  rows.forEach((row) => {
    const cells = [
      row.date,
      row.time,
      ...customFieldNames.map((f) => row.customFields[f]),
      row.transcription,
      row.anonymizedTranscription,
      row.llmOutput,
      row.status,
    ].map((val) => `<Cell><Data ss:Type="String">${escapeXml(val)}</Data></Cell>`);

    xmlRows.push('<Row>' + cells.join('') + '</Row>');
  });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n' +
    '          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n' +
    '  <Worksheet ss:Name="Export">\n' +
    '    <Table>\n' +
    xmlRows.map((r) => '      ' + r).join('\n') +
    '\n    </Table>\n' +
    '  </Worksheet>\n' +
    '</Workbook>'
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
