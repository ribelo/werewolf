import jsPDF from 'jspdf';
import autoTable, { type UserOptions } from 'jspdf-autotable';
import type { UnifiedTableExportModel } from './unified-table';
import { NOTO_SANS_REGULAR_BASE64, NOTO_SANS_BOLD_BASE64 } from './fonts/noto-sans';

export interface CreatePdfOptions {
  title: string;
  subtitle?: string;
  generatedAtLabel?: string;
}

interface PageMargins {
  left: number;
  right: number;
}

/**
 * Draws the repeating title/subtitle header and the footer on every page.
 *
 * It runs once the table has been paginated, so `pageCount` is the final page
 * count: rendering the footer while the table is still being drawn would label
 * every page with the number of pages that exist so far ("1 / 1", "2 / 2", ...).
 */
function drawPageFurniture(doc: jsPDF, options: CreatePdfOptions, margins: PageMargins): void {
  const pageCount = doc.getNumberOfPages();
  const pageSize = doc.internal.pageSize;
  const { width } = pageSize;
  const footerY = pageSize.getHeight() - 30;
  const headerY = 40;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);

    // Header
    doc.setFontSize(18);
    doc.setFont('NotoSans', 'bold');
    doc.text(options.title, margins.left, headerY, { baseline: 'middle' });
    if (options.subtitle) {
      doc.setFontSize(12);
      doc.setFont('NotoSans', 'normal');
      doc.text(options.subtitle, margins.left, headerY + 24, { baseline: 'middle' });
    }

    // Footer
    doc.setFontSize(10);
    doc.setFont('NotoSans', 'normal');
    if (options.generatedAtLabel) {
      doc.text(options.generatedAtLabel, margins.left, footerY, { baseline: 'alphabetic' });
    }

    doc.text(`${pageNumber} / ${pageCount}`, width - margins.right, footerY, {
      baseline: 'alphabetic',
      align: 'right',
    });
  }
}

export async function createPdfBlob(
  model: UnifiedTableExportModel,
  options: CreatePdfOptions
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  doc.addFileToVFS('NotoSans-Regular.ttf', NOTO_SANS_REGULAR_BASE64);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', NOTO_SANS_BOLD_BASE64);
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
  doc.setFont('NotoSans', 'normal');

  const marginLeft = 48;
  const marginRight = 48;
  const marginTop = 80;
  const marginBottom = 60;

  const tableBody = model.rows.map((row) =>
    model.columns.map((column) => row[column.key] ?? '')
  );
  const tableHeaders = model.columns.map((column) => column.header);

  const tableOptions = {
    startY: marginTop,
    margin: { top: marginTop, left: marginLeft, right: marginRight, bottom: marginBottom },
    rowPageBreak: 'avoid',
    head: [tableHeaders],
    body: tableBody,
    styles: {
      font: 'NotoSans',
      fontSize: 9,
      cellPadding: 6,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      font: 'NotoSans',
      fillColor: [234, 57, 67], // matches primary red
      textColor: [0, 0, 0],
      halign: 'left',
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      font: 'NotoSans',
      fillColor: [250, 249, 247],
      textColor: [20, 20, 20],
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
  } satisfies UserOptions;

  autoTable(doc, tableOptions);

  drawPageFurniture(doc, options, { left: marginLeft, right: marginRight });

  return doc.output('blob');
}
