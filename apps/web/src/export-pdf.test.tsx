import { expect, it } from 'vitest'
import { buildResultsPdf } from './export-pdf.ts'

it('ww-254l: a long table spans several pages and every page is numbered "n / total"', async () => {
  const rows = Array.from({ length: 140 }, (_, index) => [
    String(index + 1),
    'Lifter ' + (index + 1),
    '100',
  ])
  const doc = await buildResultsPdf(
    [{ title: 'Open', columns: ['Place', 'Name', 'Result'], rows }],
    {
      subtitle: 'Contest',
      generatedAt: 'Generated',
      fonts: 'builtin',
    },
  )
  const pages = doc.getNumberOfPages()
  expect(pages).toBeGreaterThan(2)
  const footers = Object.values(doc.internal.pages)
    .flatMap((content) => (Array.isArray(content) ? content : []))
    .map((line) => /\((\d+) \/ (\d+)\) Tj/.exec(String(line)))
    .flatMap((match) => (match ? [[Number(match[1]), Number(match[2])] as const] : []))
  expect(footers.map(([page]) => page)).toEqual(
    Array.from({ length: pages }, (_, index) => index + 1),
  )
  expect(new Set(footers.map(([, total]) => total))).toEqual(new Set([pages]))
})

it('ww-254l: two classifications start on separate pages', async () => {
  const doc = await buildResultsPdf(
    [
      { title: 'A', columns: ['x'], rows: [['1']] },
      { title: 'B', columns: ['x'], rows: [['1']] },
    ],
    { subtitle: '', generatedAt: '', fonts: 'builtin' },
  )
  expect(doc.getNumberOfPages()).toBe(2)
})
