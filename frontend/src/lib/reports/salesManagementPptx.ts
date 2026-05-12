// 매출 분석 "경영 리포트" PowerPoint 다운로드.
//
// pptxgenjs 는 런타임에 슬라이드를 직접 그리는 라이브러리라 워드처럼 외부 템플릿
// 파일을 두지 않고, 이 모듈에서 슬라이드 디자인을 직접 정의한다.
// 동적 import 로 청크 분리 — 매출 분석 페이지의 PPT 버튼 클릭 시점에만 로드.

import { detectTenantScope, type TenantScope } from '@/lib/tenantScope'

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
  // 단면 (cross-section) — 시계열이 아닌 누적 기간 기준 Top N
  manufacturerBreakdown?: Array<{
    name: string
    revenue: number
    revenueShare: number // 0~100
    marginRate: number | null
    missingRate: number // 0~100, 매출 대비 원가 미연결률
  }>
  customerBreakdown?: Array<{
    name: string
    sales: number
    outstandingKrw: number
    marginRate: number | null
    status: 'normal' | 'warning' | 'overdue' | string
  }>
}

const COMPANY_NAMES: Record<TenantScope, string> = {
  topsolar: '탑솔라(주)',
  cable: '케이블(주)',
  baro: '바로(주)',
  study: 'SolarFlow Study',
}

const COLOR = {
  ink: '0F172A',
  sub: '475569',
  muted: '94A3B8',
  rule: 'CBD5E1',
  headBg: 'EEF2F6',
  zebraBg: 'F8FAFC',
  panelBg: 'F1F5F9',
  accent: '2563EB',
  accentSoft: 'DBEAFE',
  green: '16A34A',
  greenSoft: 'DCFCE7',
  red: 'DC2626',
  redSoft: 'FEE2E2',
  amber: 'D97706',
  amberSoft: 'FEF3C7',
}

const FONT = '맑은 고딕'

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

type Severity = 'good' | 'warn' | 'risk' | 'info'

function coverageTone(rate: number): Severity {
  if (rate >= 90) return 'good'
  if (rate >= 70) return 'warn'
  return 'risk'
}

function marginTone(rate: number): Severity {
  if (rate >= 15) return 'good'
  if (rate >= 5) return 'warn'
  if (rate >= 0) return 'info'
  return 'risk'
}

function severityColor(s: Severity): string {
  return { good: COLOR.green, warn: COLOR.amber, risk: COLOR.red, info: COLOR.ink }[s]
}

function severitySoftFill(s: Severity): string {
  return { good: COLOR.greenSoft, warn: COLOR.amberSoft, risk: COLOR.redSoft, info: COLOR.panelBg }[s]
}

interface SummaryNarrative {
  highlights: string[]
  concerns: string[]
}

function buildNarrative(input: SalesReportInput): SummaryNarrative {
  const highlights: string[] = []
  const concerns: string[] = []

  highlights.push(
    `기간 매출 ${fmtKrwShort(input.salesSummary.supply)} (${fmtInt(input.salesSummary.count)}건), 잠정 이익 ${fmtKrwShort(input.adjusted.margin)} · 잠정 이익률 ${fmtPct(input.adjusted.marginRate)}.`,
  )

  if (input.monthly.length >= 2) {
    const first = input.monthly[0]
    const last = input.monthly[input.monthly.length - 1]
    const revDelta = last.revenue - first.revenue
    const rateDelta = last.marginRate - first.marginRate
    highlights.push(
      `${first.month} → ${last.month}: 매출 ${revDelta >= 0 ? '↑' : '↓'} ${fmtKrwShort(Math.abs(revDelta))}, 이익률 ${rateDelta >= 0 ? '+' : ''}${rateDelta.toFixed(1)}p.`,
    )
  }

  const calcAdjGap = input.margin.calculatedRate - input.adjusted.marginRate
  if (calcAdjGap >= 0.5) {
    highlights.push(
      `계산 이익률 ${fmtPct(input.margin.calculatedRate)} → 잠정 ${fmtPct(input.adjusted.marginRate)} (${fmtPp(-calcAdjGap)}, ${input.alternativeCostLabel} 보정 영향).`,
    )
  }

  if (input.costCoverageRate < 90) {
    concerns.push(
      `원가 연결률 ${fmtPct(input.costCoverageRate)} — 미연결 매출 ${fmtKrwShort(input.costMissingRevenue)} (${fmtPct((input.costMissingRevenue / Math.max(input.salesSummary.supply, 1)) * 100)}).`,
    )
  }

  if (input.salesSummary.pending > 0) {
    const pendingShare = (input.salesSummary.pending / Math.max(input.salesSummary.count, 1)) * 100
    if (pendingShare >= 10) {
      concerns.push(
        `세금계산서 미발행 ${fmtInt(input.salesSummary.pending)}건 (${fmtPct(pendingShare)}) — 매출 인식 시점 확인 필요.`,
      )
    }
  }

  if (input.customers.outstandingKrw > 0) {
    concerns.push(
      `미수금 ${fmtKrwShort(input.customers.outstandingKrw)} / ${fmtInt(input.customers.outstandingCount)}개 거래처.`,
    )
  }

  const negativeMonths = input.monthly.filter((m) => m.marginRate < 0)
  if (negativeMonths.length > 0) {
    concerns.push(
      `이익률 마이너스 월 ${negativeMonths.length}개: ${negativeMonths.map((m) => m.month).join(', ')}.`,
    )
  }

  if (input.adjusted.marginRate < 5 && input.adjusted.marginRate >= 0) {
    concerns.push(`잠정 이익률 ${fmtPct(input.adjusted.marginRate)} — 단기 이익 모멘텀 약화 구간.`)
  } else if (input.adjusted.marginRate < 0) {
    concerns.push(`잠정 이익률 ${fmtPct(input.adjusted.marginRate)} — 손실 구간.`)
  }

  if (concerns.length === 0) {
    concerns.push('이번 기간 주요 경고 지표는 없습니다.')
  }

  return { highlights, concerns }
}

