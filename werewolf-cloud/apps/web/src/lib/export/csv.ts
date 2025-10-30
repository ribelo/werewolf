import type { UnifiedTableExportModel } from './unified-table';

function escapeCsvValue(value: string): string {
  const needsQuoting = /[",\r\n]/.test(value);
  if (!needsQuoting) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

export function serialiseCsv(model: UnifiedTableExportModel): string {
  const headerLine = model.columns.map((column) => escapeCsvValue(column.header)).join(',');
  const lines = model.rows.map((row) =>
    model.columns
      .map((column) => {
        const raw = row[column.key] ?? '';
        return escapeCsvValue(raw.toString());
      })
      .join(',')
  );

  return [headerLine, ...lines].join('\r\n');
}

export function createCsvBlob(model: UnifiedTableExportModel): Blob {
  const csv = serialiseCsv(model);
  // Prepend UTF-8 BOM so Excel renders UTF-8 correctly
  const content = `\uFEFF${csv}`;
  return new Blob([content], { type: 'text/csv;charset=utf-8;' });
}

