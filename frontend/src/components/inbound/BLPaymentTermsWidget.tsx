// Phase 4 — Step 3 follow-up: BL 결제조건 위젯 (MetaForm contentBlock 용)
// 단순화 버전: import 시 계약금 + 잔금일수, domestic 시 선입금 % + 잔금일수.
// BLForm 의 풀 버전 (분할 / 월말 옵션) 보다 단순. 필요 시 확장.

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  type ImportPT, type DomesticPT, IMPORT_BALANCE_DAYS, DOMESTIC_DAYS5,
  defaultImportPT, defaultDomesticPT,
  composeImportPT, parseImportPT, composeDomesticPT, parseDomesticPT,
} from '@/lib/blPaymentTerms';

export interface BLPaymentTermsWidgetProps {
  inboundType: string | undefined;
  totalAmount: number;
  /** 현재 payment_terms 텍스트 (parse 후 UI 초기화) */
  initialValue?: string | null;
  onChange: (paymentTerms: string) => void;
}

export default function BLPaymentTermsWidget({ inboundType, totalAmount, initialValue, onChange }: BLPaymentTermsWidgetProps) {
  const isImport = inboundType === 'import';
  const isDomestic = inboundType === 'domestic';
  const [importPT, setImportPT] = useState<ImportPT>(() => initialValue ? parseImportPT(initialValue) : defaultImportPT());
  const [domesticPT, setDomesticPT] = useState<DomesticPT>(() => initialValue ? parseDomesticPT(initialValue) : defaultDomesticPT());

  // 외부에서 inboundType / initialValue 가 바뀌면 재파싱 (PO cascade 등)
  useEffect(() => {
    if (initialValue == null) return;
    if (isImport) setImportPT(parseImportPT(initialValue));
    else if (isDomestic) setDomesticPT(parseDomesticPT(initialValue));
  }, [initialValue, isImport, isDomestic]);

  // 내부 변화 시 외부에 compose 결과 전달
  useEffect(() => {
    if (isImport) onChange(composeImportPT(importPT, totalAmount));
    else if (isDomestic) onChange(composeDomesticPT(domesticPT, totalAmount));
    // group 등은 미지원
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importPT, domesticPT, totalAmount, isImport, isDomestic]);

  if (!isImport && !isDomestic) {
    return (
      <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        결제조건 입력은 해외직수입 / 국내구매 시 활성. (구분 선택 후 표시)
      </div>
    );
  }

  if (isImport) {
    return (
      <div className="rounded-md border bg-card p-3 space-y-3 text-xs">
        <p className="font-medium">결제조건 — 해외직수입</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">계약금</Label>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={importPT.hasDeposit}
                onChange={(e) => setImportPT({ ...importPT, hasDeposit: e.target.checked })} />
              <span className="text-[11px]">계약금 있음</span>
            </div>
          </div>
          {importPT.hasDeposit && (
            <>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">계약금 방법</Label>
                <Select value={importPT.depositMethod}
                  onValueChange={(v) => setImportPT({ ...importPT, depositMethod: v as 'tt' | 'lc' })}>
                  <SelectTrigger className="h-8 text-xs"><span>{importPT.depositMethod === 'tt' ? 'T/T' : 'L/C'}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tt">T/T</SelectItem>
                    <SelectItem value="lc">L/C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">계약금 %</Label>
                <Input type="number" value={importPT.depositPercent} placeholder="예: 30"
                  className="h-8 text-xs"
                  onChange={(e) => setImportPT({ ...importPT, depositPercent: e.target.value })} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">잔금 L/C 일수</Label>
            <Select value={importPT.balanceDays}
              onValueChange={(v) => setImportPT({ ...importPT, balanceDays: v as ImportPT['balanceDays'] })}>
              <SelectTrigger className="h-8 text-xs"><span>{importPT.balanceDays}일</span></SelectTrigger>
              <SelectContent>
                {IMPORT_BALANCE_DAYS.map((d) => <SelectItem key={d} value={d}>{d}일</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          미리보기: <span className="font-mono">{composeImportPT(importPT, totalAmount)}</span>
        </p>
      </div>
    );
  }

  // domestic
  return (
    <div className="rounded-md border bg-card p-3 space-y-3 text-xs">
      <p className="font-medium">결제조건 — 국내구매</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">선입금 모드</Label>
          <Select value={domesticPT.prepayMode}
            onValueChange={(v) => setDomesticPT({ ...domesticPT, prepayMode: v as 'percent' | 'amount' })}>
            <SelectTrigger className="h-8 text-xs"><span>{domesticPT.prepayMode === 'percent' ? '%' : '금액'}</span></SelectTrigger>
            <SelectContent>
              <SelectItem value="amount">금액 (KRW)</SelectItem>
              <SelectItem value="percent">% (총액 대비)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">선입금 값</Label>
          <Input type="number" value={domesticPT.prepayValue}
            placeholder={domesticPT.prepayMode === 'percent' ? '예: 30' : '예: 1000000'}
            className="h-8 text-xs"
            onChange={(e) => setDomesticPT({ ...domesticPT, prepayValue: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">잔금 모드</Label>
          <Select value={domesticPT.balanceMode}
            onValueChange={(v) => setDomesticPT({ ...domesticPT, balanceMode: v as DomesticPT['balanceMode'] })}>
            <SelectTrigger className="h-8 text-xs"><span>{
              domesticPT.balanceMode === 'days5' ? '신용거래 (5일 단위)'
              : domesticPT.balanceMode === 'manual' ? '신용거래 (수기)'
              : '월말 결제'
            }</span></SelectTrigger>
            <SelectContent>
              <SelectItem value="days5">신용거래 (5일 단위)</SelectItem>
              <SelectItem value="manual">신용거래 (수기 일수)</SelectItem>
              <SelectItem value="month">월말 결제</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(domesticPT.balanceMode === 'days5' || domesticPT.balanceMode === 'manual') && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">잔금 일수</Label>
            {domesticPT.balanceMode === 'days5' ? (
              <Select value={domesticPT.balanceDays}
                onValueChange={(v) => setDomesticPT({ ...domesticPT, balanceDays: v })}>
                <SelectTrigger className="h-8 text-xs"><span>{domesticPT.balanceDays}일</span></SelectTrigger>
                <SelectContent>
                  {DOMESTIC_DAYS5.map((d) => <SelectItem key={d} value={d}>{d}일</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input type="number" value={domesticPT.balanceDays}
                className="h-8 text-xs"
                onChange={(e) => setDomesticPT({ ...domesticPT, balanceDays: e.target.value })} />
            )}
          </div>
        )}
        {domesticPT.balanceMode === 'month' && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">월 오프셋</Label>
            <Select value={domesticPT.monthOffset}
              onValueChange={(v) => setDomesticPT({ ...domesticPT, monthOffset: v as DomesticPT['monthOffset'] })}>
              <SelectTrigger className="h-8 text-xs"><span>{
                domesticPT.monthOffset === '1' ? '익월말'
                : domesticPT.monthOffset === '2' ? '익익월말'
                : '익익익월말'
              }</span></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">익월말</SelectItem>
                <SelectItem value="2">익익월말</SelectItem>
                <SelectItem value="3">익익익월말</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        미리보기: <span className="font-mono">{composeDomesticPT(domesticPT, totalAmount)}</span>
      </p>
    </div>
  );
}
