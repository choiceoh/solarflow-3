// 매출 분석 "경영 리포트" 워드 템플릿 생성기.
//
// 한 번 실행해 public/templates/sales-management-report.docx 를 만들고 커밋한다.
// 런타임 다운로드는 docxtemplater 로 이 파일의 {placeholder} / {#loop}...{/loop} 를
// 치환한다 — 자세한 키 매핑은 src/lib/reports/salesManagementReport.ts 참조.
//
// 재생성 필요 시: `bun run scripts/build-sales-report-template.mjs`

import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopPosition,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(__dirname, '../public/templates/sales-management-report.docx')

const PAGE_WIDTH = 11906 // A4 width in DXA
const PAGE_HEIGHT = 16838 // A4 height
const MARGIN = 1080 // ~0.75in — 본문 폭 ≒ 9746 DXA
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

const COLOR = {
  ink: '0F172A',
  sub: '475569',
  rule: 'CBD5E1',
  headBg: 'EEF2F6',
  zebraBg: 'F8FAFC',
}

const border = (color = COLOR.rule, size = 4) => ({
  style: BorderStyle.SINGLE,
  size,
  color,
})

const cellBorders = {
  top: border(),
  bottom: border(),
  left: border(),
  right: border(),
}

const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 }

function text(value, opts = {}) {
  return new TextRun({ text: String(value), ...opts })
}

function para(children, opts = {}) {
  const runs = Array.isArray(children) ? children : [children]
  return new Paragraph({
    children: runs.map((r) => (typeof r === 'string' ? text(r) : r)),
    ...opts,
  })
}

function headCell(label, width) {
  return new TableCell({
    borders: cellBorders,
    margins: cellMargins,
    verticalAlign: VerticalAlign.CENTER,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: COLOR.headBg, type: ShadingType.CLEAR, color: 'auto' },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [text(label, { bold: true, size: 18, color: COLOR.ink })],
      }),
    ],
  })
}

function bodyCell(content, width, align = AlignmentType.LEFT) {
  const runs = Array.isArray(content) ? content : [content]
  return new TableCell({
    borders: cellBorders,
    margins: cellMargins,
    verticalAlign: VerticalAlign.CENTER,
    width: { size: width, type: WidthType.DXA },
    children: [
      new Paragraph({
        alignment: align,
        children: runs.map((r) => (typeof r === 'string' ? text(r, { size: 18 }) : r)),
      }),
    ],
  })
}

function headerRow(labels, widths) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((label, i) => headCell(label, widths[i])),
  })
}

function buildTable({ widths, header, bodyCells }) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow(header, widths), new TableRow({ children: bodyCells })],
  })
}

// --- Cover --------------------------------------------------------------

