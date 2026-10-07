import { describe, it, expect } from 'vitest';
import { createCsvBlob, serialiseCsv } from '../csv';
import type { UnifiedTableExportModel } from '../unified-table';

const model: UnifiedTableExportModel = {
  columns: [
    { key: 'name', header: 'Lifter' },
    { key: 'club', header: 'Club' },
    { key: 'notes', header: 'Notes' },
  ],
  rows: [
    { name: 'He said "hi"', club: 'Klub; Wilk', notes: 'line one\nline two' },
    { name: 'Łukasz Żółć', club: 'Kraków', notes: '–' },
  ],
};

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read CSV blob'));
    reader.readAsArrayBuffer(blob);
  });
}

describe('CSV serialisation', () => {
  it('joins columns with semicolons and rows with CRLF', () => {
    expect(serialiseCsv(model).split('\r\n')[0]).toBe('Lifter;Club;Notes');
    expect(serialiseCsv(model).split('\r\n')).toHaveLength(3);
  });

  it('doubles embedded quotes and quotes values with ; " or newlines', () => {
    const rows = serialiseCsv(model).split('\r\n');

    expect(rows[1]).toBe('"He said ""hi""";"Klub; Wilk";"line one\nline two"');
  });

  it('leaves plain values unquoted, including non-ASCII ones', () => {
    const rows = serialiseCsv(model).split('\r\n');

    expect(rows[2]).toBe('Łukasz Żółć;Kraków;–');
  });

  it('prepends a UTF-8 BOM so Excel reads non-ASCII values', async () => {
    const blob = createCsvBlob(model);

    expect(blob.type).toBe('text/csv;charset=utf-8;');

    const bytes = await readBlobBytes(blob);
    // The BOM is what makes Excel treat the file as UTF-8.
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.subarray(3))).toBe(serialiseCsv(model));
  });
});
