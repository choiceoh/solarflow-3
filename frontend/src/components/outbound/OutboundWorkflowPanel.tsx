// D-055: 출고 워크플로우 패널.
// 탑솔라 그룹 양식의 체크박스 4개(거래명세서/인수검수요청서/결재요청/계산서발행)를
// 토글하고, 외부 양식 변환 시 보존된 source_payload(원본 행)를 collapsible 로 노출.

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { DetailSection } from '@/components/common/detail';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import type { Outbound } from '@/types/outbound';

interface Props {
  outbound: Outbound;
  onUpdated?: () => void;
}

type WorkflowKey =
  | 'tx_statement_ready'
  | 'inspection_request_sent'
  | 'approval_requested'
  | 'tax_invoice_issued';

const WORKFLOW_LABELS: Array<{ key: WorkflowKey; label: string; sub: string }> = [
  { key: 'tx_statement_ready', label: '거래명세서', sub: '준비 완료' },
  { key: 'inspection_request_sent', label: '인수검수요청서', sub: '발송 완료' },
  { key: 'approval_requested', label: '결재요청', sub: '요청 완료' },
  { key: 'tax_invoice_issued', label: '계산서발행', sub: '발행 완료' },
];

export default function OutboundWorkflowPanel({ outbound, onUpdated }: Props) {
  const [updatingKey, setUpdatingKey] = useState<WorkflowKey | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);

  const sourceEntries = useMemo(() => {
    const sp = outbound.source_payload;
    if (!sp || typeof sp !== 'object') return [];
    return Object.entries(sp);
  }, [outbound.source_payload]);

  const completedCount = WORKFLOW_LABELS.filter((w) => !!outbound[w.key]).length;

  const toggle = async (key: WorkflowKey) => {
    setUpdatingKey(key);
    try {
      const next = !outbound[key];
      await fetchWithAuth(`/api/v1/outbounds/${outbound.outbound_id}`, {
        method: 'PUT',
        body: JSON.stringify({ [key]: next }),
      });
      onUpdated?.();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '워크플로우 상태 변경 실패');
    } finally {
      setUpdatingKey(null);
    }
  };

  return (
    <DetailSection
      title="진행 워크플로우"
      actions={(
        <span className="text-xs text-muted-foreground">
          {completedCount}/{WORKFLOW_LABELS.length} 완료
        </span>
      )}
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {WORKFLOW_LABELS.map(({ key, label, sub }) => {
          const on = !!outbound[key];
          const busy = updatingKey === key;
          return (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => toggle(key)}
              className={cn(
                'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition',
                on
                  ? 'border-[var(--sf-pos)] bg-[var(--sf-pos-bg)]'
                  : 'border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--ink-3)]',
                busy && 'opacity-60',
              )}
            >
              <div className="min-w-0">
                <div className={cn('text-sm font-semibold', on ? 'text-[var(--sf-pos)]' : 'text-[var(--ink)]')}>
                  {label}
                </div>
                <div className="text-[11px] text-[var(--ink-3)]">
                  {on ? sub : '대기 중'}
                </div>
              </div>
              {busy
                ? <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-3)]" />
                : (
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-sm border text-xs font-bold',
                      on
                        ? 'border-[var(--sf-pos)] bg-[var(--sf-pos)] text-white'
                        : 'border-[var(--line)]',
                    )}
                  >
                    {on ? '✓' : ''}
                  </span>
                )}
            </button>
          );
        })}
      </div>

      {sourceEntries.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--bg-2)]">
          <button
            type="button"
            onClick={() => setSourceOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-2)]">
              {sourceOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              외부 양식 원본 ({sourceEntries.length}개 컬럼 보존)
            </span>
            <span className="text-[11px] text-[var(--ink-3)]">변환 추적용 — 정보 손실 0</span>
          </button>
          {sourceOpen && (
            <div className="border-t border-[var(--line)] px-3 py-2">
              <table className="w-full text-xs">
                <tbody>
                  {sourceEntries.map(([k, v]) => (
                    <tr key={k} className="border-b border-[var(--line)] last:border-0">
                      <td className="py-1 pr-3 align-top font-mono text-[var(--ink-3)]">{k}</td>
                      <td className="py-1 align-top text-[var(--ink)]">{formatSourceValue(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </DetailSection>
  );
}

function formatSourceValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
