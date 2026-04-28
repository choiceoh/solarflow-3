import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ProgressMiniBar from '@/components/common/ProgressMiniBar';
import type { BLShipment, BLLineItem } from '@/types/inbound';
import type { LCRecord, POLineItem } from '@/types/procurement';

interface Props {
  poId: string;
  poLines: POLineItem[];
}

// D-061: PO 입고현황은 프론트에서 B/L 수량 합산
export default function POInboundProgress({ poId, poLines }: Props) {
  const [bls, setBls] = useState<BLShipment[]>([]);
  const [blLinesByBl, setBlLinesByBl] = useState<Record<string, BLLineItem[]>>({});
  const [lcs, setLcs] = useState<LCRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // B/L 목록 + LC 목록 동시 조회
        const [blList, lcList] = await Promise.all([
          fetchWithAuth<BLShipment[]>(`/api/v1/bls?po_id=${poId}`),
          fetchWithAuth<LCRecord[]>(`/api/v1/lcs?po_id=${poId}`),
        ]);
        if (cancelled) return;
        setBls(blList);
        setLcs(lcList);

        // 각 B/L의 라인아이템 조회하여 수량 합산
        const lineMap: Record<string, BLLineItem[]> = {};
        await Promise.all(
          blList.map(async (bl) => {
            try {
              const lines = await fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${bl.bl_id}/lines`);
              lineMap[bl.bl_id] = lines;
            } catch {
              lineMap[bl.bl_id] = [];
            }
          })
        );
        if (!cancelled) setBlLinesByBl(lineMap);
      } catch {
        if (!cancelled) { setBls([]); setLcs([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [poId]);

  if (loading) return <LoadingSpinner />;

  // 계약량: PO 라인아이템 수량 합계
  const contractQty = poLines.reduce((s, l) => s + l.quantity, 0);

  // LC 개설량: 해당 PO에 연결된 LC의 target_qty 합계
  const lcQty = lcs.reduce((s, lc) => s + (lc.target_qty ?? 0), 0);

  // B/L 라인아이템에서 수량 합산
  const allLines = Object.values(blLinesByBl).flat();
  const sumQtyByBlStatus = (statuses: string[]) => {
    const matchedBlIds = new Set(bls.filter((b) => statuses.includes(b.status)).map((b) => b.bl_id));
    return allLines.filter((l) => matchedBlIds.has(l.bl_id)).reduce((s, l) => s + l.quantity, 0);
  };

  // 선적완료: shipping 이후 상태 (shipping, arrived, customs, completed, erp_done)
  const shippedQty = sumQtyByBlStatus(['shipping', 'arrived', 'customs', 'completed', 'erp_done']);
  // 입고완료: completed, erp_done
  const completedQty = sumQtyByBlStatus(['completed', 'erp_done']);
  // 잔여량: 계약량 - 입고완료
  const remainQty = contractQty - completedQty;

  // 진행률: (입고완료 / 계약량) x 100%
  const progressPct = contractQty > 0 ? Math.min((completedQty / contractQty) * 100, 100) : 0;
  const barColor = progressPct >= 80 ? 'bg-green-500' : progressPct >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        <Card><CardHeader className="pb-1 pt-3"><CardTitle className="text-[10px] text-muted-foreground">계약량</CardTitle></CardHeader><CardContent className="pb-3"><p className="text-sm font-semibold">{formatNumber(contractQty)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-3"><CardTitle className="text-[10px] text-muted-foreground">LC개설량</CardTitle></CardHeader><CardContent className="pb-3"><p className="text-sm font-semibold">{formatNumber(lcQty)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-3"><CardTitle className="text-[10px] text-muted-foreground">선적완료</CardTitle></CardHeader><CardContent className="pb-3"><p className="text-sm font-semibold">{formatNumber(shippedQty)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-3"><CardTitle className="text-[10px] text-muted-foreground">입고완료</CardTitle></CardHeader><CardContent className="pb-3"><p className="text-sm font-semibold">{formatNumber(completedQty)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-3"><CardTitle className="text-[10px] text-muted-foreground">잔여량</CardTitle></CardHeader><CardContent className="pb-3"><p className="text-sm font-semibold">{formatNumber(remainQty)}</p></CardContent></Card>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>입고 진행률</span>
          <span>{progressPct.toFixed(0)}%</span>
        </div>
        <ProgressMiniBar percent={progressPct} colorClassName={barColor} className="h-3 w-full" barClassName="transition-all" />
      </div>
    </div>
  );
}
