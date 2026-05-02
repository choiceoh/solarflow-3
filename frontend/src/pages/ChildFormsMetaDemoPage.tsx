// Phase 4 보강: 남은 child 폼 일괄 메타 변환 데모
// BLLineForm + ReceiptForm + DeclarationForm — 같은 인프라 패턴 재사용.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import MetaForm from '@/templates/MetaForm';
import blLineConfig from '@/config/forms/bl_line';
import receiptConfig from '@/config/forms/receipt';
import declarationConfig from '@/config/forms/declaration';

const DEMO_BL_ID = 'bl-demo-001';

type FormKey = 'bl_line' | 'receipt' | 'declaration';

const FORM_LABELS: Record<FormKey, string> = {
  bl_line: 'BL 라인 아이템 (BLLineForm 변환)',
  receipt: '수금 (ReceiptForm 변환)',
  declaration: '면장 (DeclarationForm 변환)',
};

const ORIGINAL_LINES: Record<FormKey, number> = {
  bl_line: 225,
  receipt: 135,
  declaration: 159,
};

const META_LINES: Record<FormKey, number> = {
  bl_line: 70,
  receipt: 50,
  declaration: 65,
};

export default function ChildFormsMetaDemoPage() {
  const [openForm, setOpenForm] = useState<FormKey | null>(null);
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSubmitted(data);
    console.log('[child-forms-meta-demo] submit', data);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
        <div className="font-semibold mb-1">PoC · 남은 child 폼 일괄 메타 변환</div>
        <p>
          POLineForm, CostForm 에 이어 BLLineForm + ReceiptForm + DeclarationForm 까지 메타화. 같은 인프라 패턴 재사용:
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-0.5">
          <li><b>extraPayload</b> — fromContext (bl_id) / fromStore (company_id) / static (usage_category)</li>
          <li><b>masterSource</b> — products.search (combobox), partners.customer (load), bls.byCompany (NEW)</li>
          <li><b>computed</b> — bl_line capacity_kw (cost_capacity_kw 재사용)</li>
          <li><b>numberFormat='krw'</b> — receipt amount</li>
          <li><b>@today</b> — receipt_date, declaration_date 기본값</li>
          <li><b>section title/tone</b> — declaration 일정 (solar) / 분류 정보 (info)</li>
        </ul>
      </div>

      <div className="rounded-md border bg-card p-5 space-y-2">
        <h2 className="text-sm font-semibold">3 폼 코드 비교</h2>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground border-b">
            <tr>
              <th className="text-left py-1.5 pr-3 font-medium">폼</th>
              <th className="text-right py-1.5 pr-3 font-medium">기존 zod</th>
              <th className="text-right py-1.5 pr-3 font-medium">메타 config</th>
              <th className="text-right py-1.5 font-medium">절감</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(FORM_LABELS) as FormKey[]).map((k) => {
              const reduction = Math.round((1 - META_LINES[k] / ORIGINAL_LINES[k]) * 100);
              return (
                <tr key={k} className="border-b border-border/40">
                  <td className="py-1.5 pr-3">{FORM_LABELS[k]}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{ORIGINAL_LINES[k]} 줄</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">~{META_LINES[k]} 줄</td>
                  <td className="py-1.5 text-right tabular-nums text-emerald-700 font-medium">−{reduction}%</td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="py-1.5 pr-3">합계</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{ORIGINAL_LINES.bl_line + ORIGINAL_LINES.receipt + ORIGINAL_LINES.declaration} 줄</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">~{META_LINES.bl_line + META_LINES.receipt + META_LINES.declaration} 줄</td>
              <td className="py-1.5 text-right tabular-nums text-emerald-700">
                −{Math.round((1 - (META_LINES.bl_line + META_LINES.receipt + META_LINES.declaration) / (ORIGINAL_LINES.bl_line + ORIGINAL_LINES.receipt + ORIGINAL_LINES.declaration)) * 100)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(FORM_LABELS) as FormKey[]).map((k) => (
          <Button key={k} size="sm" onClick={() => { setOpenForm(k); setSubmitted(null); }}>
            {FORM_LABELS[k]} 열기
          </Button>
        ))}
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
        config={blLineConfig}
        open={openForm === 'bl_line'}
        onOpenChange={(o) => { if (!o) setOpenForm(null); }}
        onSubmit={handleSubmit}
        extraContext={{ bl_id: DEMO_BL_ID }}
      />
      <MetaForm
        config={receiptConfig}
        open={openForm === 'receipt'}
        onOpenChange={(o) => { if (!o) setOpenForm(null); }}
        onSubmit={handleSubmit}
      />
      <MetaForm
        config={declarationConfig}
        open={openForm === 'declaration'}
        onOpenChange={(o) => { if (!o) setOpenForm(null); }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
