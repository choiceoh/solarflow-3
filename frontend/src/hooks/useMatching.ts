import { useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import type { OutstandingItem, MatchSuggestion, ReceiptMatch, AIMatchSuggestion } from '@/types/orders';

interface OutstandingListResponse {
  outstanding_items: (Omit<OutstandingItem, 'matched_amount'> & { collected_amount: number })[];
}

interface ReceiptMatchSuggestResponse {
  receipt_amount: number;
  suggestions: {
    match_type: 'exact' | 'closest' | 'single';
    items: { outbound_id: string; match_amount: number }[];
    total_matched: number;
    remainder: number;
  }[];
  unmatched_amount: number;
}

export function useOutstandingList() {
  const [data, setData] = useState<OutstandingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async (customerId: string) => {
    if (!selectedCompanyId || !customerId) { setData([]); return; }
    setLoading(true);
    try {
      const result = await fetchWithAuth<OutstandingListResponse>('/api/v1/calc/outstanding-list', {
        method: 'POST',
        body: JSON.stringify({ company_id: selectedCompanyId, customer_id: customerId }),
      });
      setData((result.outstanding_items ?? []).map((item) => ({
        ...item,
        matched_amount: item.collected_amount ?? 0,
      })));
    } catch { setData([]); }
    setLoading(false);
  }, [selectedCompanyId]);

  return { data, loading, load };
}

export function useMatchSuggest() {
  const [suggestion, setSuggestion] = useState<MatchSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const suggest = useCallback(async (customerId: string, receiptAmount: number) => {
    if (!selectedCompanyId) return;
    setLoading(true);
    try {
      const result = await fetchWithAuth<ReceiptMatchSuggestResponse>('/api/v1/calc/receipt-match-suggest', {
        method: 'POST',
        body: JSON.stringify({ company_id: selectedCompanyId, customer_id: customerId, receipt_amount: receiptAmount }),
      });
      const best = result.suggestions?.[0];
      setSuggestion(best ? {
        match_type: best.match_type,
        suggestions: best.items.map((item) => ({ outbound_id: item.outbound_id, amount: item.match_amount })),
        total_suggested: best.total_matched,
        difference: best.remainder,
      } : null);
    } catch { setSuggestion(null); }
    setLoading(false);
  }, [selectedCompanyId]);

  const clear = useCallback(() => setSuggestion(null), []);

  return { suggestion, loading, suggest, clear };
}

export function useAIMatchSuggest() {
  const [suggestion, setSuggestion] = useState<AIMatchSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const suggest = useCallback(async (receiptId: string) => {
    if (!selectedCompanyId || !receiptId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWithAuth<AIMatchSuggestion>('/api/v1/receipt-matches/ai-suggest', {
        method: 'POST',
        body: JSON.stringify({ company_id: selectedCompanyId, receipt_id: receiptId }),
      });
      setSuggestion(result);
    } catch (e) {
      setSuggestion(null);
      setError(e instanceof Error ? e.message : 'AI 추천에 실패했습니다');
    }
    setLoading(false);
  }, [selectedCompanyId]);

  const clear = useCallback(() => {
    setSuggestion(null);
    setError(null);
  }, []);

  return { suggestion, loading, error, suggest, clear };
}

export function useMatchHistory(receiptId: string | null) {
  const [data, setData] = useState<(ReceiptMatch & { outbound_date?: string; site_name?: string; product_name?: string })[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!receiptId) { setData([]); return; }
    setLoading(true);
    try {
      const list = await fetchWithAuth<(ReceiptMatch & { outbound_date?: string; site_name?: string; product_name?: string })[]>(
        `/api/v1/receipt-matches?receipt_id=${receiptId}`
      );
      setData(list);
    } catch { setData([]); }
    setLoading(false);
  }, [receiptId]);

  return { data, loading, load };
}
