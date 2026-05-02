// Phase 4 보강: MetaForm 의존성·동적 옵션 데모 페이지
// 두 기능 동시 시연:
//   1) visibleIf — 의존성 필드 (has_warranty 체크 시 warranty_months 노출)
//   2) optionsDependsOn — 동적 옵션 (domestic_filter 값에 따라 manufacturer_id 옵션 변경)
//
// 저장 흐름은 콘솔 로그로만 — 실 데이터 저장 없음 (UI 데모 전용).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import MetaForm from '@/templates/MetaForm';
import depsDemoConfig from '@/config/forms/deps_demo';

export default function MetaFormDepsDemoPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSubmitted(data);
    console.log('[deps-demo] submit', data);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
        <div className="font-semibold mb-1">PoC · Phase 4 보강 — MetaForm 의존성·동적 옵션 데모</div>
        <p>
          MetaForm 두 인프라 기능을 한 폼에서 시연합니다:
        </p>
        <ul className="mt-2 list-disc pl-4 space-y-1">
          <li><b>visibleIf</b> — "보증 포함" 스위치 ON 시 "보증 개월 수" 필드 노출</li>
          <li><b>optionsDependsOn</b> — "제조사 범위" 변경 시 "제조사" 셀렉트 옵션이 즉시 필터됨
            (master 소스 <code>manufacturers.byDomestic</code> 가 context.domestic_foreign 으로 분기)</li>
        </ul>
        <p className="mt-2">제출은 콘솔 로그만 — 저장 없음.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => { setOpen(true); setSubmitted(null); }}>다이얼로그 다시 열기</Button>
        <Button size="sm" variant="outline" onClick={() => navigate('/')}>홈</Button>
      </div>

      {submitted && (
        <pre className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs overflow-auto">
{JSON.stringify(submitted, null, 2)}
        </pre>
      )}

      <MetaForm
        config={depsDemoConfig}
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
