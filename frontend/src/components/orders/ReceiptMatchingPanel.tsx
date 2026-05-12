import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, Check, BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { formatNumber, formatDate } from '@/lib/utils';
import SkeletonRows from '@/components/common/SkeletonRows';
import OutstandingTable from './OutstandingTable';
import MatchSuggestionBanner from './MatchSuggestionBanner';
import MatchDifferenceDisplay from './MatchDifferenceDisplay';
import MatchHistoryTable from './MatchHistoryTable';
import AIMatchSuggestionPanel from './AIMatchSuggestionPanel';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useOutstandingList, useMatchSuggest, useMatchHistory, useAIMatchSuggest } from '@/hooks/useMatching';
import { useReceiptList } from '@/hooks/useReceipts';
import { notify } from '@/lib/notify';
import {
  RECEIPT_BALANCE_DISPOSITION_LABEL,
  type ReceiptBalanceDisposition,
} from '@/types/orders';

// 비유: 수금 매칭은 퍼즐. 입금액(큰 조각)을 미수금(작은 조각들)에 맞추는 작업.
export default function ReceiptMatchingPanel() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [searchParams] = useSearchParams();

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
  const [matchAmounts, setMatchAmounts] = useState<Record<string, number>>({});
  const [balanceDisposition, setBalanceDisposition] = useState<ReceiptBalanceDisposition>('advance');
  const [balanceNote, setBalanceNote] = useState('');

  // 자동 추천
  const { suggestion, loading: suggestLoading, suggest, clear: clearSuggestion } = useMatchSuggest();
  const {
    suggestion: aiSuggestion,
    loading: aiSuggestLoading,
    error: aiSuggestError,
    suggest: suggestAI,
    clear: clearAISuggestion,
  } = useAIMatchSuggest();

  // 매칭 이력
  const { data: matchHistory, loading: historyLoading, load: loadHistory } = useMatchHistory(selectedReceiptId);

  // 매칭 확정 Dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const receiptId = searchParams.get('receipt_id');
    if (!receiptId || selectedReceiptId === receiptId) return;
    if (receipts.some((r) => r.receipt_id === receiptId)) {
      setSelectedReceiptId(receiptId);
      setSelectedIds(new Set());
      setMatchAmounts({});
      setBalanceDisposition('advance');
      setBalanceNote('');
      clearSuggestion();
      clearAISuggestion();
      setSuccessMsg(null);
    }
  }, [searchParams, receipts, selectedReceiptId, clearSuggestion, clearAISuggestion]);

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
    setMatchAmounts({});
    setBalanceDisposition('advance');
    setBalanceNote('');
    clearSuggestion();
    clearAISuggestion();
    setSuccessMsg(null);
  };

  const receiptAmount = selectedReceipt?.amount ?? 0;
  const receiptMatchedTotal = selectedReceipt?.matched_total ?? 0;
  const receiptAvailableAmount = Math.max(0, receiptAmount - receiptMatchedTotal);
  const selectedItems = useMemo(
    () => outstandingItems.filter((item) => selectedIds.has(item.outbound_id)),
    [outstandingItems, selectedIds]
  );

  const selectedTotal = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + (matchAmounts[item.outbound_id] ?? 0), 0);
  }, [matchAmounts, selectedItems]);

  const diff = receiptAvailableAmount - selectedTotal;
  const amountIssue = useMemo(() => {
    const invalid = selectedItems.find((item) => {
      const amount = matchAmounts[item.outbound_id] ?? 0;
      return amount <= 0 || amount > item.outstanding_amount;
    });
    if (!invalid) return null;
    const amount = matchAmounts[invalid.outbound_id] ?? 0;
    if (amount <= 0) return '매칭금액을 입력해주세요';
    return '매칭금액은 미수금보다 클 수 없습니다';
  }, [matchAmounts, selectedItems]);
  const canConfirm = selectedIds.size > 0 && !amountIssue && diff >= 0;

  const handleToggle = (outboundId: string) => {
    const item = outstandingItems.find((row) => row.outbound_id === outboundId);
    if (!item) return;
    const wasSelected = selectedIds.has(outboundId);
    if (wasSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(outboundId);
        return next;
      });
      setMatchAmounts((prev) => {
        const next = { ...prev };
        delete next[outboundId];
        return next;
      });
      return;
    }

    const remainingForNewRow = receiptAvailableAmount - selectedTotal;
    const defaultAmount = Math.min(
      item.outstanding_amount,
      remainingForNewRow > 0 ? remainingForNewRow : item.outstanding_amount
    );
    setSelectedIds((prev) => new Set(prev).add(outboundId));
    setMatchAmounts((prev) => ({ ...prev, [outboundId]: defaultAmount }));
  };

  const handleAmountChange = (outboundId: string, amount: number) => {
    const nextAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    setMatchAmounts((prev) => ({ ...prev, [outboundId]: nextAmount }));
  };

  // 자동 추천 버튼
  const handleSuggest = async () => {
    if (!selectedReceipt || !selectedCompanyId) return;
    await suggest(selectedReceipt.customer_id, receiptAvailableAmount);
  };

  const handleAISuggest = async () => {
    if (!selectedReceiptId) return;
    await suggestAI(selectedReceiptId);
  };

  // 추천 결과 반영: suggestion 상태 변화에 따라 selectedIds 자동 동기화
  // (훅 시그니처를 바꾸지 않는 한 effect 동기화가 가장 안전)
  useEffect(() => {
    if (suggestion?.suggestions) {
      const ids = new Set<string>();
      const amounts: Record<string, number> = {};
      for (const item of suggestion.suggestions) {
        const outstanding = outstandingItems.find((row) => row.outbound_id === item.outbound_id);
        if (!outstanding) continue;
        ids.add(item.outbound_id);
        amounts[item.outbound_id] = Math.min(item.amount, outstanding.outstanding_amount);
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIds(ids);
      setMatchAmounts(amounts);
      setBalanceDisposition('advance');
      setBalanceNote('');
    }
  }, [outstandingItems, suggestion]);

  useEffect(() => {
    if (aiSuggestion?.candidates) {
      const ids = new Set<string>();
      const amounts: Record<string, number> = {};
      for (const item of aiSuggestion.candidates) {
        const outstanding = outstandingItems.find((row) => row.outbound_id === item.outbound_id);
        if (!outstanding) continue;
        ids.add(item.outbound_id);
        amounts[item.outbound_id] = Math.min(item.match_amount, outstanding.outstanding_amount);
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIds(ids);
      setMatchAmounts(amounts);
      setBalanceDisposition('advance');
      setBalanceNote('');
    }
  }, [aiSuggestion, outstandingItems]);

  useEffect(() => {
    if (aiSuggestError) notify.error(aiSuggestError);
  }, [aiSuggestError]);

  // 매칭 확정
  const handleConfirmMatch = async () => {
    if (!selectedReceiptId || selectedIds.size === 0 || !canConfirm) return;
    setConfirmLoading(true);
    try {
      const selected = selectedItems.map((item) => ({
        ...item,
        matchAmount: matchAmounts[item.outbound_id] ?? 0,
      }));
      const remainingBalance = Math.max(0, receiptAvailableAmount - selectedTotal);
      await fetchWithAuth('/api/v1/receipt-matches/bulk', {
        method: 'POST',
        body: JSON.stringify({
          receipt_id: selectedReceiptId,
          matches: selected.map((item) => ({
            outbound_id: item.outbound_id,
            matched_amount: item.matchAmount,
          })),
          balance_disposition: remainingBalance > 0 ? balanceDisposition : undefined,
          balance_note: remainingBalance > 0 && balanceNote.trim() ? balanceNote.trim() : undefined,
        }),
      });
      setSuccessMsg(`${selected.length}건 매칭 완료 (${formatNumber(selectedTotal)}원)`);
      notify.success('수금 매칭을 확정했습니다');
      reloadReceipts();
      if (selectedReceipt) loadOutstanding(selectedReceipt.customer_id);
      loadHistory();
      setSelectedIds(new Set());
      setMatchAmounts({});
      setBalanceDisposition('advance');
      setBalanceNote('');
      clearSuggestion();
      clearAISuggestion();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '수금 매칭 확정에 실패했습니다');
    }
    setConfirmLoading(false);
    setConfirmOpen(false);
  };

  if (!selectedCompanyId) {
    return <div className="text-center py-8 text-sm text-muted-foreground">법인을 선택해주세요</div>;
  }

  const confirmDescription = diff > 0
    ? `${selectedIds.size}건 매칭 (${formatNumber(selectedTotal)}원)을 확정합니다.\n차액 ${formatNumber(diff)}원 처리: ${RECEIPT_BALANCE_DISPOSITION_LABEL[balanceDisposition]}`
    : `${selectedIds.size}건 매칭 (${formatNumber(selectedTotal)}원)을 확정합니다.`;

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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSuggest}
                    disabled={suggestLoading}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    {suggestLoading ? '추천 중...' : '자동 추천'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAISuggest}
                    disabled={aiSuggestLoading}
                  >
                    <BrainCircuit className="mr-1 h-3.5 w-3.5" />
                    {aiSuggestLoading ? 'AI 검토 중...' : 'AI 검토'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              {suggestion && <MatchSuggestionBanner suggestion={suggestion} />}
              {aiSuggestion && <AIMatchSuggestionPanel suggestion={aiSuggestion} />}

              {outstandingLoading ? <SkeletonRows rows={5} /> : (
                <OutstandingTable
                  items={outstandingItems}
                  selectedIds={selectedIds}
                  matchAmounts={matchAmounts}
                  onToggle={handleToggle}
                  onAmountChange={handleAmountChange}
                />
              )}

              {selectedIds.size > 0 && (
                <MatchDifferenceDisplay
                  availableAmount={receiptAvailableAmount}
                  selectedTotal={selectedTotal}
                  balanceDisposition={balanceDisposition}
                  balanceNote={balanceNote}
                  amountIssue={amountIssue}
                  onBalanceDispositionChange={setBalanceDisposition}
                  onBalanceNoteChange={setBalanceNote}
                />
              )}
            </CardContent>
          </Card>

          {/* Step 3: 매칭 확정 */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!canConfirm}
              >
                <Check className="mr-1 h-4 w-4" />
                매칭 확정 ({selectedIds.size}건)
              </Button>
              {amountIssue && (
                <p className="text-xs text-destructive">{amountIssue}</p>
              )}
              {diff < 0 && !amountIssue && (
                <p className="text-xs text-destructive">선택 합계가 입금액을 초과합니다</p>
              )}
            </div>
          )}

          {successMsg && (
            <div className="sf-banner pos">
              <Check className="sf-banner-icon h-3.5 w-3.5" />
              <span className="sf-banner-body">{successMsg}</span>
            </div>
          )}

          <Separator />

          <div>
            <div className="sf-eyebrow mb-2">매칭 이력</div>
            {historyLoading ? <SkeletonRows rows={4} /> : (
              <MatchHistoryTable items={matchHistory} receiptAmount={receiptAmount} />
            )}
          </div>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="매칭 확정"
            description={confirmDescription}
            onConfirm={handleConfirmMatch}
            loading={confirmLoading}
          />
        </>
      )}
    </div>
  );
}
