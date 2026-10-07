import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { jsPDF as JsPdfDocument } from 'jspdf';
import type { UnifiedTableExportModel } from '../unified-table';
import { createPdfBlob } from '../pdf';

/** Text drawn by every document created through the mocked jsPDF constructor. */
const drawnText: string[] = [];
/** Documents created through the mocked constructor, so the real page count is readable. */
const documents: JsPdfDocument[] = [];

vi.mock('jspdf', async () => {
  const actual = await vi.importActual<typeof import('jspdf')>('jspdf');
  type JsPdfConstructor = new (options?: unknown) => JsPdfDocument;
  const RealJsPDF = actual.default as unknown as JsPdfConstructor;

  // jsPDF copies its API onto every instance, so `text` is replaced per document.
  class RecordingJsPDF extends RealJsPDF {
    constructor(options?: unknown) {
      super(options);
      documents.push(this);
      const instance = this as unknown as { text: (...args: unknown[]) => JsPdfDocument };
      const originalText = instance.text.bind(this);
      instance.text = (...args: unknown[]) => {
        const value = args[0];
        if (typeof value === 'string') {
          drawnText.push(value);
        }
        return originalText(...args);
      };
    }
  }

  return { ...actual, jsPDF: RecordingJsPDF, default: RecordingJsPDF };
});

function buildModel(rowCount: number): UnifiedTableExportModel {
  return {
    columns: [
      { key: 'place', header: 'Place' },
      { key: 'teamOrLifter', header: 'Team / Lifter' },
      { key: 'gender', header: 'Gender' },
      { key: 'bodyweight', header: 'Bodyweight' },
      { key: 'weightClass', header: 'Weight class' },
      { key: 'age', header: 'Age' },
      { key: 'ageCategory', header: 'Age category' },
      { key: 'liftType', header: 'Lift' },
      { key: 'bestLift', header: 'Best lift' },
      { key: 'reshel', header: 'Reshel' },
      { key: 'mcc', header: 'McCullough' },
      { key: 'points', header: 'Points' },
    ],
    rows: Array.from({ length: rowCount }, (_, index) => ({
      place: String(index + 1),
      teamOrLifter: `Team ${(index % 4) + 1}\n${(index % 5) + 1}/5 slots filled`,
      gender: 'Male',
      bodyweight: `${(80 + index / 10).toFixed(2)} kg`,
      weightClass: '83 kg',
      age: '25',
      ageCategory: 'Senior',
      liftType: 'Bench',
      bestLift: `${(100 + index / 10).toFixed(1)} kg`,
      reshel: '1.000',
      mcc: '1.000',
      points: `${(60 + index / 10).toFixed(2)}`,
    })),
  };
}

function pageLabels(): string[] {
  return drawnText.filter((text) => /^\d+ \/ \d+$/.test(text));
}

describe('PDF page numbering', () => {
  beforeEach(() => {
    drawnText.length = 0;
    documents.length = 0;
  });

  it('labels each of the six pages with the final page count', async () => {
    await createPdfBlob(buildModel(75), {
      title: 'Contest',
      subtitle: 'Team Results',
      generatedAtLabel: 'Generated 2026-01-01 12:00',
    });

    const document = documents[documents.length - 1];
    const pageCount = document?.getNumberOfPages() ?? 0;

    expect(pageCount).toBe(6);
    expect(pageLabels()).toEqual(Array.from({ length: pageCount }, (_, index) => `${index + 1} / ${pageCount}`));
  });
});
