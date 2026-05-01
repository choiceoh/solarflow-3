// Phase 2.5 PoC: 출고 상세 메타 한계선 데모
// 출고 목록에서 첫 항목을 가져와 MetaDetail로 렌더링한다.
// 실제 운영용 OutboundDetailView는 그대로 유지 (워크플로우/편집/패널이 코드 영역).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOutboundList } from '@/hooks/useOutbound';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import MetaDetail from '@/templates/MetaDetail';
import outboundDetailSimpleConfig from '@/config/details/outbound_simple';

export default function OutboundDetailMetaDemoPage() {
  const navigate = useNavigate();
  const { data, loading } = useOutboundList({});
  const [pickedId, setPickedId] = useState<string | null>(null);

  if (loading) return <div className="p-8"><LoadingSpinner /></div>;

  if (data.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">법인을 선택하고 출고가 1건 이상 등록되어 있어야 합니다.</p>
      </div>
    );
  }

  const targetId = pickedId ?? data[0].outbound_id;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
        <div className="font-semibold mb-1">PoC · Phase 2.5 — 출고 상세 메타 한계선 데모</div>
        <p>
          OutboundDetailView.tsx (261줄)의 데이터 표시 섹션 5개를 메타로 표현한 결과입니다.
          헤더 워크플로우(취소 처리), 편집 모드 토글, 매출 패널 3 모드, 운송비 패널, 메모 위젯은
          코드 영역으로 분류됩니다 (<code>config/details/outbound_simple.ts</code> 헤더 주석 참조).
        </p>
        <p className="mt-2">
          이 페이지는 데모입니다 — 운영 흐름(<code>/outbound-v2</code> 행 클릭 → 상세)은 기존 OutboundDetailView를 사용합니다.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">표시 출고:</span>
        <select
          className="text-xs border rounded px-2 py-1 bg-background"
          value={targetId}
          onChange={(e) => setPickedId(e.target.value)}
        >
          {data.slice(0, 10).map((ob) => (
            <option key={ob.outbound_id} value={ob.outbound_id}>
              {ob.erp_outbound_no ?? ob.outbound_id.slice(0, 8)} · {ob.product_code ?? '—'}
            </option>
          ))}
        </select>
      </div>

      <MetaDetail
        config={outboundDetailSimpleConfig}
        id={targetId}
        onBack={() => navigate('/outbound-v2')}
      />
    </div>
  );
}
