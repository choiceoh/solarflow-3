// Phase 4 — Step 3 prep 인프라 통합 데모
// child_array (#269) + contentBlock 슬롯 (#268) + fieldCascade (#272) 한 폼에서 검증.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import MetaForm from '@/templates/MetaForm';
import config from '@/config/forms/meta_features_demo';

export default function MetaFeaturesDemoPage() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-base font-semibold">메타 인프라 통합 데모 (Step 3 prep)</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Step 3 (BLForm 메타화) 진입 전 깔린 3 인프라가 합쳐서 동작하는지 검증.
        </p>
      </div>

      <div className="rounded-md border bg-card p-4 space-y-2 text-xs">
        <div className="font-semibold">검증 항목</div>
        <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
          <li><strong>fieldCascade (#272)</strong> — PO 선택 → 제조사 / 통화 자동 fill</li>
          <li><strong>contentBlock 슬롯 (#268)</strong> — 폼 안에 watch() 로 라이브 위젯 임베드</li>
          <li><strong>child_array (#269)</strong> — 입고 라인 행별 add/remove + zod 검증</li>
        </ul>
      </div>

      <Button onClick={() => { setOpen(true); setSubmitted(null); }}>
        데모 폼 열기
      </Button>

      {submitted && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">제출 payload:</p>
          <pre className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs overflow-auto">
{JSON.stringify(submitted, null, 2)}
          </pre>
        </div>
      )}

      <MetaForm
        config={config}
        open={open}
        onOpenChange={(o) => { if (!o) setOpen(false); }}
        onSubmit={async (data) => {
          setSubmitted(data);
          setOpen(false);
          console.log('[meta-features-demo] submitted', data);
        }}
      />
    </div>
  );
}
