import type { TableModel } from '@werewolf/core'
import regularUrl from './fonts/NotoSans-Regular.ttf?url'
import boldUrl from './fonts/NotoSans-Bold.ttf?url'

export interface PdfFonts {
  readonly regular: string
  readonly bold: string
}
export interface PdfOptions {
  readonly subtitle: string
  readonly generatedAt: string
  /** Without fonts the built-in Latin font is used; Polish letters need the bundled Noto Sans. */
  readonly fonts: PdfFonts | 'builtin'
}

const base64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let text = ''
  for (let index = 0; index < bytes.length; index += 0x8000)
    text += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(text)
}
/** The fonts ship with the app and are cached by the service worker after the first export. */
export async function loadPdfFonts(): Promise<PdfFonts> {
  const [regular, bold] = await Promise.all(
    [regularUrl, boldUrl].map(async (url) => base64(await (await fetch(url)).arrayBuffer())),
  )
  return { regular: regular ?? '', bold: bold ?? '' }
}

/** One table per page group; the footer carries "page / pages" after the final page count is known. */
export async function buildResultsPdf(models: ReadonlyArray<TableModel>, options: PdfOptions) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  let family = 'helvetica'
  if (options.fonts !== 'builtin') {
    doc.addFileToVFS('NotoSans-Regular.ttf', options.fonts.regular)
    doc.addFileToVFS('NotoSans-Bold.ttf', options.fonts.bold)
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal')
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold')
    family = 'NotoSans'
  }
  const margin = 36
  for (const [index, model] of models.entries()) {
    if (index > 0) doc.addPage()
    doc.setFont(family, 'bold')
    doc.setFontSize(16)
    doc.text(model.title, margin, 40)
    doc.setFont(family, 'normal')
    doc.setFontSize(10)
    doc.text(options.subtitle, margin, 56)
    autoTable(doc, {
      head: [[...model.columns]],
      body: model.rows.map((row) => [...row]),
      startY: 70,
      margin: { left: margin, right: margin, bottom: 40 },
      styles: { font: family, fontSize: 9 },
      headStyles: { fillColor: [220, 20, 60] },
    })
  }
  const pages = doc.getNumberOfPages()
  const { width, height } = doc.internal.pageSize
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFont(family, 'normal')
    doc.setFontSize(9)
    doc.text(options.generatedAt, margin, height - 20)
    doc.text(page + ' / ' + pages, width - margin, height - 20, { align: 'right' })
  }
  return doc
}
