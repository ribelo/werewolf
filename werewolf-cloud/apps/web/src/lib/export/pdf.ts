import jsPDF from 'jspdf';
import autoTable, { type UserOptions } from 'jspdf-autotable';
import type { UnifiedTableExportModel } from './unified-table';
import { NOTO_SANS_REGULAR_BASE64, NOTO_SANS_BOLD_BASE64 } from './fonts/noto-sans';

export interface CreatePdfOptions {
  title: string;
  subtitle?: string;
  generatedAtLabel?: string;
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

  const { title, subtitle, generatedAtLabel } = options;

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
    didDrawPage: (data) => {
      const pageCount = doc.internal.getNumberOfPages();
      const pageSize = doc.internal.pageSize;
      const { width } = pageSize;
      const footerY = pageSize.getHeight() - 30;

      // Header
      const headerY = 40;
      doc.setFontSize(18);
      doc.setFont('NotoSans', 'bold');
      doc.text(title, marginLeft, headerY, { baseline: 'middle' });
      if (subtitle) {
        doc.setFontSize(12);
        doc.setFont('NotoSans', 'normal');
        doc.text(subtitle, marginLeft, headerY + 24, { baseline: 'middle' });
      }

      doc.setFontSize(10);
      doc.setFont('NotoSans', 'normal');
      if (generatedAtLabel) {
        doc.text(generatedAtLabel, marginLeft, footerY, { baseline: 'alphabetic' });
      }

      const pageLabel = `${data.pageNumber} / ${pageCount}`;
      doc.text(pageLabel, width - marginRight, footerY, {
        baseline: 'alphabetic',
        align: 'right',
      });
    },
  } satisfies UserOptions;

  autoTable(doc, tableOptions);

  return doc.output('blob');
}