const cover = [
  new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 120 },
    children: [text('{companyName}', { color: COLOR.sub, size: 20 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 240 },
    children: [text('매출·이익 경영 리포트', { bold: true, size: 48, color: COLOR.ink })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [text('기간 {periodLabel}', { size: 28, color: COLOR.ink })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 4800, after: 80 },
    children: [text('작성일 {generatedAt}', { size: 20, color: COLOR.sub })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [
      text('원가 기준 ', { size: 20, color: COLOR.sub }),
      text('{costBasis}', { size: 20, bold: true, color: COLOR.ink }),
      text('  ·  대체원가 ', { size: 20, color: COLOR.sub }),
      text('{alternativeCostLabel}', { size: 20, bold: true, color: COLOR.ink }),
    ],
  }),
  new Paragraph({ children: [new PageBreak()] }),
]

// --- 1. 핵심 요약 --------------------------------------------------------

const summaryWidths = [3200, CONTENT_WIDTH - 3200]

function summaryRow(label, valueRuns, opts = {}) {
  return new TableRow({
    children: [
      new TableCell({
        borders: cellBorders,
        margins: cellMargins,
        verticalAlign: VerticalAlign.CENTER,
        width: { size: summaryWidths[0], type: WidthType.DXA },
        shading: { fill: COLOR.zebraBg, type: ShadingType.CLEAR, color: 'auto' },
        children: [
          new Paragraph({ children: [text(label, { size: 18, color: COLOR.sub })] }),
        ],
      }),
      new TableCell({
        borders: cellBorders,
        margins: cellMargins,
        verticalAlign: VerticalAlign.CENTER,
        width: { size: summaryWidths[1], type: WidthType.DXA },
        children: [
          new Paragraph({
            children: valueRuns.map((r) =>
              typeof r === 'string'
                ? text(r, { size: 20, bold: opts.bold, color: COLOR.ink })
                : r,
            ),
          }),
        ],
      }),
    ],
  })
}

const summaryTable = new Table({
  width: { size: CONTENT_WIDTH, type: WidthType.DXA },
  columnWidths: summaryWidths,
  rows: [
    summaryRow('공급가 매출', ['{summary.supply}'], { bold: true }),
    summaryRow('부가세 포함 매출', ['{summary.total}']),
    summaryRow(
      '매출 건수',
      [
        text('{summary.count}', { size: 20, bold: true, color: COLOR.ink }),
        text('  (발행 {summary.issued} · 미발행 {summary.pending})', {
          size: 18,
          color: COLOR.sub,
        }),
      ],
    ),
    summaryRow(
      '계산 이익',
      [
        text('{summary.calculatedMargin}', { size: 20, bold: true, color: COLOR.ink }),
        text('  ({summary.calculatedMarginRate})', { size: 18, color: COLOR.sub }),
      ],
    ),
    summaryRow(
      '잠정 이익',
      [
        text('{summary.adjustedMargin}', { size: 20, bold: true, color: COLOR.ink }),
        text('  ({summary.adjustedMarginRate})', { size: 18, color: COLOR.sub }),
      ],
    ),
    summaryRow('원가 연결률', ['{summary.costCoverageRate}']),
    summaryRow('원가 미연결 매출', ['{summary.costMissingRevenue}']),
    summaryRow(
      '미수금',
      [
        text('{summary.outstanding}', { size: 20, bold: true, color: COLOR.ink }),
        text('  ({summary.outstandingCount}건)', { size: 18, color: COLOR.sub }),
      ],
    ),
  ],
})

const summarySection = [
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 200 },
    children: [text('1. 핵심 요약', { bold: true, size: 32, color: COLOR.ink })],
  }),
  summaryTable,
  new Paragraph({ children: [new PageBreak()] }),
]

// --- 2. 월별 매출 / 이익 ------------------------------------------------

const monthSalesWidths = [1200, 2000, 2000, 1400, 1500, CONTENT_WIDTH - 8100]
const monthProfitWidths = [1200, 2100, 1500, 1600, 1700, CONTENT_WIDTH - 8100]

const monthSalesTable = buildTable({
  widths: monthSalesWidths,
  header: ['월', '공급가', '부가세 포함', '매출건수', '발행', '미발행'],
  bodyCells: [
    bodyCell('{#monthly}{month}', monthSalesWidths[0]),
    bodyCell('{revenue}', monthSalesWidths[1], AlignmentType.RIGHT),
    bodyCell('{total}', monthSalesWidths[2], AlignmentType.RIGHT),
    bodyCell('{count}', monthSalesWidths[3], AlignmentType.RIGHT),
    bodyCell('{issued}', monthSalesWidths[4], AlignmentType.RIGHT),
    bodyCell('{pending}{/monthly}', monthSalesWidths[5], AlignmentType.RIGHT),
  ],
})

const monthProfitTable = buildTable({
  widths: monthProfitWidths,
  header: ['월', '잠정이익', '이익률', '원가연결률', '평균판매가/Wp', '평균원가/Wp'],
  bodyCells: [
    bodyCell('{#monthly}{month}', monthProfitWidths[0]),
    bodyCell('{margin}', monthProfitWidths[1], AlignmentType.RIGHT),
    bodyCell('{marginRate}', monthProfitWidths[2], AlignmentType.RIGHT),
    bodyCell('{costCoverageRate}', monthProfitWidths[3], AlignmentType.RIGHT),
    bodyCell('{avgSaleWp}', monthProfitWidths[4], AlignmentType.RIGHT),
    bodyCell('{avgCostWp}{/monthly}', monthProfitWidths[5], AlignmentType.RIGHT),
  ],
})

