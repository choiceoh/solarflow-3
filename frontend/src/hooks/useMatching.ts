import { useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import type { OutstandingItem, MatchSuggestion, ReceiptMatch } from '@/types/orders';

export function useOutstandingList() {
  const [data, setData] = useState<OutstandingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async (customerId: string) => {
    if (!selectedCompanyId || !customerId) { setData([]); return; }
    setLoading(true);
    try {
      const result = await fetchWithAuth<OutstandingItem[]>('/api/v1/calc/outstanding-list', {
        method: 'POST',
        body: JSON.stringify({ company_id: selectedCompanyId, customer_id: customerId }),
      });
      setData(result);
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
      const result = await fetchWithAuth<MatchSuggestion>('/api/v1/calc/receipt-match-suggest', {
        method: 'POST',
        body: JSON.stringify({ company_id: selectedCompanyId, customer_id: customerId, receipt_amount: receiptAmount }),
      });
      setSuggestion(result);
    } catch { setSuggestion(null); }
    setLoading(false);
  }, [selectedCompanyId]);

  const clear = useCallback(() => setSuggestion(null), []);

  return { suggestion, loading, suggest, clear };
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
