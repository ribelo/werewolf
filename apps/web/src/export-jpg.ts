import type { TableModel } from '@werewolf/core'
import { toJpeg } from 'html-to-image'

/** Draws the table once in a hidden dark card (the 2025 palette) and rasterises it. */
export async function buildResultsJpg(model: TableModel, subtitle: string): Promise<Blob> {
  const host = document.createElement('div')
  host.style.cssText =
    'position:fixed;left:0;top:0;z-index:-1;width:1400px;background:#000;color:#fff;padding:24px;font-family:Inter,system-ui,sans-serif'
  const title = document.createElement('h1')
  title.textContent = model.title
  title.style.cssText =
    'font-family:"Bebas Neue",sans-serif;letter-spacing:.12em;font-size:40px;margin:0 0 4px'
  const sub = document.createElement('p')
  sub.textContent = subtitle
  sub.style.cssText = 'color:#b0b0b0;margin:0 0 16px'
  const table = document.createElement('table')
  table.style.cssText = 'border-collapse:collapse;width:100%;font-size:16px'
  const head = table.createTHead().insertRow()
  for (const column of model.columns) {
    const cell = document.createElement('th')
    cell.textContent = column
    cell.style.cssText =
      'text-align:left;padding:8px;background:#2c2c2c;color:#b0b0b0;border-bottom:2px solid #dc143c'
    head.appendChild(cell)
  }
  const body = table.createTBody()
  for (const [index, row] of model.rows.entries()) {
    const line = body.insertRow()
    for (const text of row) {
      const cell = line.insertCell()
      cell.textContent = text
      cell.style.cssText =
        'padding:8px;border-bottom:1px solid #404040;background:' +
        (index % 2 ? '#252525' : '#1f1f1f')
    }
  }
  host.appendChild(title)
  host.appendChild(sub)
  host.appendChild(table)
  document.body.appendChild(host)
  try {
    const url = await toJpeg(host, { quality: 0.92, pixelRatio: 2, backgroundColor: '#000' })
    return await (await fetch(url)).blob()
  } finally {
    host.remove()
  }
}
