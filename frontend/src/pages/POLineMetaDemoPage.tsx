// Phase 4 보강: PO 라인 메타 폼 데모 페이지
// 기존 POLineForm.tsx (102 줄) 를 메타 config (~55 줄) 로 변환했음을 입증.
// 부모 PO 의 po_id 를 extraContext 로 전달 → payload 에 자동 첨가.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import MetaForm from '@/templates/MetaForm';
import poLineConfig from '@/config/forms/po_line';

const DEMO_PO_ID = 'demo-po-2026-001';

export default function POLineMetaDemoPage() {
  const [open, setOpen] = useState(true);
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  const handleSubmit = async (data: Record<string, unknown>) => {
    // 데모: 콘솔 로그 + UI 표시. 실제 운영에선 fetchWithAuth POST.
    setSubmitted(data);
    console.log('[po-line-meta-demo] submit', data);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
        <div className="font-semibold mb-1">PoC · POLineForm 메타 변환</div>
        <p>
          기존 <code>frontend/src/components/procurement/POLineForm.tsx</code> (102 줄, 직접 zod) 를
          <code>config/forms/po_line.ts</code> (~55 줄 메타 config) 로 변환.
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-0.5">
          <li><b>extraPayload.fromContext: ['po_id']</b> — 페이지가 props 로 주입한 PO ID 가 payload 에 자동 첨가</li>
          <li><b>products.search masterSource</b> — 디바운스 combobox + resolveLabel + 부수효과로 product 캐시</li>
          <li><b>computed total_amount_usd</b> — quantity × spec_wp × unit_price_usd, dependsOn 변경 시 재계산</li>
          <li>spec_wp 는 <code>productCacheById</code> 에서 동기 lookup (combobox load/search 가 캐시 채움)</li>
        </ul>
        <p className="mt-2">데모 PO ID: <code>{DEMO_PO_ID}</code> (실제 운영에선 <code>/procurement/PO/:id</code> 페이지가 props 로 전달)</p>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => { setOpen(true); setSubmitted(null); }}>다이얼로그 다시 열기</Button>
      </div>

      {submitted && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">제출 payload (extraPayload 포함):</p>
          <pre className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs overflow-auto">
{JSON.stringify(submitted, null, 2)}
          </pre>
        </div>
      )}

      <MetaForm
        config={poLineConfig}
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        extraContext={{ po_id: DEMO_PO_ID }}
      />
    </div>
  );
}
