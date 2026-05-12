// 매출 분석 "경영 리포트" 워드 다운로드.
//
// 템플릿: public/templates/sales-management-report.docx (scripts/build-sales-report-template.mjs 로 생성)
// 런타임: 동적 import 로 pizzip + docxtemplater 를 로드 → placeholder 치환 → Blob 반환.
//
// SalesAnalysisPage 의 "경영 리포트" 버튼에서만 호출되므로, docxtemplater 청크는
// 해당 페이지 진입 후 첫 다운로드 클릭 시점에만 로드된다.

import { detectTenantScope, type TenantScope } from '@/lib/tenantScope'

const TEMPLATE_URL = '/templates/sales-management-report.docx'

const COMPANY_NAMES: Record<TenantScope, string> = {
  topsolar: '탑솔라(주)',
  cable: '케이블(주)',
  baro: '바로(주)',
  study: 'SolarFlow Study',
}

export interface SalesReportInput {
  periodLabel: string
  costBasis: 'fifo' | 'landed' | 'cif'
  alternativeCostLabel: string
  salesSummary: {
    supply: number
    count: number
    issued: number
    pending: number
  }
  margin: {
    calculatedKrw: number
    calculatedRate: number
  }
  adjusted: {
    margin: number
    marginRate: number
  }
  costCoverageRate: number
  costMissingRevenue: number
  customers: {
    outstandingKrw: number
    outstandingCount: number
  }
  monthly: Array<{
    month: string
    revenue: number
    count: number
    issued: number
    pending: number
    margin: number
    marginRate: number
    costCoverageRate: number
    avgSaleWp: number
    avgCostWp: number
  }>
  bridge: Array<{
    label: string
    pp: number
    valueKrw: number
    detail: string
  }>
  alternativeRows: Array<{
    productCode: string
    manufacturerName: string
    missingRevenue: number
    altCostWp: number
    altCostKrw: number
    adjustedMarginRate: number
    reason?: string
  }>
}

const krw = new Intl.NumberFormat('ko-KR')

function fmtKrw(n: number): string {
  return `${krw.format(Math.round(n))}원`
}

function fmtInt(n: number): string {
  return krw.format(Math.round(n))
}

function fmtPct(rate: number): string {
  return `${rate.toFixed(1)}%`
}

function fmtPp(pp: number): string {
  const sign = pp > 0 ? '+' : ''
  return `${sign}${pp.toFixed(2)}p`
}

function fmtWp(n: number): string {
  return n.toFixed(1)
}

function fmtCostBasis(basis: SalesReportInput['costBasis']): string {
  return { fifo: 'FIFO', landed: 'LANDED', cif: 'CIF' }[basis]
}

function fmtDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface TemplateData {
  companyName: string
  periodLabel: string
  generatedAt: string
  costBasis: string
  alternativeCostLabel: string
  summary: {
    supply: string
    count: string
    issued: string
    pending: string
    calculatedMargin: string
    calculatedMarginRate: string
    adjustedMargin: string
    adjustedMarginRate: string
    costCoverageRate: string
    costMissingRevenue: string
    outstanding: string
    outstandingCount: string
  }
  monthly: Array<Record<string, string>>
  bridge: Array<Record<string, string>>
  alternativeRows: Array<Record<string, string>>
}

function buildTemplateData(input: SalesReportInput): TemplateData {
  const tenant = detectTenantScope()
  return {
    companyName: COMPANY_NAMES[tenant],
    periodLabel: input.periodLabel,
    generatedAt: fmtDateTime(new Date()),
    costBasis: fmtCostBasis(input.costBasis),
    alternativeCostLabel: input.alternativeCostLabel,
    summary: {
      supply: fmtKrw(input.salesSummary.supply),
      count: `${fmtInt(input.salesSummary.count)}건`,
      issued: fmtInt(input.salesSummary.issued),
      pending: fmtInt(input.salesSummary.pending),
      calculatedMargin: fmtKrw(input.margin.calculatedKrw),
      calculatedMarginRate: fmtPct(input.margin.calculatedRate),
      adjustedMargin: fmtKrw(input.adjusted.margin),
      adjustedMarginRate: fmtPct(input.adjusted.marginRate),
      costCoverageRate: fmtPct(input.costCoverageRate),
      costMissingRevenue: fmtKrw(input.costMissingRevenue),
      outstanding: fmtKrw(input.customers.outstandingKrw),
      outstandingCount: fmtInt(input.customers.outstandingCount),
    },
    monthly: input.monthly.map((row) => ({
      month: row.month,
      revenue: fmtKrw(row.revenue),
      count: fmtInt(row.count),
      issued: fmtInt(row.issued),
      pending: fmtInt(row.pending),
      margin: fmtKrw(row.margin),
      marginRate: fmtPct(row.marginRate),
      costCoverageRate: fmtPct(row.costCoverageRate),
      avgSaleWp: fmtWp(row.avgSaleWp),
      avgCostWp: fmtWp(row.avgCostWp),
    })),
    bridge: input.bridge.map((row) => ({
      label: row.label,
      pp: fmtPp(row.pp),
      valueKrw: fmtKrw(row.valueKrw),
      detail: row.detail,
    })),
    alternativeRows: input.alternativeRows.slice(0, 20).map((row) => ({
      productCode: row.productCode,
      manufacturerName: row.manufacturerName,
      missingRevenue: fmtKrw(row.missingRevenue),
      altCostWp: fmtWp(row.altCostWp),
      altCostKrw: fmtKrw(row.altCostKrw),
      adjustedMarginRate: fmtPct(row.adjustedMarginRate),
      reason: row.reason ?? '',
    })),
  }
}

export async function renderSalesManagementReport(input: SalesReportInput): Promise<Blob> {
  const [{ default: PizZip }, { default: Docxtemplater }, templateResponse] = await Promise.all([
    import('pizzip'),
    import('docxtemplater'),
    fetch(TEMPLATE_URL),
  ])
  if (!templateResponse.ok) {
    throw new Error(`템플릿 로드 실패: ${templateResponse.status}`)
  }
  const zip = new PizZip(await templateResponse.arrayBuffer())
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  })
  doc.render(buildTemplateData(input))
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  })
}

export async function downloadSalesManagementReport(
  input: SalesReportInput,
  filename: string,
): Promise<void> {
  const blob = await renderSalesManagementReport(input)
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
