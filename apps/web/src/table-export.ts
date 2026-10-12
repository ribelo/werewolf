import type { TableModel } from '@werewolf/core'
import writeXlsxFile from 'write-excel-file/browser'

/** Save a generated file with the browser's download. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const fileSlug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'werewolf'

/** One worksheet per table; numbers stay numbers so Excel can sort and sum them. */
export async function tablesToXlsx(models: ReadonlyArray<TableModel>): Promise<Blob> {
  const cell = (value: string) => {
    const number = Number(value)
    return value !== '' && Number.isFinite(number) && /^-?\d+(\.\d+)?$/.test(value)
      ? { value: number }
      : { value }
  }
  const used = new Set<string>()
  const sheets = models.map((model, index) => {
    let name = model.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Sheet ' + (index + 1)
    while (used.has(name)) name = name.slice(0, 25) + ' ' + index
    used.add(name)
    return {
      sheet: name,
      data: [
        model.columns.map((column) => ({ value: column, fontWeight: 'bold' as const })),
        ...model.rows.map((row) => row.map(cell)),
      ],
    }
  })
  return writeXlsxFile(sheets).toBlob()
}

const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/** Print the tables as they are filtered now, without a PDF step. */
export function printTables(title: string, subtitle: string, models: ReadonlyArray<TableModel>) {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><title>' +
    escape(title) +
    '</title><style>' +
    'body{font-family:Inter,Arial,sans-serif;color:#000;margin:12mm}' +
    'h1{font-size:18pt;margin:0 0 2mm}h2{font-size:13pt;margin:6mm 0 2mm}p{margin:0 0 4mm;color:#444}' +
    'table{border-collapse:collapse;width:100%;font-size:9pt;page-break-inside:auto}' +
    'th,td{border:1px solid #888;padding:2px 4px;text-align:left}th{background:#eee}' +
    'tr{page-break-inside:avoid}@page{size:landscape;margin:10mm}' +
    '</style></head><body><h1>' +
    escape(title) +
    '</h1><p>' +
    escape(subtitle) +
    '</p>' +
    models
      .map(
        (model) =>
          '<h2>' +
          escape(model.title) +
          '</h2><table><thead><tr>' +
          model.columns.map((column) => '<th>' + escape(column) + '</th>').join('') +
          '</tr></thead><tbody>' +
          model.rows
            .map(
              (row) =>
                '<tr>' + row.map((value) => '<td>' + escape(value) + '</td>').join('') + '</tr>',
            )
            .join('') +
          '</tbody></table>',
      )
      .join('') +
    '</body></html>'
  const target = frame.contentWindow
  if (!target) return
  target.document.open()
  target.document.write(html)
  target.document.close()
  target.addEventListener('afterprint', () => frame.remove())
  setTimeout(() => {
    target.focus()
    target.print()
  }, 50)
}