interface KpiCard {
  label: string
  value: string
  sub?: string
  tone: Severity
  delta?: { text: string; positive: boolean }
}

function buildKpiCards(input: SalesReportInput): KpiCard[] {
  const hasMoM = input.monthly.length >= 2
  const prev = hasMoM ? input.monthly[input.monthly.length - 2] : null
  const last = hasMoM ? input.monthly[input.monthly.length - 1] : null

  let revenueDelta: { text: string; positive: boolean } | undefined
  let marginRateDelta: { text: string; positive: boolean } | undefined
  let coverageDelta: { text: string; positive: boolean } | undefined
  if (prev && last) {
    const rev = last.revenue - prev.revenue
    revenueDelta = {
      text: `${rev >= 0 ? '▲' : '▼'} ${fmtKrwShort(Math.abs(rev))} M/M`,
      positive: rev >= 0,
    }
    const rate = last.marginRate - prev.marginRate
    marginRateDelta = { text: `${fmtPp(rate)} M/M`, positive: rate >= 0 }
    const cov = last.costCoverageRate - prev.costCoverageRate
    coverageDelta = { text: `${fmtPp(cov)} M/M`, positive: cov >= 0 }
  }

  return [
    {
      label: '공급가 매출',
      value: fmtKrwShort(input.salesSummary.supply),
      sub: `${fmtInt(input.salesSummary.count)}건 · 발행 ${fmtInt(input.salesSummary.issued)} / 미발행 ${fmtInt(input.salesSummary.pending)}`,
      tone: 'info',
      delta: revenueDelta,
    },
    {
      label: '잠정 이익률',
      value: fmtPct(input.adjusted.marginRate),
      sub: `잠정 이익 ${fmtKrwShort(input.adjusted.margin)} (계산 ${fmtPct(input.margin.calculatedRate)})`,
      tone: marginTone(input.adjusted.marginRate),
      delta: marginRateDelta,
    },
    {
      label: '원가 연결률',
      value: fmtPct(input.costCoverageRate),
      sub: `미연결 매출 ${fmtKrwShort(input.costMissingRevenue)}`,
      tone: coverageTone(input.costCoverageRate),
      delta: coverageDelta,
    },
    {
      label: '미수금',
      value: fmtKrwShort(input.customers.outstandingKrw),
      sub: `${fmtInt(input.customers.outstandingCount)}개 거래처`,
      tone: input.customers.outstandingKrw > 0 ? 'warn' : 'good',
    },
  ]
}

const W = 13.33
const H = 7.5

