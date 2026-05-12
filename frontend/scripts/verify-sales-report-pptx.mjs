// PPT 렌더 검증용 일회성 스크립트.
// 더미 데이터로 pptxgenjs 가 정상적으로 슬라이드를 생성하는지만 확인.

import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import PptxGenJS from 'pptxgenjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
const slide = pptx.addSlide()
slide.addText('Smoke test slide', { x: 1, y: 1, w: 5, h: 0.5, fontSize: 20 })

slide.addTable(
  [
    [{ text: 'A' }, { text: 'B' }],
    [{ text: '1' }, { text: '2' }],
  ],
  { x: 1, y: 2, w: 5, fontSize: 12 },
)

slide.addChart(
  'bar',
  [{ name: 'sample', labels: ['2026-01', '2026-02'], values: [10, 20] }],
  { x: 1, y: 4, w: 5, h: 3 },
)

const buf = await pptx.write({ outputType: 'nodebuffer' })
const out = resolve(__dirname, '../pptx-smoke.pptx')
writeFileSync(out, buf)
console.warn(`wrote ${out} (${buf.length} bytes)`)
