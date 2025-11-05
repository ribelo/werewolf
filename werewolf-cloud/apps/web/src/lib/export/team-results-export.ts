import { buildTeamResultsExportModel } from './team-results';
import { createCsvBlob, createPdfBlob, createJpgBlob } from './index';
import type { TeamResultsTable } from '$lib/types';

export interface ExportTeamResultsOptions {
  table: TeamResultsTable;
  contestName: string;
  format: 'csv' | 'pdf' | 'jpg';
  translate: (key: string, params?: Record<string, unknown>) => string;
  locale: string;
  downloadFile: (blob: Blob, filename: string) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

function formatTimestampForFilename(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function formatDisplayTimestamp(date: Date, currentLocale: string): string {
  try {
    return new Intl.DateTimeFormat(currentLocale || undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function safeFileName(input: string): string {
  const cleaned = input.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'export';
  }
  return cleaned;
}

export async function exportTeamResults({
  table,
  contestName,
  format,
  translate,
  locale,
  downloadFile,
  onSuccess,
  onError,
}: ExportTeamResultsOptions): Promise<void> {
  if (!table || table.rows.length === 0) {
    onError(translate('contest_detail.export.empty'));
    return;
  }

  try {
    const model = buildTeamResultsExportModel({
      table,
      translate,
    });

    const now = new Date();
    const contestTitle = contestName || translate('contest_detail.fallback_title');
    const metricTitle = translate('contest_detail.team_results.metric_descriptions.mixed');
    const fileBase = `${contestTitle} - ${translate('contest_detail.team_results.title')} - ${metricTitle} - ${formatTimestampForFilename(now)}`;
    const filename = `${safeFileName(fileBase)}.${format}`;

    if (format === 'csv') {
      const blob = createCsvBlob(model);
      downloadFile(blob, filename);
    } else if (format === 'pdf') {
      const generatedLabel = translate('contest_detail.export.generated_at', {
        timestamp: formatDisplayTimestamp(now, locale),
      });
      const blob = await createPdfBlob(model, {
        title: contestTitle,
        subtitle: `${translate('contest_detail.team_results.title')} - ${metricTitle}`,
        generatedAtLabel: generatedLabel,
      });
      downloadFile(blob, filename);
    } else {
      const generatedLabel = translate('contest_detail.export.generated_at', {
        timestamp: formatDisplayTimestamp(now, locale),
      });
      const blob = await createJpgBlob(model, {
        title: contestTitle,
        subtitle: `${translate('contest_detail.team_results.title')} - ${metricTitle}`,
        generatedAtLabel: generatedLabel,
      });
      downloadFile(blob, filename);
    }

    onSuccess(translate('contest_detail.export.success'));
  } catch (error) {
    console.error('Team results export failed', error);
    onError(translate('contest_detail.export.error'));
  }
}