// 템플릿 렌더 검증용 일회성 스크립트.
// public/templates/sales-management-report.docx 를 더미 데이터로 채워서
// /tmp/sales-report-sample.docx 로 저장 → 모든 placeholder 가 치환됐는지 확인.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

const __dirname = dirname(fileURLToPath(import.meta.url))
const templatePath = resolve(__dirname, '../public/templates/sales-management-report.docx')

const data = {
  companyName: '탑솔라(주)',
  periodLabel: '2026-01-01~2026-05-12',
  generatedAt: '2026-05-12 14:45',
  costBasis: 'FIFO',
  alternativeCostLabel: '제조사 평균',
  summary: {
    supply: '12,345,678,000원',
    total: '13,580,245,800원',
    count: '482건',
    issued: '410',
    pending: '72',
    calculatedMargin: '2,468,900,000원',
    calculatedMarginRate: '20.0%',
    adjustedMargin: '2,355,200,000원',
    adjustedMarginRate: '19.1%',
    costCoverageRate: '92.3%',
    costMissingRevenue: '950,000,000원',
    outstanding: '1,250,000,000원',
    outstandingCount: '34',
  },
  monthly: [
    { month: '2026-01', revenue: '2,100,000,000원', total: '2,310,000,000원', count: '90', issued: '80', pending: '10', margin: '420,000,000원', marginRate: '20.0%', costCoverageRate: '95.0%', avgSaleWp: '380.2', avgCostWp: '304.5' },
    { month: '2026-02', revenue: '2,450,000,000원', total: '2,695,000,000원', count: '100', issued: '88', pending: '12', margin: '490,000,000원', marginRate: '20.0%', costCoverageRate: '93.0%', avgSaleWp: '379.8', avgCostWp: '304.0' },
    { month: '2026-03', revenue: '2,800,000,000원', total: '3,080,000,000원', count: '105', issued: '92', pending: '13', margin: '532,000,000원', marginRate: '19.0%', costCoverageRate: '90.0%', avgSaleWp: '378.5', avgCostWp: '306.9' },
  ],
  bridge: [
    { label: '판매단가 상승', pp: '+0.80p', valueKrw: '95,000,000원', detail: 'Avg sale Wp 378.5 → 381.6' },
    { label: '원가 상승', pp: '-1.50p', valueKrw: '-180,000,000원', detail: 'Avg cost Wp 304.0 → 309.6' },
    { label: '믹스 효과', pp: '+0.20p', valueKrw: '24,000,000원', detail: '고마진 품목 비중 증가' },
  ],
  alternativeRows: [
    { productCode: 'JKM610M-72HL4', manufacturerName: '진코솔라', missingRevenue: '320,000,000원', altCostWp: '305.0', altCostKrw: '230,000,000원', adjustedMarginRate: '18.5%', reason: 'FIFO 매칭 없음' },
    { productCode: 'TSM-590NEG21C', manufacturerName: '트리나솔라', missingRevenue: '180,000,000원', altCostWp: '301.5', altCostKrw: '128,000,000원', adjustedMarginRate: '19.2%', reason: 'Landed 원가 미확정' },
  ],
}

const zip = new PizZip(readFileSync(templatePath))
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
doc.render(data)

const out = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
const outPath = resolve(__dirname, '../sales-report-sample.docx')
writeFileSync(outPath, out)

// document.xml 에 placeholder 가 남아있지 않은지 (= 모두 치환됐는지) 검증
const renderedZip = new PizZip(out)
const xml = renderedZip.file('word/document.xml').asText()
const leftovers = xml.match(/\{[^}]+\}/g) ?? []
const realPlaceholders = leftovers.filter((t) => !t.includes(' ') && !t.includes('=') && !t.includes('"'))
console.warn(`wrote ${outPath} (${out.length} bytes)`)
console.warn(`expanded monthly rows: ${(xml.match(/2026-0[1-3]<\/w:t>/g) ?? []).length}`)
console.warn(`expanded bridge rows: ${(xml.match(/판매단가 상승|원가 상승|믹스 효과/g) ?? []).length}`)
console.warn(`expanded alt rows: ${(xml.match(/JKM610M-72HL4|TSM-590NEG21C/g) ?? []).length}`)
console.warn(`unfilled placeholders: ${realPlaceholders.length}`)
if (realPlaceholders.length > 0) {
  console.warn('LEFTOVER:', realPlaceholders.slice(0, 10))
  process.exit(1)
}
