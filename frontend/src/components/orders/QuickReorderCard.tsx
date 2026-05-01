import { useEffect, useState, useCallback } from 'react';
import { History, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/api';
import type { Order } from '@/types/orders';

interface Props {
  partnerId: string;
  partnerName?: string;
  onCloned?: (newOrder: Order) => void;
}

// BARO Phase 1: 빠른 재발주 카드
// 거래처 선택 후 최근 5건의 수주를 보여주고, 한 번 클릭으로 같은 조건의 새 수주 draft를 생성한다.
export default function QuickReorderCard({ partnerId, partnerName, onCloned }: Props) {
  const [recent, setRecent] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  // 비BARO 테넌트(탑솔라)에서 BARO 전용 엔드포인트 호출 시 403 — 카드 자체를 숨긴다.
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    if (!partnerId) {
      setRecent([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const list = await fetchWithAuth<Order[]>(
        `/api/v1/baro/orders/recent?partner_id=${partnerId}&limit=5`,
      );
      setRecent(list);
    } catch (e) {
      // 403 (비BARO 테넌트)이면 카드 영구 숨김. 그 외 에러는 inline 표시.
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
        setHidden(true);
      } else {
        console.error('[빠른 재발주 — 최근 수주 조회 실패]', e);
        setError('최근 수주를 불러오지 못했습니다');
      }
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => { void load(); }, [load]);

  const handleClone = async (order: Order) => {
    setCloningId(order.order_id);
    setError('');
    try {
      const created = await fetchWithAuth<Order>(
        `/api/v1/baro/orders/${order.order_id}/clone`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      onCloned?.(created);
      await load();
    } catch (e) {
      console.error('[빠른 재발주 — 복제 실패]', e);
      setError('복제에 실패했습니다');
    } finally {
      setCloningId(null);
    }
  };

  // 비BARO 테넌트(탑솔라)에서 403을 받았거나 거래처 미선택이면 렌더하지 않는다.
  if (hidden || !partnerId) return null;

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <History className="h-3.5 w-3.5" />
          빠른 재발주 {partnerName ? `— ${partnerName}` : ''}
        </div>
        <span className="text-[10px] text-muted-foreground">최근 5건 · 클릭 한 번으로 같은 조건 복제</span>
      </div>
      {loading ? (
        <div className="px-4 py-3 text-xs text-muted-foreground">불러오는 중...</div>
      ) : recent.length === 0 ? (
        <div className="px-4 py-3 text-xs text-muted-foreground">
          이 거래처의 최근 수주가 없습니다.
        </div>
      ) : (
        <ul className="divide-y">
          {recent.map((o) => (
            <li key={o.order_id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="text-xs text-muted-foreground tabular-nums">{o.order_date}</span>
                <span className="truncate">
                  {o.product_code ?? o.product_id.slice(0, 8)}
                  {o.product_name ? ` · ${o.product_name}` : ''}
                </span>
                <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                  {o.quantity.toLocaleString()}장 · {o.unit_price_wp.toFixed(1)}원/Wp
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleClone(o)}
                disabled={cloningId === o.order_id}
              >
                <RotateCw className="mr-1 h-3 w-3" />
                {cloningId === o.order_id ? '복제 중...' : '복제'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="border-t px-4 py-2 text-xs text-destructive">{error}</div>}
    </div>
  );
}