export async function renderSalesManagementPptx(input: SalesReportInput): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = '매출·이익 경영 리포트'
  pptx.company = COMPANY_NAMES[detectTenantScope()]

  const companyName = pptx.company
  const generatedAt = fmtDateTime(new Date())

  // 공통 마스터 — 상단 액센트 바 + 머리말/꼬리말
  pptx.defineSlideMaster({
    title: 'BASE',
    background: { color: 'FFFFFF' },
    objects: [
      {
        rect: {
          x: 0,
          y: 0,
          w: W,
          h: 0.12,
          fill: { color: COLOR.accent },
          line: { type: 'none' },
        },
      },
      {
        text: {
          text: `SolarFlow 3.0  ·  ${companyName}`,
          options: { x: 0.4, y: 0.22, w: 8, h: 0.3, fontSize: 9, color: COLOR.sub, fontFace: FONT },
        },
      },
      {
        text: {
          text: input.periodLabel,
          options: {
            x: W - 4.4,
            y: 0.22,
            w: 4,
            h: 0.3,
            fontSize: 9,
            color: COLOR.sub,
            align: 'right',
            fontFace: FONT,
          },
        },
      },
      {
        line: {
          x: 0.4,
          y: 0.6,
          w: W - 0.8,
          h: 0,
          line: { color: COLOR.rule, width: 0.5 },
        },
      },
    ],
    slideNumber: {
      x: W - 0.6,
      y: H - 0.35,
      w: 0.4,
      h: 0.25,
      fontSize: 9,
      color: COLOR.muted,
      align: 'right',
      fontFace: FONT,
    },
  })

  type Slide = ReturnType<typeof pptx.addSlide>
  const addSectionTitle = (slide: Slide, title: string, sub?: string): void => {
    slide.addShape('rect', {
      x: 0.4,
      y: 0.75,
      w: 0.15,
      h: 0.5,
      fill: { color: COLOR.accent },
      line: { type: 'none' },
    })
    slide.addText(title, {
      x: 0.65,
      y: 0.7,
      w: W - 1.05,
      h: 0.55,
      fontSize: 24,
      bold: true,
      color: COLOR.ink,
      fontFace: FONT,
      valign: 'middle',
    })
    if (sub) {
      slide.addText(sub, {
        x: 0.65,
        y: 1.28,
        w: W - 1.05,
        h: 0.3,
        fontSize: 11,
        color: COLOR.sub,
        fontFace: FONT,
      })
    }
  }

  // --- Slide 1: Cover ----------------------------------------------------

  const cover = pptx.addSlide({ masterName: 'BASE' })
  cover.addShape('rect', {
    x: 0,
    y: 0.12,
    w: 0.35,
    h: H - 0.12,
    fill: { color: COLOR.accent },
    line: { type: 'none' },
  })
  cover.addShape('rect', {
    x: 0.6,
    y: 2.1,
    w: 0.6,
    h: 0.08,
    fill: { color: COLOR.accent },
    line: { type: 'none' },
  })
  cover.addText(companyName, {
    x: 0.6,
    y: 1.5,
    w: W - 1,
    h: 0.5,
    fontSize: 16,
    color: COLOR.sub,
    fontFace: FONT,
  })
  cover.addText('매출·이익 경영 리포트', {
    x: 0.6,
    y: 2.3,
    w: W - 1,
    h: 1.4,
    fontSize: 52,
    bold: true,
    color: COLOR.ink,
    fontFace: FONT,
  })
  cover.addText(input.periodLabel, {
    x: 0.6,
    y: 3.8,
    w: W - 1,
    h: 0.6,
    fontSize: 24,
    color: COLOR.ink,
    fontFace: FONT,
  })

  // 메타 패널
  cover.addShape('rect', {
    x: 0.6,
    y: 5.4,
    w: 8.8,
    h: 1.2,
    fill: { color: COLOR.panelBg },
    line: { color: COLOR.rule, width: 0.5 },
  })
  cover.addText(
    [
      { text: '원가 기준', options: { color: COLOR.sub, fontSize: 11 } },
      { text: '\n', options: {} },
      { text: fmtCostBasis(input.costBasis), options: { bold: true, color: COLOR.ink, fontSize: 18 } },
    ],
    { x: 0.8, y: 5.55, w: 2.5, h: 0.95, fontFace: FONT, valign: 'middle' },
  )
  cover.addText(
    [
      { text: '대체원가', options: { color: COLOR.sub, fontSize: 11 } },
      { text: '\n', options: {} },
      { text: input.alternativeCostLabel, options: { bold: true, color: COLOR.ink, fontSize: 18 } },
    ],
    { x: 3.4, y: 5.55, w: 2.8, h: 0.95, fontFace: FONT, valign: 'middle' },
  )
  cover.addText(
    [
      { text: '작성', options: { color: COLOR.sub, fontSize: 11 } },
      { text: '\n', options: {} },
      { text: generatedAt, options: { bold: true, color: COLOR.ink, fontSize: 16 } },
    ],
    { x: 6.3, y: 5.55, w: 3, h: 0.95, fontFace: FONT, valign: 'middle' },
  )

  cover.addText('SolarFlow 3.0 · 자동 생성 경영 리포트', {
    x: 0.6,
    y: H - 0.6,
    w: W - 1,
    h: 0.3,
    fontSize: 10,
    color: COLOR.muted,
    fontFace: FONT,
  })

  // --- Slide 2: 경영 요약 (KPI + 자동 진단) ------------------------------

  const kpi = pptx.addSlide({ masterName: 'BASE' })
  addSectionTitle(
    kpi,
    '경영 요약',
    input.monthly.length >= 2
      ? 'KPI 우측 표기는 전월 대비 변동(M/M). 하단은 자동 진단 결과.'
      : '핵심 KPI와 자동 진단된 하이라이트 / 주의 항목.',
  )

  // 상단: KPI 카드 4개
  const kpiCards = buildKpiCards(input)
  const cardW = 2.95
  const cardH = 1.95
  const cardGap = 0.2
  const cardTop = 1.7
  kpiCards.forEach((card, i) => {
    const x = 0.4 + i * (cardW + cardGap)
    const tone = severityColor(card.tone)
    // 상단 액센트 바
    kpi.addShape('rect', {
      x,
      y: cardTop,
      w: cardW,
      h: 0.1,
      fill: { color: tone },
      line: { type: 'none' },
    })
    // 본체
    kpi.addShape('rect', {
      x,
      y: cardTop + 0.1,
      w: cardW,
      h: cardH - 0.1,
      fill: { color: COLOR.zebraBg },
      line: { color: COLOR.rule, width: 0.5 },
    })
    // 라벨
    kpi.addText(card.label, {
      x: x + 0.2,
      y: cardTop + 0.2,
      w: cardW - 0.4,
      h: 0.3,
      fontSize: 11,
      color: COLOR.sub,
      fontFace: FONT,
    })
    // 메인 값
    kpi.addText(card.value, {
      x: x + 0.2,
      y: cardTop + 0.55,
      w: cardW - 0.4,
      h: 0.75,
      fontSize: 28,
      bold: true,
      color: tone,
      fontFace: FONT,
    })
    // M/M 델타 — 메인 값 우측 동일 행 정렬용 작은 텍스트
    if (card.delta) {
      kpi.addText(card.delta.text, {
        x: x + 0.2,
        y: cardTop + 1.28,
        w: cardW - 0.4,
        h: 0.25,
        fontSize: 10,
        bold: true,
        color: card.delta.positive ? COLOR.green : COLOR.red,
        fontFace: FONT,
      })
    }
    // 보조 설명
    if (card.sub) {
      kpi.addText(card.sub, {
        x: x + 0.2,
        y: cardTop + 1.55,
        w: cardW - 0.4,
        h: 0.4,
        fontSize: 9.5,
        color: COLOR.sub,
        fontFace: FONT,
      })
    }
  })

  // 하단: 하이라이트 / 주의 패널
  const narrative = buildNarrative(input)
  const panelTop = cardTop + cardH + 0.3
  const panelH = H - 0.4 - panelTop
  const panelW = (W - 0.8 - 0.25) / 2

  // 하이라이트 패널 (왼쪽 액센트 바 + 본체)
  kpi.addShape('rect', {
    x: 0.4,
    y: panelTop,
    w: 0.12,
    h: panelH,
    fill: { color: COLOR.green },
    line: { type: 'none' },
  })
  kpi.addShape('rect', {
    x: 0.52,
    y: panelTop,
    w: panelW - 0.12,
    h: panelH,
    fill: { color: COLOR.greenSoft },
    line: { color: COLOR.green, width: 0.5 },
  })
  kpi.addText('하이라이트', {
    x: 0.72,
    y: panelTop + 0.1,
    w: panelW - 0.4,
    h: 0.32,
    fontSize: 12,
    bold: true,
    color: COLOR.green,
    fontFace: FONT,
  })
  kpi.addText(
    narrative.highlights.map((t) => ({
      text: t,
      options: { bullet: { code: '25CF' }, color: COLOR.ink, fontSize: 11, paraSpaceAfter: 6 },
    })),
    {
      x: 0.72,
      y: panelTop + 0.48,
      w: panelW - 0.4,
      h: panelH - 0.6,
      fontFace: FONT,
      valign: 'top',
    },
  )

  // 주의 패널
  const concernX = 0.4 + panelW + 0.25
  kpi.addShape('rect', {
    x: concernX,
    y: panelTop,
    w: 0.12,
    h: panelH,
    fill: { color: COLOR.amber },
    line: { type: 'none' },
  })
  kpi.addShape('rect', {
    x: concernX + 0.12,
    y: panelTop,
    w: panelW - 0.12,
    h: panelH,
    fill: { color: COLOR.amberSoft },
    line: { color: COLOR.amber, width: 0.5 },
  })
  kpi.addText('주의가 필요한 항목', {
    x: concernX + 0.32,
    y: panelTop + 0.1,
    w: panelW - 0.4,
    h: 0.32,
    fontSize: 12,
    bold: true,
    color: COLOR.amber,
    fontFace: FONT,
  })
  kpi.addText(
    narrative.concerns.map((t) => ({
      text: t,
      options: { bullet: { code: '25CF' }, color: COLOR.ink, fontSize: 11, paraSpaceAfter: 6 },
    })),
    {
      x: concernX + 0.32,
      y: panelTop + 0.48,
      w: panelW - 0.4,
      h: panelH - 0.6,
      fontFace: FONT,
      valign: 'top',
    },
  )

  // --- Slide 3: 매출·이익률 추이 (콤보차트) ------------------------------

  const trend = pptx.addSlide({ masterName: 'BASE' })
  addSectionTitle(trend, '매출 · 이익률 추이', '막대=공급가 매출(억원), 선=잠정 이익률(%)')

  if (input.monthly.length > 0) {
    const months = input.monthly.map((r) => r.month)
    // pptxgenjs multi-chart API 는 (types[], options) 2-인자.
    // d.ts 시그니처는 (type, data[], options?) 3-인자로 잘못 표기돼 있어 any 캐스트로 회피.
    ;(trend.addChart as (...args: unknown[]) => unknown)(
      [
        {
          type: 'bar',
          data: [
            {
              name: '공급가 매출 (억원)',
              labels: months,
              values: input.monthly.map((r) => Number((r.revenue / 1e8).toFixed(2))),
            },
          ],
          options: { barDir: 'col', chartColors: [COLOR.accent], barGapWidthPct: 60 },
        },
        {
          type: 'line',
          data: [
            {
              name: '잠정 이익률 (%)',
              labels: months,
              values: input.monthly.map((r) => Number(r.marginRate.toFixed(1))),
            },
          ],
          options: {
            chartColors: [COLOR.green],
            secondaryValAxis: true,
            secondaryCatAxis: true,
            lineDataSymbol: 'circle',
            lineDataSymbolSize: 8,
            lineSize: 2.5,
          },
        },
      ],
      {
        x: 0.4,
        y: 1.7,
        w: W - 0.8,
        h: 4.4,
        catAxisLabelFontSize: 10,
        valAxisLabelFontSize: 10,
        showLegend: true,
        legendPos: 'b',
        legendFontSize: 11,
        showValue: true,
        dataLabelFontSize: 9,
        dataLabelFormatCode: '0.0',
        valAxes: [
          {
            valAxisLabelFontSize: 10,
            valAxisTitle: '매출 (억원)',
            showValAxisTitle: true,
            valAxisTitleFontSize: 10,
            valAxisTitleColor: COLOR.sub,
            valGridLine: { style: 'solid', color: COLOR.rule, size: 0.5 },
          },
          {
            valAxisLabelFontSize: 10,
            valAxisTitle: '이익률 (%)',
            showValAxisTitle: true,
            valAxisTitleFontSize: 10,
            valAxisTitleColor: COLOR.sub,
            valGridLine: { style: 'none', size: 0, color: 'FFFFFF' },
          },
        ],
        catAxes: [{ catAxisLabelFontSize: 10 }, { catAxisHidden: true }],
      },
    )

    // 기간 요약 스트립 — 평균 / 최고·최저 월
    const avgRevenue = input.monthly.reduce((a, m) => a + m.revenue, 0) / input.monthly.length
    const avgMarginRate =
      input.monthly.reduce((a, m) => a + m.marginRate, 0) / input.monthly.length
    const peakRevenue = input.monthly.reduce((a, b) => (b.revenue > a.revenue ? b : a))
    const lowMargin = input.monthly.reduce((a, b) => (b.marginRate < a.marginRate ? b : a))
    const highMargin = input.monthly.reduce((a, b) => (b.marginRate > a.marginRate ? b : a))

    const stripY = 6.3
    const stripH = 0.85
    trend.addShape('rect', {
      x: 0.4,
      y: stripY,
      w: W - 0.8,
      h: stripH,
      fill: { color: COLOR.panelBg },
      line: { color: COLOR.rule, width: 0.5 },
    })

    const stats: Array<{ label: string; value: string; tone?: string }> = [
      { label: '평균 매출', value: fmtKrwShort(avgRevenue) },
      {
        label: '평균 이익률',
        value: fmtPct(avgMarginRate),
        tone: severityColor(marginTone(avgMarginRate)),
      },
      { label: '매출 최고월', value: `${peakRevenue.month}  ${fmtKrwShort(peakRevenue.revenue)}` },
      {
        label: '이익률 최고월',
        value: `${highMargin.month}  ${fmtPct(highMargin.marginRate)}`,
        tone: COLOR.green,
      },
      {
        label: '이익률 최저월',
        value: `${lowMargin.month}  ${fmtPct(lowMargin.marginRate)}`,
        tone: severityColor(marginTone(lowMargin.marginRate)),
      },
    ]
    const statW = (W - 0.8) / stats.length
    stats.forEach((s, i) => {
      const x = 0.4 + i * statW
      if (i > 0) {
        trend.addShape('line', {
          x,
          y: stripY + 0.15,
          w: 0,
          h: stripH - 0.3,
          line: { color: COLOR.rule, width: 0.5 },
        })
      }
      trend.addText(s.label, {
        x: x + 0.15,
        y: stripY + 0.1,
        w: statW - 0.3,
        h: 0.3,
        fontSize: 10,
        color: COLOR.sub,
        fontFace: FONT,
      })
      trend.addText(s.value, {
        x: x + 0.15,
        y: stripY + 0.4,
        w: statW - 0.3,
        h: 0.4,
        fontSize: 13,
        bold: true,
        color: s.tone ?? COLOR.ink,
        fontFace: FONT,
      })
    })
  } else {
    trend.addText('표시할 월별 데이터가 없습니다.', {
      x: 0.4,
      y: 2.0,
      w: W - 0.8,
      h: 0.5,
      fontSize: 14,
      color: COLOR.sub,
      fontFace: FONT,
    })
  }

  // --- Slide 4: 거래처 / 제조사 단면 (Top N) -----------------------------

  const cross = pptx.addSlide({ masterName: 'BASE' })
  addSectionTitle(
    cross,
    '거래처 · 제조사 단면',
    '기간 누적 기준 Top — 매출 집중도, 이익 기여, 미수 노출을 한 페이지로.',
  )

  const half = (W - 0.8 - 0.3) / 2
  const tableTop = 1.85

  // 왼쪽: 거래처 Top
  cross.addText('거래처 Top', {
    x: 0.4,
    y: tableTop - 0.4,
    w: half,
    h: 0.3,
    fontSize: 12,
    bold: true,
    color: COLOR.sub,
    fontFace: FONT,
  })
  const customers = input.customerBreakdown ?? []
  const totalCustSales = customers.reduce((a, c) => a + c.sales, 0) || 1
  const customerHeader = [
    { text: '거래처', options: { bold: true, fill: { color: COLOR.headBg } } },
    { text: '매출', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '비중', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '이익률', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '미수', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
  ]
  const customerRows = customers.slice(0, 10).map((c) => {
    const share = (c.sales / totalCustSales) * 100
    const statusColor =
      c.status === 'overdue' ? COLOR.red : c.status === 'warning' ? COLOR.amber : COLOR.ink
    return [
      { text: c.name, options: { color: statusColor } },
      { text: fmtKrwShort(c.sales), options: { align: 'right' as const } },
      { text: fmtPct(share), options: { align: 'right' as const, color: COLOR.sub } },
      {
        text: c.marginRate == null ? '-' : fmtPct(c.marginRate),
        options: {
          align: 'right' as const,
          color: c.marginRate == null ? COLOR.muted : severityColor(marginTone(c.marginRate)),
          bold: c.marginRate != null,
        },
      },
      {
        text: c.outstandingKrw > 0 ? fmtKrwShort(c.outstandingKrw) : '-',
        options: {
          align: 'right' as const,
          color: c.outstandingKrw > 0 ? COLOR.amber : COLOR.muted,
        },
      },
    ]
  })
  cross.addTable(
    [
      customerHeader,
      ...(customerRows.length > 0
        ? customerRows
        : [
            [
              {
                text: '표시할 거래처 데이터가 없습니다.',
                options: { colspan: 5, color: COLOR.sub, align: 'center' as const },
              },
            ],
          ]),
    ],
    {
      x: 0.4,
      y: tableTop,
      w: half,
      colW: [half - 4.6, 1.3, 0.9, 1.1, 1.3],
      fontSize: 10,
      fontFace: FONT,
      color: COLOR.ink,
      border: { type: 'solid', color: COLOR.rule, pt: 0.5 },
    },
  )

  // 오른쪽: 제조사 Top
  const rightX = 0.4 + half + 0.3
  cross.addText('제조사 Top', {
    x: rightX,
    y: tableTop - 0.4,
    w: half,
    h: 0.3,
    fontSize: 12,
    bold: true,
    color: COLOR.sub,
    fontFace: FONT,
  })
  const manus = input.manufacturerBreakdown ?? []
  const manuHeader = [
    { text: '제조사', options: { bold: true, fill: { color: COLOR.headBg } } },
    { text: '매출', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '비중', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '이익률', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
    { text: '미연결률', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
  ]
  const manuRows = manus.slice(0, 10).map((m) => [
    { text: m.name, options: {} },
    { text: fmtKrwShort(m.revenue), options: { align: 'right' as const } },
    { text: fmtPct(m.revenueShare), options: { align: 'right' as const, color: COLOR.sub } },
    {
      text: m.marginRate == null ? '-' : fmtPct(m.marginRate),
      options: {
        align: 'right' as const,
        color: m.marginRate == null ? COLOR.muted : severityColor(marginTone(m.marginRate)),
        bold: m.marginRate != null,
      },
    },
    {
      text: fmtPct(m.missingRate),
      options: {
        align: 'right' as const,
        color:
          m.missingRate >= 30 ? COLOR.red : m.missingRate >= 10 ? COLOR.amber : COLOR.sub,
      },
    },
  ])
  cross.addTable(
    [
      manuHeader,
      ...(manuRows.length > 0
        ? manuRows
        : [
            [
              {
                text: '표시할 제조사 데이터가 없습니다.',
                options: { colspan: 5, color: COLOR.sub, align: 'center' as const },
              },
            ],
          ]),
    ],
    {
      x: rightX,
      y: tableTop,
      w: half,
      colW: [half - 4.6, 1.3, 0.9, 1.1, 1.3],
      fontSize: 10,
      fontFace: FONT,
      color: COLOR.ink,
      border: { type: 'solid', color: COLOR.rule, pt: 0.5 },
    },
  )

  // 하단: 집중도 요약 스트립
  if (customers.length > 0 || manus.length > 0) {
    const stripY = 6.3
    const stripH = 0.85
    cross.addShape('rect', {
      x: 0.4,
      y: stripY,
      w: W - 0.8,
      h: stripH,
      fill: { color: COLOR.panelBg },
      line: { color: COLOR.rule, width: 0.5 },
    })

    const cumTop3Cust =
      customers.slice(0, 3).reduce((a, c) => a + c.sales, 0) / Math.max(totalCustSales, 1) * 100
    const totalManuRev = manus.reduce((a, m) => a + m.revenue, 0) || 1
    const cumTop3Manu =
      manus.slice(0, 3).reduce((a, m) => a + m.revenue, 0) / totalManuRev * 100
    const overdueCust = customers.filter((c) => c.status === 'overdue').length
    const warnCust = customers.filter((c) => c.status === 'warning').length

    const stats: Array<{ label: string; value: string; tone?: string }> = [
      {
        label: '거래처 Top3 비중',
        value: customers.length > 0 ? fmtPct(cumTop3Cust) : '-',
        tone: cumTop3Cust >= 60 ? COLOR.amber : COLOR.ink,
      },
      {
        label: '제조사 Top3 비중',
        value: manus.length > 0 ? fmtPct(cumTop3Manu) : '-',
        tone: cumTop3Manu >= 70 ? COLOR.amber : COLOR.ink,
      },
      {
        label: '연체 거래처',
        value: `${fmtInt(overdueCust)}개`,
        tone: overdueCust > 0 ? COLOR.red : COLOR.green,
      },
      {
        label: '주의 거래처',
        value: `${fmtInt(warnCust)}개`,
        tone: warnCust > 0 ? COLOR.amber : COLOR.green,
      },
    ]
    const statW = (W - 0.8) / stats.length
    stats.forEach((s, i) => {
      const x = 0.4 + i * statW
      if (i > 0) {
        cross.addShape('line', {
          x,
          y: stripY + 0.15,
          w: 0,
          h: stripH - 0.3,
          line: { color: COLOR.rule, width: 0.5 },
        })
      }
      cross.addText(s.label, {
        x: x + 0.15,
        y: stripY + 0.1,
        w: statW - 0.3,
        h: 0.3,
        fontSize: 10,
        color: COLOR.sub,
        fontFace: FONT,
      })
      cross.addText(s.value, {
        x: x + 0.15,
        y: stripY + 0.4,
        w: statW - 0.3,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: s.tone ?? COLOR.ink,
        fontFace: FONT,
      })
    })
  }

  // --- Slide 5: 월별 상세 표 ---------------------------------------------

  const monthlyTable = pptx.addSlide({ masterName: 'BASE' })
  addSectionTitle(monthlyTable, '월별 매출 / 이익 상세')

  const monthlyHeader = [
    { text: '월', options: { bold: true, fill: { color: COLOR.headBg } } },
    { text: '공급가', options: { bold: true, fill: { color: COLOR.headBg }, align: 'right' as const } },
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
    { text: row.month, options: {} },
    { text: fmtKrwShort(row.revenue), options: { align: 'right' as const } },
    { text: fmtInt(row.count), options: { align: 'right' as const } },
    { text: fmtInt(row.issued), options: { align: 'right' as const } },
    { text: fmtInt(row.pending), options: { align: 'right' as const } },
    { text: fmtKrwShort(row.margin), options: { align: 'right' as const } },
    {
      text: fmtPct(row.marginRate),
      options: { align: 'right' as const, bold: true, color: severityColor(marginTone(row.marginRate)) },
    },
    {
      text: fmtPct(row.costCoverageRate),
      options: { align: 'right' as const, color: severityColor(coverageTone(row.costCoverageRate)) },
    },
    { text: fmtWp(row.avgSaleWp), options: { align: 'right' as const } },
    { text: fmtWp(row.avgCostWp), options: { align: 'right' as const } },
  ])
  monthlyTable.addTable([monthlyHeader, ...monthlyRows], {
    x: 0.4,
    y: 1.8,
    w: W - 0.8,
    fontSize: 10,
    fontFace: FONT,
    color: COLOR.ink,
    border: { type: 'solid', color: COLOR.rule, pt: 0.5 },
    autoPage: false,
  })

  // --- Slide 6: 이익률 변동 브리지 (시각 바) -----------------------------

  const bridge = pptx.addSlide({ masterName: 'BASE' })
  addSectionTitle(bridge, '이익률 변동 브리지', '전월 대비 잠정 이익률 변동을 요인별로 분해합니다.')

  if (input.bridge.length > 0) {
    const maxAbsPp = Math.max(0.1, ...input.bridge.map((b) => Math.abs(b.pp)))
    const bridgeTop = 1.9
    const rowH = 0.55
    const labelW = 2.4
    const barAreaX = 3.0
    const barAreaW = 5.2
    const valueX = 8.4
    const detailX = 10.2

    // 헤더
    bridge.addText('요인', {
      x: 0.4,
      y: bridgeTop - 0.4,
      w: labelW,
      h: 0.3,
      fontSize: 11,
      bold: true,
      color: COLOR.sub,
      fontFace: FONT,
    })
    bridge.addText('p.p. 영향', {
      x: barAreaX,
      y: bridgeTop - 0.4,
      w: barAreaW,
      h: 0.3,
      fontSize: 11,
      bold: true,
      color: COLOR.sub,
      fontFace: FONT,
      align: 'center',
    })
    bridge.addText('영향금액', {
      x: valueX,
      y: bridgeTop - 0.4,
      w: 1.7,
      h: 0.3,
      fontSize: 11,
      bold: true,
      color: COLOR.sub,
      fontFace: FONT,
      align: 'right',
    })
    bridge.addText('근거', {
      x: detailX,
      y: bridgeTop - 0.4,
      w: W - 0.4 - detailX,
      h: 0.3,
      fontSize: 11,
      bold: true,
      color: COLOR.sub,
      fontFace: FONT,
    })

    // 중앙 0 축 라인
    const centerX = barAreaX + barAreaW / 2
    bridge.addShape('line', {
      x: centerX,
      y: bridgeTop,
      w: 0,
      h: input.bridge.length * rowH,
      line: { color: COLOR.muted, width: 0.75, dashType: 'dash' },
    })

    input.bridge.forEach((b, idx) => {
      const y = bridgeTop + idx * rowH
      const halfW = barAreaW / 2
      const barLen = (Math.abs(b.pp) / maxAbsPp) * halfW
      const color = b.pp >= 0 ? COLOR.green : COLOR.red

      // 라벨
      bridge.addText(b.label, {
        x: 0.4,
        y,
        w: labelW,
        h: rowH,
        fontSize: 11,
        color: COLOR.ink,
        fontFace: FONT,
        valign: 'middle',
      })

      // 시각 바 — 0 축 좌/우로 뻗는 막대
      if (barLen > 0) {
        bridge.addShape('rect', {
          x: b.pp >= 0 ? centerX : centerX - barLen,
          y: y + 0.12,
          w: barLen,
          h: rowH - 0.24,
          fill: { color },
          line: { type: 'none' },
        })
      }

      // p.p. 텍스트는 바 끝
      bridge.addText(fmtPp(b.pp), {
        x: b.pp >= 0 ? centerX + barLen + 0.05 : centerX - barLen - 0.85,
        y,
        w: 0.8,
        h: rowH,
        fontSize: 11,
        bold: true,
        color,
        fontFace: FONT,
        align: b.pp >= 0 ? 'left' : 'right',
        valign: 'middle',
      })

      // 영향금액
      bridge.addText(fmtKrw(b.valueKrw), {
        x: valueX,
        y,
        w: 1.7,
        h: rowH,
        fontSize: 11,
        color: b.valueKrw > 0 ? COLOR.green : b.valueKrw < 0 ? COLOR.red : COLOR.ink,
        fontFace: FONT,
        align: 'right',
        valign: 'middle',
      })

      // 근거
      bridge.addText(b.detail, {
        x: detailX,
        y,
        w: W - 0.4 - detailX,
        h: rowH,
        fontSize: 10,
        color: COLOR.sub,
        fontFace: FONT,
        valign: 'middle',
      })

      // 행 구분선
      if (idx < input.bridge.length - 1) {
        bridge.addShape('line', {
          x: 0.4,
          y: y + rowH,
          w: W - 0.8,
          h: 0,
          line: { color: COLOR.rule, width: 0.25 },
        })
      }
    })
  } else {
    bridge.addText('비교할 전월 데이터가 없습니다.', {
      x: 0.4,
      y: 2.0,
      w: W - 0.8,
      h: 0.5,
      fontSize: 13,
      color: COLOR.sub,
      fontFace: FONT,
    })
  }

  // --- Slide 7: 대체원가 보정 Top 10 + 자동 진단 액션 --------------------

  const alt = pptx.addSlide({ masterName: 'BASE' })
  addSectionTitle(
    alt,
    '대체원가 보정 품목 Top 10',
    `원가 미연결 매출에 ${input.alternativeCostLabel} 기준 가상 원가를 적용한 잠정 이익률입니다.`,
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
    { text: row.productCode, options: {} },
    { text: row.manufacturerName, options: {} },
    { text: fmtKrw(row.missingRevenue), options: { align: 'right' as const } },
    { text: fmtWp(row.altCostWp), options: { align: 'right' as const } },
    { text: fmtKrw(row.altCostKrw), options: { align: 'right' as const } },
    {
      text: fmtPct(row.adjustedMarginRate),
      options: { align: 'right' as const, bold: true, color: severityColor(marginTone(row.adjustedMarginRate)) },
    },
    { text: row.reason ?? '', options: { color: COLOR.sub } },
  ])
  alt.addTable(
    [
      altHeader,
      ...(altRows.length > 0
        ? altRows
        : [[{ text: '미연결 매출이 없습니다.', options: { colspan: 7, color: COLOR.sub, align: 'center' as const } }]]),
    ],
    {
      x: 0.4,
      y: 1.7,
      w: W - 0.8,
      colW: [1.8, 2.0, 2.0, 1.6, 2.0, 1.4, W - 0.8 - 10.8],
      fontSize: 10,
      fontFace: FONT,
      color: COLOR.ink,
      border: { type: 'solid', color: COLOR.rule, pt: 0.5 },
    },
  )

  // 하단: 자동 진단 액션 카드 (가장 시급한 Top 3)
  interface RiskItem {
    severity: Severity
    title: string
    action: string
  }
  const items: RiskItem[] = []

  if (input.costCoverageRate < 70) {
    items.push({
      severity: 'risk',
      title: `원가 연결률 ${fmtPct(input.costCoverageRate)} — 잠정 이익률 신뢰도 저하 (미연결 ${fmtKrwShort(input.costMissingRevenue)})`,
      action: 'FIFO 매칭 누락 점검 + Landed 원가 확정 일정 단축.',
    })
  } else if (input.costCoverageRate < 90) {
    items.push({
      severity: 'warn',
      title: `원가 연결률 ${fmtPct(input.costCoverageRate)} — 미연결 ${fmtKrwShort(input.costMissingRevenue)}, 대체원가(${input.alternativeCostLabel}) 보정 영향 유의`,
      action: '월말 마감 전 FIFO 재정렬 및 누락 BL 확인.',
    })
  }

  const negativeMonths = input.monthly.filter((m) => m.marginRate < 0)
  if (negativeMonths.length > 0) {
    items.push({
      severity: 'risk',
      title: `이익률 마이너스 ${negativeMonths.length}개월 (${negativeMonths.map((m) => m.month).join(', ')})`,
      action: '해당 월 거래 단위 마진 점검, 손실 거래처·품목 식별.',
    })
  }

  const lowMarginMonths = input.monthly.filter((m) => m.marginRate >= 0 && m.marginRate < 5)
  if (lowMarginMonths.length > 0 && negativeMonths.length === 0) {
    items.push({
      severity: 'warn',
      title: `저마진 ${lowMarginMonths.length}개월 (${lowMarginMonths.map((m) => m.month).join(', ')}, 5% 미만)`,
      action: '판가·원가 동시 모니터링, 비핵심 거래 정리 검토.',
    })
  }

  if (input.salesSummary.pending > 0) {
    const pendingShare = (input.salesSummary.pending / Math.max(input.salesSummary.count, 1)) * 100
    if (pendingShare >= 10) {
      items.push({
        severity: 'warn',
        title: `세금계산서 미발행 ${fmtInt(input.salesSummary.pending)}건 (${fmtPct(pendingShare)}) — 매출 인식 시점 분산 가능`,
        action: '월말 마감 전 미발행 건 일괄 발행, 회계 정산 일정 합의.',
      })
    }
  }

  const topAlt = input.alternativeRows.slice(0, 3)
  if (topAlt.length > 0 && items.length < 3) {
    items.push({
      severity: 'info',
      title: `원가 미연결 Top 품목: ${topAlt.map((r) => r.productCode).join(', ')}`,
      action: '해당 품목 BL/PO 매칭 우선 처리 → 잠정 이익률을 계산 이익률에 수렴.',
    })
  }

  const topItems = items.slice(0, 3)
  if (topItems.length > 0) {
    const actionTop = 5.55
    const actionH = 1.55
    alt.addText('자동 진단된 우선 액션', {
      x: 0.4,
      y: actionTop - 0.4,
      w: 4,
      h: 0.3,
      fontSize: 11,
      bold: true,
      color: COLOR.sub,
      fontFace: FONT,
    })
    const chipW = (W - 0.8 - (topItems.length - 1) * 0.2) / topItems.length
    topItems.forEach((item, i) => {
      const x = 0.4 + i * (chipW + 0.2)
      const tone = severityColor(item.severity)
      const soft = severitySoftFill(item.severity)
      alt.addShape('rect', {
        x,
        y: actionTop,
        w: 0.1,
        h: actionH,
        fill: { color: tone },
        line: { type: 'none' },
      })
      alt.addShape('rect', {
        x: x + 0.1,
        y: actionTop,
        w: chipW - 0.1,
        h: actionH,
        fill: { color: soft },
        line: { color: COLOR.rule, width: 0.4 },
      })
      alt.addText(item.title, {
        x: x + 0.25,
        y: actionTop + 0.1,
        w: chipW - 0.4,
        h: 0.7,
        fontSize: 10.5,
        bold: true,
        color: COLOR.ink,
        fontFace: FONT,
        valign: 'top',
      })
      alt.addText(
        [
          { text: '액션  ', options: { bold: true, color: tone, fontSize: 9.5 } },
          { text: item.action, options: { color: COLOR.ink, fontSize: 9.5 } },
        ],
        {
          x: x + 0.25,
          y: actionTop + 0.85,
          w: chipW - 0.4,
          h: 0.65,
          fontFace: FONT,
          valign: 'top',
        },
      )
    })
  }

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
