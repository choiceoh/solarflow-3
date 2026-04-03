// 결재안 6유형 텍스트 생성 함수 (Step 30)
// 비유: 결재안 양식 자판기 — 데이터 넣으면 포맷된 텍스트 출력

import type {
  Type1Data, Type2Data, Type3Data, Type4Data, Type5Data, Type6Data,
} from '@/types/approval';

// 숫자 포맷: 천 단위 콤마
function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// USD 포맷
function fmtUsd(n: number): string {
  return `USD ${fmt(n, 2)}`;
}

// KRW 포맷
function fmtKrw(n: number): string {
  return `${fmt(Math.round(n))}원`;
}

// 유형 1: 수입 모듈대금
export function generateType1(d: Type1Data): string {
  const lines = d.lines.map(
    (l, i) => `${i + 1}. ${l.productName} / ${fmt(l.quantity)}장 / ${fmtUsd(l.unitPriceUsd)}/EA / ${fmtUsd(l.totalUsd)}`,
  ).join('\n');

  return `[결재안] 수입 모듈대금 지급 요청

■ PO No.: ${d.poNumber}
■ 거래처: ${d.manufacturerName}
■ 은행: ${d.bankName}
■ LC No.: ${d.lcNumber}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 세부 내역
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${lines}

2. 금액 산출
  LC 금액(USD): ${fmtUsd(d.lcAmountUsd)}
  적용 환율: ${fmt(d.exchangeRate, 2)}원/USD
  원화 환산: ${fmtKrw(d.amountKrw)}
  수입통관 부가세(CIF×0.1): ${fmtKrw(d.vat)} (변동 가능)
  LC 인수수수료: ${fmtKrw(d.lcFee)}
  전신료: ${fmtKrw(d.telegraph)}
  ──────────────
  합계: ${fmtKrw(d.totalKrw)}

3. 선적 정보
  ETD: ${d.etd ?? '-'}
  ETA: ${d.eta ?? '-'}

4. LC 조건
  유산스: ${d.usanceDays ?? '-'}일
  만기일: ${d.maturityDate ?? '-'}
  인코텀즈: ${d.incoterms ?? '-'}
  결제조건: ${d.paymentTerms ?? '-'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
※ 부가세는 실제 통관 시 변동될 수 있습니다.`;
}

// 유형 2: CIF 비용/제경비
export function generateType2(d: Type2Data): string {
  const expRows = d.expenses.map(
    (e) => `  ${e.label.padEnd(12)} ${fmtKrw(e.amount).padStart(15)} ${fmtKrw(e.vat).padStart(12)} ${fmtKrw(e.total).padStart(15)}`,
  ).join('\n');

  return `[결재안] CIF 비용/제경비 지출 요청

■ B/L No.: ${d.blNumber}
■ 거래처: ${d.manufacturerName}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 수입 상세
  Contract: ${d.contractInfo}
  B/L: ${d.blNumber}
  품명: ${d.productSummary}
  ETD: ${d.etd ?? '-'} / ETA: ${d.eta ?? '-'}
  도착항: ${d.port ?? '-'}

2. 비용 내역
  ${'항목'.padEnd(12)} ${'금액'.padStart(15)} ${'부가세'.padStart(12)} ${'합계'.padStart(15)}
  ${'─'.repeat(56)}
${expRows}
  ${'─'.repeat(56)}
  ${'합계'.padEnd(12)} ${fmtKrw(d.totalAmount).padStart(15)} ${fmtKrw(d.totalVat).padStart(12)} ${fmtKrw(d.grandTotal).padStart(15)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
지출금액: ${fmtKrw(d.grandTotal)}`;
}

// 유형 3: 판매 세금계산서
export function generateType3(d: Type3Data): string {
  const rows = d.items.map((item, i) => {
    const priceStr = `${fmt(item.unitPriceEa)}원 (Wp/${fmt(item.unitPriceWp)}원)`;
    const remark = item.spareQty > 0 ? `SP${item.spareQty}EA` : '';
    return `${i + 1}. ${item.siteName} / ${item.productName} / ${fmt(item.quantity)}장 / ${priceStr} / ${fmtKrw(item.supplyAmount)} ${remark}`;
  }).join('\n');

  return `[결재안] 판매 세금계산서 발행 요청

■ 대상: ${d.customerName}
■ 기간: ${d.from} ~ ${d.to}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 발전소별 내역
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${rows}

2. 합계
  공급가: ${fmtKrw(d.totalSupply)}
  부가세: ${fmtKrw(d.totalVat)}
  합계: ${fmtKrw(d.grandTotal)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// 유형 4: 운송비 월정산
export function generateType4(d: Type4Data): string {
  return `[결재안] 운송비 월정산 지급 요청

■ 거래처: ${d.vendor}
■ 정산 월: ${d.month}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 금액
  공급가: ${fmtKrw(d.totalAmount)}
  부가세: ${fmtKrw(d.totalVat)}
  합계: ${fmtKrw(d.grandTotal)}

2. 차량별 상세
${d.manualDetails || '  [수동 입력]'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
지출금액: ${fmtKrw(d.grandTotal)}`;
}

// 유형 5: 계약금 지출
export function generateType5(d: Type5Data): string {
  const lines = d.lines.map(
    (l, i) => `${i + 1}. ${l.productName} / ${fmt(l.quantity)}장 / ${fmtUsd(l.unitPriceUsd)}/EA / ${fmtUsd(l.totalUsd)}`,
  ).join('\n');

  const ttRows = d.ttHistory.length > 0
    ? d.ttHistory.map(
        (tt, i) => `  ${i + 1}. ${tt.date} / ${fmtUsd(tt.amountUsd)} / ${fmtKrw(tt.amountKrw)} / ${tt.purpose}`,
      ).join('\n')
    : '  없음';

  return `[결재안] 계약금 지출 요청

■ PO No.: ${d.poNumber}
■ 거래처: ${d.manufacturerName}
■ 계약유형: ${d.contractType}
■ 계약일: ${d.contractDate ?? '-'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 거래 내역
${lines}

  계약 총액: ${fmtUsd(d.totalUsd)} (${fmtKrw(d.totalKrw)})
  환율: ${fmt(d.exchangeRate, 2)}원/USD

2. 계약금 산출
  계약금율: ${d.depositRate}%
  계약금액: ${fmtKrw(d.depositAmount)}

3. 기 지급 내역
${ttRows}
  기 지급 합계: ${fmtKrw(d.paidTotal)}
  잔액: ${fmtKrw(d.remaining)}

4. 분납 계획
  분납 횟수: ${d.installments}회
  인코텀즈: ${d.incoterms ?? '-'}
  결제조건: ${d.paymentTerms ?? '-'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// 유형 6: 공사 현장 운송료
export function generateType6(d: Type6Data): string {
  const rows = d.items.map(
    (item, i) => `${i + 1}. ${item.siteName} / ${item.productName} / ${fmt(item.quantity)}장 / ${fmtKrw(item.transportCost)} ${item.memo ? `/ ${item.memo}` : ''}`,
  ).join('\n');

  return `[결재안] 공사 현장 운송료 지출 요청

■ 기간: ${d.from} ~ ${d.to}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 현장별 내역
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${rows}

2. 합계
  총 운송료: ${fmtKrw(d.totalTransport)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
