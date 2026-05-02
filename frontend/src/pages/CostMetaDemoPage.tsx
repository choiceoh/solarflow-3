// Phase 4 보강: 면장 원가(CostForm) 메타 변환 데모
// 가장 복잡한 child 라인 폼 (17 필드 + 4 computed + 3 Stage 섹션) 을 메타로.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import MetaForm from '@/templates/MetaForm';
import costConfig from '@/config/forms/cost';

const DEMO_DECLARATION_ID = 'demo-decl-2026-001';

export default function CostMetaDemoPage() {
  const [open, setOpen] = useState(true);
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSubmitted(data);
    console.log('[cost-meta-demo] submit', data);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
        <div className="font-semibold mb-1">PoC · CostForm 메타 변환 (가장 복잡한 child 라인 폼)</div>
        <p>
          기존 <code>frontend/src/components/customs/CostForm.tsx</code> (249 줄, 직접 zod + 4 자동계산) 를
          <code>config/forms/cost.ts</code> (~120 줄 메타 config) 로 변환.
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-0.5">
          <li><b>3 Stage 섹션</b> (FOB orange / CIF blue / Landed green) — section title + tone</li>
          <li><b>4 computed 필드</b> — 모두 productCacheById 동기 lookup 활용:
            <code>capacity_kw</code>, <code>cif_wp_krw</code>, <code>landed_total_krw</code>, <code>landed_wp_krw</code>
          </li>
          <li><b>numberFormat='krw'</b> — 4 KRW 필드에 천단위 콤마 + '원'</li>
          <li><b>extraPayload.fromContext: ['declaration_id']</b> — 부모 면장 ID 자동 첨가</li>
          <li><b>dialogSize: '2xl'</b> — 큰 다이얼로그 (3 컬럼 행 + 4 섹션)</li>
          <li><b>draftAutoSave</b> — 입력 중 localStorage 저장</li>
        </ul>
        <p className="mt-2">데모 declaration_id: <code>{DEMO_DECLARATION_ID}</code></p>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => { setOpen(true); setSubmitted(null); }}>다이얼로그 다시 열기</Button>
      </div>

      {submitted && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">제출 payload (extraPayload + 4 computed 포함):</p>
          <pre className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs overflow-auto">
{JSON.stringify(submitted, null, 2)}
          </pre>
        </div>
      )}

      <MetaForm
        config={costConfig}
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        extraContext={{ declaration_id: DEMO_DECLARATION_ID }}
      />
    </div>
  );
}
