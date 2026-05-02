// Phase 4 — Step 3a: BLForm 메타화 데모
// 운영 /inbound 의 BLForm 은 그대로 — 이 데모는 메타 v2 진행 상황 검증.
// Step 3a~3e 가 모두 끝나면 /inbound 에서 메타 v2 로 교체.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import MetaForm from '@/templates/MetaForm';
import config from '@/config/forms/bl';

export default function BLMetaDemoPage() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-base font-semibold">BLForm 메타화 — Step 3a (기본 필드)</h1>
        <p className="text-xs text-muted-foreground mt-1">
          BLForm 의 기본 fields 만 메타로. PO/LC, 입고 품목, OCR, 결제조건 파서는 후속 sub-step.
        </p>
      </div>

      <div className="rounded-md border bg-card p-4 space-y-2 text-xs">
        <div className="font-semibold">진행 상황</div>
        <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
          <li>✅ <strong>3a</strong>: 기본 fields ~10개 (구분/번호/제조사/통화/환율/창고/일정/메모)</li>
          <li>✅ <strong>3b</strong>: 입고 품목 (lines) — child_array (8 자식 필드)</li>
          <li>🟡 <strong>3c</strong>: OCR 위젯 — contentBlock 슬롯 등록 완료, 실 로직 (~700줄) follow-up</li>
          <li>✅ <strong>3d</strong>: PO/LC cascade — pos.import + lcs.byPo master + bl_po_to_lc_mfg cascade</li>
          <li>🟡 <strong>3e</strong>: 결제조건 파서 — contentBlock 슬롯 등록, 파서 (~80줄) follow-up</li>
          <li>⏳ <strong>final</strong>: /inbound 교체 — OCR 실 로직 추출 후 가능</li>
        </ul>
      </div>

      <Button onClick={() => { setOpen(true); setSubmitted(null); }}>
        BLForm 메타 v2 열기
      </Button>

      {submitted && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">제출 payload (저장은 안 함):</p>
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
          console.log('[bl-meta-demo] submitted', data);
        }}
      />
    </div>
  );
}