const monthlySection = [
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200 },
    children: [text('2. 월별 매출 / 이익', { bold: true, size: 32, color: COLOR.ink })],
  }),
  new Paragraph({
    spacing: { after: 120 },
    children: [text('2-1. 월별 매출', { bold: true, size: 22, color: COLOR.sub })],
  }),
  monthSalesTable,
  new Paragraph({
    spacing: { before: 320, after: 120 },
    children: [text('2-2. 월별 이익', { bold: true, size: 22, color: COLOR.sub })],
  }),
  monthProfitTable,
  new Paragraph({ children: [new PageBreak()] }),
]

// --- 3. 이익률 변동 브리지 ----------------------------------------------

const bridgeWidths = [3000, 1200, 2200, CONTENT_WIDTH - 6400]

const bridgeTable = buildTable({
  widths: bridgeWidths,
  header: ['요인', 'p.p.', '영향금액', '근거'],
  bodyCells: [
    bodyCell('{#bridge}{label}', bridgeWidths[0]),
    bodyCell('{pp}', bridgeWidths[1], AlignmentType.RIGHT),
    bodyCell('{valueKrw}', bridgeWidths[2], AlignmentType.RIGHT),
    bodyCell('{detail}{/bridge}', bridgeWidths[3]),
  ],
})

const bridgeSection = [
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 80 },
    children: [text('3. 이익률 변동 브리지', { bold: true, size: 32, color: COLOR.ink })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    children: [
      text('전월 대비 잠정 이익률 변동을 요인별로 분해합니다.', {
        size: 18,
        color: COLOR.sub,
      }),
    ],
  }),
  bridgeTable,
  new Paragraph({ children: [new PageBreak()] }),
]

// --- 4. 대체원가 보정 품목 Top --------------------------------------------

const altWidths = [1600, 1900, 1800, 1300, 1500, 1100, CONTENT_WIDTH - 9200]

const altTable = buildTable({
  widths: altWidths,
  header: ['품번', '제조사', '미연결매출', '대체원가/Wp', '보정원가', '잠정이익률', '사유'],
  bodyCells: [
    bodyCell('{#alternativeRows}{productCode}', altWidths[0]),
    bodyCell('{manufacturerName}', altWidths[1]),
    bodyCell('{missingRevenue}', altWidths[2], AlignmentType.RIGHT),
    bodyCell('{altCostWp}', altWidths[3], AlignmentType.RIGHT),
    bodyCell('{altCostKrw}', altWidths[4], AlignmentType.RIGHT),
    bodyCell('{adjustedMarginRate}', altWidths[5], AlignmentType.RIGHT),
    bodyCell('{reason}{/alternativeRows}', altWidths[6]),
  ],
})

const altSection = [
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 80 },
    children: [
      text('4. 대체원가 보정 품목 Top 20', { bold: true, size: 32, color: COLOR.ink }),
    ],
  }),
  new Paragraph({
    spacing: { after: 200 },
    children: [
      text(
        '실제 원가가 연결되지 않은 매출에 대해 {alternativeCostLabel} 기준으로 가상 원가를 적용했을 때의 잠정 이익률입니다.',
        { size: 18, color: COLOR.sub },
      ),
    ],
  }),
  altTable,
]

// --- Document -----------------------------------------------------------

const doc = new Document({
  creator: 'SolarFlow 3.0',
  title: '매출·이익 경영 리포트',
  styles: {
    default: { document: { run: { font: '맑은 고딕', size: 20, color: COLOR.ink } } },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 32, bold: true, font: '맑은 고딕', color: COLOR.ink },
        paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              children: [
                text('SolarFlow 3.0', { size: 16, color: COLOR.sub }),
                text('\t'),
                text('{companyName}', { size: 16, color: COLOR.sub }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              children: [
                text('{periodLabel}', { size: 16, color: COLOR.sub }),
                text('\t'),
                text('Page ', { size: 16, color: COLOR.sub }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLOR.sub }),
                text(' / ', { size: 16, color: COLOR.sub }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: COLOR.sub }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...cover,
        ...summarySection,
        ...monthlySection,
        ...bridgeSection,
        ...altSection,
      ],
    },
  ],
})

const buffer = await Packer.toBuffer(doc)
writeFileSync(outPath, buffer)
console.warn(`wrote ${outPath} (${buffer.length} bytes)`)
