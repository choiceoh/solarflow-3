import { useState, useEffect, useMemo } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { formatNumber, formatDate } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import OutstandingTable from './OutstandingTable';
import MatchSuggestionBanner from './MatchSuggestionBanner';
import MatchDifferenceDisplay from './MatchDifferenceDisplay';
import MatchHistoryTable from './MatchHistoryTable';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useOutstandingList, useMatchSuggest, useMatchHistory } from '@/hooks/useMatching';
import { useReceiptList } from '@/hooks/useReceipts';

// 비유: 수금 매칭은 퍼즐. 입금액(큰 조각)을 미수금(작은 조각들)에 맞추는 작업.
export default function ReceiptMatchingPanel() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  // Step 1: 수금 선택
  const { data: receipts, reload: reloadReceipts } = useReceiptList();
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);

  // 미매칭/부분매칭 수금만 표시
  const unmatchedReceipts = useMemo(
    () => receipts.filter((r) => (r.matched_total ?? 0) < r.amount),
    [receipts]
  );

  const selectedReceipt = receipts.find((r) => r.receipt_id === selectedReceiptId) ?? null;

  // Step 2: 미수금 목록
  const { data: outstandingItems, loading: outstandingLoading, load: loadOutstanding } = useOutstandingList();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 자동 추천
  const { suggestion, loading: suggestLoading, suggest, clear: clearSuggestion } = useMatchSuggest();

  // 매칭 이력
  const { data: matchHistory, loading: historyLoading, load: loadHistory } = useMatchHistory(selectedReceiptId);

  // 매칭 확정 Dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 수금 선택 변경 시 데이터 로드 (state 초기화는 onValueChange 핸들러에서 직접 처리)
  const customerId = selectedReceipt?.customer_id;
  useEffect(() => {
    if (selectedReceiptId && customerId) {
      loadOutstanding(customerId);
      loadHistory();
    }
  }, [selectedReceiptId, customerId, loadOutstanding, loadHistory]);

  const handleReceiptChange = (v: string | null) => {
    setSelectedReceiptId(v || null);
    setSelectedIds(new Set());
    clearSuggestion();
    setSuccessMsg(null);
  };

  // 선택 합계 계산
  const selectedTotal = useMemo(() => {
    return outstandingItems
      .filter((item) => selectedIds.has(item.outbound_id))
      .reduce((sum, item) => sum + item.outstanding_amount, 0);
  }, [outstandingItems, selectedIds]);

  const receiptAmount = selectedReceipt?.amount ?? 0;
  const diff = receiptAmount - selectedTotal;

  const handleToggle = (outboundId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(outboundId)) next.delete(outboundId);
      else next.add(outboundId);
      return next;
    });
  };

  // 자동 추천 버튼
  const handleSuggest = async () => {
    if (!selectedReceipt || !selectedCompanyId) return;
    await suggest(selectedReceipt.customer_id, receiptAmount);
  };

  // 추천 결과 반영: suggestion 상태 변화에 따라 selectedIds 자동 동기화
  // (훅 시그니처를 바꾸지 않는 한 effect 동기화가 가장 안전)
  useEffect(() => {
    if (suggestion?.suggestions) {
      const ids = new Set(suggestion.suggestions.map((s) => s.outbound_id));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIds(ids);
    }
  }, [suggestion]);

  // 매칭 확정
  const handleConfirmMatch = async () => {
    if (!selectedReceiptId || selectedIds.size === 0) return;
    setConfirmLoading(true);
    try {
      const selected = outstandingItems.filter((item) => selectedIds.has(item.outbound_id));
      for (const item of selected) {
        await fetchWithAuth('/api/v1/receipt-matches', {
          method: 'POST',
          body: JSON.stringify({
            receipt_id: selectedReceiptId,
            outbound_id: item.outbound_id,
            matched_amount: item.outstanding_amount,
          }),
        });
      }
      setSuccessMsg(`${selected.length}건 매칭 완료 (${formatNumber(selectedTotal)}원)`);
      reloadReceipts();
      if (selectedReceipt) loadOutstanding(selectedReceipt.customer_id);
      loadHistory();
      setSelectedIds(new Set());
      clearSuggestion();
    } catch { /* 에러 시 변경 없음 */ }
    setConfirmLoading(false);
    setConfirmOpen(false);
  };

  if (!selectedCompanyId) {
    return <div className="text-center py-8 text-sm text-muted-foreground">법인을 선택해주세요</div>;
  }

  return (
    <div className="space-y-4">
      {/* Step 1: 수금 선택 */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Step 1. 수금 선택</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <Select
            value={selectedReceiptId ?? ''}
            onValueChange={handleReceiptChange}
          >
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="미매칭/부분매칭 수금을 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {unmatchedReceipts.map((r) => (
                <SelectItem key={r.receipt_id} value={r.receipt_id}>
                  {formatDate(r.receipt_date)} | {r.customer_name ?? '—'} | {formatNumber(r.amount)}원
                  {(r.matched_total ?? 0) > 0 && ` (기매칭 ${formatNumber(r.matched_total ?? 0)}원)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedReceipt && (
        <>
          {/* Step 2: 미수금 목록 */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Step 2. 미수금 선택 ({selectedReceipt.customer_name})</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSuggest}
                  disabled={suggestLoading}
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  {suggestLoading ? '추천 중...' : '자동 추천'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              {suggestion && <MatchSuggestionBanner suggestion={suggestion} />}

              {outstandingLoading ? <LoadingSpinner /> : (
                <OutstandingTable
                  items={outstandingItems}
                  selectedIds={selectedIds}
                  onToggle={handleToggle}
                />
              )}

              {selectedIds.size > 0 && (
                <MatchDifferenceDisplay receiptAmount={receiptAmount} selectedTotal={selectedTotal} />
              )}
            </CardContent>
          </Card>

          {/* Step 3: 매칭 확정 */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={diff < 0 || selectedIds.size === 0}
              >
                <Check className="mr-1 h-4 w-4" />
                매칭 확정 ({selectedIds.size}건)
              </Button>
              {diff < 0 && (
                <p className="text-xs text-destructive">선택 합계가 입금액을 초과합니다</p>
              )}
            </div>
          )}

          {successMsg && (
            <div className="rounded-md border border-green-300 bg-green-50 p-3 text-xs text-green-800">
              {successMsg}
            </div>
          )}

          <Separator />

          {/* 매칭 이력 */}
          <div>
            <h3 className="text-sm font-semibold mb-2">매칭 이력</h3>
            {historyLoading ? <LoadingSpinner /> : (
              <MatchHistoryTable items={matchHistory} receiptAmount={receiptAmount} />
            )}
          </div>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="매칭 확정"
            description={
              diff > 0
                ? `${selectedIds.size}건 매칭 (${formatNumber(selectedTotal)}원)을 확정합니다. 선수금 ${formatNumber(diff)}원은 다음 정산으로 이월됩니다.`
                : `${selectedIds.size}건 매칭 (${formatNumber(selectedTotal)}원)을 확정합니다.`
            }
            onConfirm={handleConfirmMatch}
            loading={confirmLoading}
          />
        </>
      )}
    </div>
  );
}
