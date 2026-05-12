// 매출 분석 "경영 리포트" PowerPoint 다운로드.
//
// pptxgenjs 는 런타임에 슬라이드를 직접 그리는 라이브러리라 워드처럼 외부 템플릿
// 파일을 두지 않고, 이 모듈에서 슬라이드 디자인을 직접 정의한다.
// 동적 import 로 청크 분리 — 매출 분석 페이지의 PPT 버튼 클릭 시점에만 로드.

import { detectTenantScope, type TenantScope } from '@/lib/tenantScope'
import type { SalesReportInput } from './salesManagementReport'

const COMPANY_NAMES: Record<TenantScope, string> = {
  topsolar: '탑솔라(주)',
  cable: '케이블(주)',
  baro: '바로(주)',
  study: 'SolarFlow Study',
}

const COLOR = {
  ink: '0F172A',
  sub: '475569',
  rule: 'CBD5E1',
  headBg: 'EEF2F6',
  zebraBg: 'F8FAFC',
  accent: '2563EB',
  green: '16A34A',
  red: 'DC2626',
  amber: 'D97706',
}

const krw = new Intl.NumberFormat('ko-KR')

function fmtKrw(n: number): string {
  return `${krw.format(Math.round(n))}원`
}

function fmtKrwShort(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}억`
  if (abs >= 1e4) return `${(n / 1e4).toFixed(0)}만`
  return krw.format(Math.round(n))
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

export async function renderSalesManagementPptx(input: SalesReportInput): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 13.33 × 7.5 inch
  pptx.title = '매출·이익 경영 리포트'
  pptx.company = COMPANY_NAMES[detectTenantScope()]

  const companyName = pptx.company
  const generatedAt = fmtDateTime(new Date())
  const W = 13.33
  const H = 7.5

  // 공통 마스터 슬라이드 — 머리말/꼬리말
  pptx.defineSlideMaster({
    title: 'BASE',
    background: { color: 'FFFFFF' },
    objects: [
      {
        text: {
          text: `SolarFlow 3.0  ·  ${companyName}`,
          options: { x: 0.4, y: 0.2, w: 8, h: 0.3, fontSize: 9, color: COLOR.sub, fontFace: '맑은 고딕' },
        },
      },
      {
        text: {
          text: input.periodLabel,
          options: { x: W - 4.4, y: 0.2, w: 4, h: 0.3, fontSize: 9, color: COLOR.sub, align: 'right', fontFace: '맑은 고딕' },
        },
      },
      {
        line: {
          x: 0.4,
          y: 0.55,
          w: W - 0.8,
          h: 0,
          line: { color: COLOR.rule, width: 0.5 },
        },
      },
    ],
    slideNumber: { x: W - 0.6, y: H - 0.35, w: 0.4, h: 0.25, fontSize: 9, color: COLOR.sub, align: 'right', fontFace: '맑은 고딕' },
  })

  // --- Slide 1: Cover ----------------------------------------------------

  const cover = pptx.addSlide({ masterName: 'BASE' })
  cover.addText(companyName, {
    x: 0.4,
    y: 0.9,
    w: W - 0.8,
    h: 0.4,
    fontSize: 14,
    color: COLOR.sub,
    fontFace: '맑은 고딕',
  })
  cover.addText('매출·이익 경영 리포트', {
    x: 0.4,
    y: 2.4,
    w: W - 0.8,
    h: 1.2,
    fontSize: 44,
    bold: true,
    color: COLOR.ink,
    fontFace: '맑은 고딕',
  })
  cover.addText(`기간 ${input.periodLabel}`, {
    x: 0.4,
    y: 3.7,
    w: W - 0.8,
    h: 0.5,
    fontSize: 20,
    color: COLOR.ink,
    fontFace: '맑은 고딕',
  })
  cover.addText(
    [
      { text: '원가 기준 ', options: { color: COLOR.sub } },
      { text: fmtCostBasis(input.costBasis), options: { bold: true, color: COLOR.ink } },
      { text: '   ·   대체원가 ', options: { color: COLOR.sub } },
      { text: input.alternativeCostLabel, options: { bold: true, color: COLOR.ink } },
    ],
    { x: 0.4, y: 5.8, w: W - 0.8, h: 0.4, fontSize: 14, fontFace: '맑은 고딕' },
  )
  cover.addText(`작성일 ${generatedAt}`, {
    x: 0.4,
    y: 6.4,
    w: W - 0.8,
    h: 0.3,
    fontSize: 12,
    color: COLOR.sub,
    fontFace: '맑은 고딕',
  })

  // --- Slide 2: KPI Summary ----------------------------------------------

  const kpi = pptx.addSlide({ masterName: 'BASE' })
  kpi.addText('핵심 요약', {
    x: 0.4,
    y: 0.7,
    w: W - 0.8,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: COLOR.ink,
    fontFace: '맑은 고딕',
  })

  const kpiCards: Array<{ label: string; value: string; sub?: string; tone?: string }> = [
    {
      label: '공급가 매출',
      value: fmtKrwShort(input.salesSummary.supply),
      sub: `${fmtInt(input.salesSummary.count)}건 (발행 ${fmtInt(input.salesSummary.issued)} · 미발행 ${fmtInt(input.salesSummary.pending)})`,
    },
    {
      label: '잠정 이익',
      value: fmtKrwShort(input.adjusted.margin),
      sub: `${fmtPct(input.adjusted.marginRate)} (계산 ${fmtPct(input.margin.calculatedRate)})`,
      tone: input.adjusted.marginRate >= 0 ? COLOR.green : COLOR.red,
    },
    {
      label: '원가 연결률',
      value: fmtPct(input.costCoverageRate),
      sub: `미연결 ${fmtKrwShort(input.costMissingRevenue)}`,
      tone: input.costCoverageRate >= 90 ? COLOR.green : input.costCoverageRate >= 70 ? COLOR.amber : COLOR.red,
    },
    {
      label: '미수금',
      value: fmtKrwShort(input.customers.outstandingKrw),
      sub: `${fmtInt(input.customers.outstandingCount)}개 거래처`,
      tone: COLOR.amber,
    },
  ]

  const cardW = 2.95
  const cardH = 1.8
  const cardGap = 0.2
  const cardTop = 1.5
  kpiCards.forEach((card, i) => {
    const x = 0.4 + i * (cardW + cardGap)
    kpi.addShape('rect', {
      x,
      y: cardTop,
      w: cardW,
      h: cardH,
      fill: { color: COLOR.zebraBg },
      line: { color: COLOR.rule, width: 0.5 },
    })
    kpi.addText(card.label, {
      x: x + 0.15,
      y: cardTop + 0.15,
      w: cardW - 0.3,
      h: 0.3,
      fontSize: 11,
      color: COLOR.sub,
      fontFace: '맑은 고딕',
    })
    kpi.addText(card.value, {
      x: x + 0.15,
      y: cardTop + 0.5,
      w: cardW - 0.3,
      h: 0.7,
      fontSize: 26,
      bold: true,
      color: card.tone ?? COLOR.ink,
      fontFace: '맑은 고딕',
    })
    if (card.sub) {
      kpi.addText(card.sub, {
        x: x + 0.15,
        y: cardTop + 1.25,
        w: cardW - 0.3,
        h: 0.45,
        fontSize: 10,
        color: COLOR.sub,
        fontFace: '맑은 고딕',
      })
    }
  })

  // 2단 표 — 계산 이익 / 잠정 이익 분해
  const detailY = cardTop + cardH + 0.4
  kpi.addTable(
    [
      [
        { text: '계산 이익', options: { bold: true, fill: { color: COLOR.headBg } } },
        { text: fmtKrw(input.margin.calculatedKrw), options: { align: 'right' } },
        { text: '계산 이익률', options: { bold: true, fill: { color: COLOR.headBg } } },
        { text: fmtPct(input.margin.calculatedRate), options: { align: 'right' } },
      ],
      [
        { text: '잠정 이익', options: { bold: true, fill: { color: COLOR.headBg } } },
        { text: fmtKrw(input.adjusted.margin), options: { align: 'right' } },
        { text: '잠정 이익률', options: { bold: true, fill: { color: COLOR.headBg } } },
        { text: fmtPct(input.adjusted.marginRate), options: { align: 'right' } },
      ],
      [
        { text: '원가 미연결 매출', options: { bold: true, fill: { color: COLOR.headBg } } },
        { text: fmtKrw(input.costMissingRevenue), options: { align: 'right' } },
        { text: '부가세 포함 매출', options: { bold: true, fill: { color: COLOR.headBg } } },
        { text: fmtKrw(input.salesSummary.total), options: { align: 'right' } },
      ],
    ],
    {
      x: 0.4,
      y: detailY,
      w: W - 0.8,
      colW: [2.2, 4.2, 2.2, 4.07],
      fontSize: 11,
      fontFace: '맑은 고딕',
      color: COLOR.ink,
      border: { type: 'solid', color: COLOR.rule, pt: 0.5 },
    },
  )

  // --- Slide 3: 월별 매출/이익 + 차트 ------------------------------------

  const monthly = pptx.addSlide({ masterName: 'BASE' })
  monthly.addText('월별 매출 / 이익', {
    x: 0.4,
    y: 0.7,
    w: W - 0.8,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: COLOR.ink,
    fontFace: '맑은 고딕',
  })

  if (input.monthly.length > 0) {
    const months = input.monthly.map((r) => r.month)
    const revenueSeries = input.monthly.map((r) => r.revenue / 1e8) // 억 단위
    const marginRateSeries = input.monthly.map((r) => r.marginRate)

    monthly.addChart(
      'bar',
      [
        {
          name: '공급가 매출 (억원)',
          labels: months,
          values: revenueSeries,
        },
      ],
      {
        x: 0.4,
        y: 1.4,
        w: 6.3,
        h: 5.5,
        barDir: 'col',
        chartColors: [COLOR.accent],
        showLegend: false,
        showTitle: true,
        title: '월별 공급가 매출 (억원)',
        titleFontSize: 12,
        titleColor: COLOR.sub,
        catAxisLabelFontSize: 10,
        valAxisLabelFontSize: 10,
        dataLabelFontSize: 9,
        showValue: true,
        dataLabelFormatCode: '0.0',
      },
    )

    monthly.addChart(
      'line',
      [
        {
          name: '잠정 이익률 (%)',
          labels: months,
          values: marginRateSeries,
        },
      ],
      {
        x: 6.9,
        y: 1.4,
        w: 6.0,
        h: 5.5,
        chartColors: [COLOR.green],
        showLegend: false,
        showTitle: true,
        title: '월별 잠정 이익률 (%)',
        titleFontSize: 12,
        titleColor: COLOR.sub,
        catAxisLabelFontSize: 10,
        valAxisLabelFontSize: 10,
        dataLabelFontSize: 9,
        lineDataSymbol: 'circle',
        lineDataSymbolSize: 6,
        showValue: true,
        dataLabelFormatCode: '0.0',
      },
    )
  } else {
    monthly.addText('표시할 월별 데이터가 없습니다.', {
      x: 0.4,
      y: 1.5,
      w: W - 0.8,
      h: 0.5,
      fontSize: 14,
      color: COLOR.sub,
      fontFace: '맑은 고딕',
    })
  }

  // --- Slide 4: 월별 상세 표 ---------------------------------------------

  const monthlyTable = pptx.addSlide({ masterName: 'BASE' })
  monthlyTable.addText('월별 매출 / 이익 상세', {
    x: 0.4,
    y: 0.7,
    w: W - 0.8,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: COLOR.ink,
    fontFace: '맑은 고딕',
  })

  const monthlyHeader = [
    { text: '월', options: { bold: true, fill: { color: COLOR.headBg } } },
    { text: '공급가', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '부가세포함', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '매출건수', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '발행', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '미발행', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '잠정이익', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '이익률', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '연결률', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '판매가/Wp', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '원가/Wp', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
  ]
  const monthlyRows = input.monthly.map((row) => [
    { text: row.month },
    { text: fmtKrwShort(row.revenue), options: { align: 'right' as const } },
    { text: fmtKrwShort(row.total), options: { align: 'right' as const } },
    { text: fmtInt(row.count), options: { align: 'right' as const } },
    { text: fmtInt(row.issued), options: { align: 'right' as const } },
    { text: fmtInt(row.pending), options: { align: 'right' as const } },
    { text: fmtKrwShort(row.margin), options: { align: 'right' as const } },
    { text: fmtPct(row.marginRate), options: { align: 'right' as const } },
    { text: fmtPct(row.costCoverageRate), options: { align: 'right' as const } },
    { text: fmtWp(row.avgSaleWp), options: { align: 'right' as const } },
    { text: fmtWp(row.avgCostWp), options: { align: 'right' as const } },
  ])
  monthlyTable.addTable([monthlyHeader, ...monthlyRows], {
    x: 0.4,
    y: 1.4,
    w: W - 0.8,
    fontSize: 10,
    fontFace: '맑은 고딕',
    color: COLOR.ink,
    border: { type: 'solid', color: COLOR.rule, pt: 0.5 },
    autoPage: false,
  })

  // --- Slide 5: 이익률 변동 브리지 ---------------------------------------

  const bridge = pptx.addSlide({ masterName: 'BASE' })
  bridge.addText('이익률 변동 브리지', {
    x: 0.4,
    y: 0.7,
    w: W - 0.8,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: COLOR.ink,
    fontFace: '맑은 고딕',
  })
  bridge.addText('전월 대비 잠정 이익률 변동을 요인별로 분해합니다.', {
    x: 0.4,
    y: 1.2,
    w: W - 0.8,
    h: 0.3,
    fontSize: 11,
    color: COLOR.sub,
    fontFace: '맑은 고딕',
  })

  const bridgeHeader = [
    { text: '요인', options: { bold: true, fill: { color: COLOR.headBg } } },
    { text: 'p.p.', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '영향금액', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '근거', options: { bold: true, fill: { color: COLOR.headBg } } },
  ]
  const bridgeRows = input.bridge.map((row) => [
    { text: row.label },
    {
      text: fmtPp(row.pp),
      options: {
        align: 'right' as const,
        color: row.pp > 0 ? COLOR.green : row.pp < 0 ? COLOR.red : COLOR.ink,
        bold: true,
      },
    },
    {
      text: fmtKrw(row.valueKrw),
      options: {
        align: 'right' as const,
        color: row.valueKrw > 0 ? COLOR.green : row.valueKrw < 0 ? COLOR.red : COLOR.ink,
      },
    },
    { text: row.detail },
  ])
  bridge.addTable(
    [bridgeHeader, ...(bridgeRows.length > 0 ? bridgeRows : [[{ text: '비교할 전월 데이터가 없습니다.', options: { colspan: 4, color: COLOR.sub } }]])],
    {
      x: 0.4,
      y: 1.7,
      w: W - 0.8,
      colW: [3, 1.4, 2.6, W - 0.8 - 7],
      fontSize: 11,
      fontFace: '맑은 고딕',
      color: COLOR.ink,
      border: { type: 'solid', color: COLOR.rule, pt: 0.5 },
    },
  )

  // --- Slide 6: 대체원가 보정 품목 Top 10 --------------------------------

  const alt = pptx.addSlide({ masterName: 'BASE' })
  alt.addText('대체원가 보정 품목 Top 10', {
    x: 0.4,
    y: 0.7,
    w: W - 0.8,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: COLOR.ink,
    fontFace: '맑은 고딕',
  })
  alt.addText(
    `원가가 연결되지 않은 매출에 ${input.alternativeCostLabel} 기준으로 가상 원가를 적용한 잠정 이익률입니다.`,
    {
      x: 0.4,
      y: 1.2,
      w: W - 0.8,
      h: 0.3,
      fontSize: 11,
      color: COLOR.sub,
      fontFace: '맑은 고딕',
    },
  )

  const altHeader = [
    { text: '품번', options: { bold: true, fill: { color: COLOR.headBg } } },
    { text: '제조사', options: { bold: true, fill: { color: COLOR.headBg } } },
    { text: '미연결매출', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '대체원가/Wp', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '보정원가', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '잠정이익률', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '사유', options: { bold: true, fill: { color: COLOR.headBg } } },
  ]
  const altRows = input.alternativeRows.slice(0, 10).map((row) => [
    { text: row.productCode },
    { text: row.manufacturerName },
    { text: fmtKrw(row.missingRevenue), options: { align: 'right' as const } },
    { text: fmtWp(row.altCostWp), options: { align: 'right' as const } },
    { text: fmtKrw(row.altCostKrw), options: { align: 'right' as const } },
    { text: fmtPct(row.adjustedMarginRate), options: { align: 'right' as const } },
    { text: row.reason ?? '' },
  ])
  alt.addTable(
    [altHeader, ...(altRows.length > 0 ? altRows : [[{ text: '미연결 매출이 없습니다.', options: { colspan: 7, color: COLOR.sub } }]])],
    {
      x: 0.4,
      y: 1.7,
      w: W - 0.8,
      colW: [1.8, 2.0, 2.0, 1.6, 2.0, 1.4, W - 0.8 - 10.8],
      fontSize: 10,
      fontFace: '맑은 고딕',
      color: COLOR.ink,
      border: { type: 'solid', color: COLOR.rule, pt: 0.5 },
    },
  )

  const arrayBuffer = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
}

export async function downloadSalesManagementPptx(
  input: SalesReportInput,
  filename: string,
): Promise<void> {
  const blob = await renderSalesManagementPptx(input)
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
