// Phase 4 보강: 면장 상세 메타 한계선 데모
// 면장 목록 첫 항목을 가져와 MetaDetail로 렌더링한다.
// 실제 운영용 DeclarationDetailView는 그대로 유지 (워크플로우/원가/landed cost가 코드 영역).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeclarationList } from '@/hooks/useCustoms';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import MetaDetail from '@/templates/MetaDetail';
import declarationDetailSimpleConfig from '@/config/details/declaration_simple';

export default function DeclarationDetailMetaDemoPage() {
  const navigate = useNavigate();
  const { data, loading } = useDeclarationList({});
  const [pickedId, setPickedId] = useState<string | null>(null);

  if (loading) return <div className="p-8"><LoadingSpinner /></div>;

  if (data.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">면장이 1건 이상 등록되어 있어야 합니다.</p>
      </div>
    );
  }

  const targetId = pickedId ?? data[0].declaration_id;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
        <div className="font-semibold mb-1">PoC · Phase 4 보강 — 면장 상세 메타 한계선 데모</div>
        <p>
          DeclarationDetailView.tsx (199줄)의 면장 기본정보 카드를 메타로 표현한 결과입니다.
          헤더 워크플로우(수정·삭제), 원가 라인아이템(CostTable + CostForm),
          Landed Cost 계산 패널, 첨부 메모 위젯은 코드 영역으로 분류됩니다
          (<code>config/details/declaration_simple.ts</code> 헤더 주석 참조).
        </p>
        <p className="mt-2">
          이 페이지는 데모입니다 — 운영 흐름(<code>/customs</code> 행 클릭 → 상세)은 기존 DeclarationDetailView를 사용합니다.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">표시 면장:</span>
        <select
          className="text-xs border rounded px-2 py-1 bg-background"
          value={targetId}
          onChange={(e) => setPickedId(e.target.value)}
        >
          {data.slice(0, 10).map((d) => (
            <option key={d.declaration_id} value={d.declaration_id}>
              {d.declaration_number ?? d.declaration_id.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>

      <MetaDetail
        config={declarationDetailSimpleConfig}
        id={targetId}
        onBack={() => navigate('/customs')}
      />
    </div>
  );
}
