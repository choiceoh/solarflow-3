import { useState } from 'react';
import { Sparkles, Check, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchWithAuth } from '@/lib/api';
import { formatNumber, formatDate } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';

// 일괄 자동 매칭 (A+B):
//  - B: exact + remainder=0 인 수금은 미리보기 후 사용자 승인 시 자동 INSERT
//  - A: 그 외 후보 있는 수금은 검토 대기 목록으로 표시 (아래 매칭 패널에서 수동 처리)
//  - 후보 없는 수금 건수는 단순 카운트만 표시.

interface AutoMatchedItem {
  receipt_id: string;
  customer_id: string;
  customer_name: string;
  receipt_date: string;
  amount: number;
  outbound_ids: string[];
  total_matched: number;
}

interface AutoMatchCandidate {
  outbound_id: string;
  match_amount: number;
}

interface AutoMatchSuggestion {
  receipt_id: string;
  customer_id: string;
  customer_name: string;
  receipt_date: string;
  amount: number;
  remaining: number;
  match_type: 'exact' | 'closest' | 'single';
  candidates: AutoMatchCandidate[];
  total_suggest: number;
  difference: number;
}

interface AutoMatchResponse {
  auto_matched: AutoMatchedItem[];
  suggestions: AutoMatchSuggestion[];
  no_candidate: number;
  dry_run: boolean;
}

export default function AutoMatchSection() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const queryClient = useQueryClient();

  const [preview, setPreview] = useState<AutoMatchResponse | null>(null);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // /api/v1/assistant/match/receipts/auto: 기존 alias 유지. 실제 처리는 Rust 결정론 추천 기반.
  const callAuto = async (dryRun: boolean): Promise<AutoMatchResponse> => {
    return fetchWithAuth<AutoMatchResponse>('/api/v1/assistant/match/receipts/auto', {
      method: 'POST',
      body: JSON.stringify({ company_id: selectedCompanyId, dry_run: dryRun }),
    });
  };

  const runPreview = async () => {
    if (!selectedCompanyId || busy) return;
    setBusy(true);
    setError(null);
    setApplied(false);
    try {
      const data = await callAuto(true);
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패');
    }
    setBusy(false);
  };

  const apply = async () => {
    if (!selectedCompanyId || busy || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const data = await callAuto(false);
      setPreview(data);
      setApplied(true);
      // 수금/매칭 캐시 무효화 → 아래 ReceiptMatchingPanel 자동 갱신
      await queryClient.invalidateQueries({ queryKey: ['receipts'] });
      await queryClient.invalidateQueries({ queryKey: ['receipt-matches'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : '적용 실패');
    }
    setBusy(false);
  };

  const cancel = () => {
    setPreview(null);
    setApplied(false);
    setError(null);
  };

  if (!selectedCompanyId) return null;

  return (
    <Card className="border-amber-300/60 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-900/10">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            정확 일치 자동 매칭
          </CardTitle>
          {!preview && (
            <Button size="sm" variant="outline" onClick={runPreview} disabled={busy}>
              {busy ? '분석 중…' : '미리보기'}
            </Button>
          )}
          {preview && !applied && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
                취소
              </Button>
              <Button size="sm" onClick={apply} disabled={busy || preview.auto_matched.length === 0}>
                <Check className="mr-1 h-3.5 w-3.5" />
                {busy ? '적용 중…' : `${preview.auto_matched.length}건 적용`}
              </Button>
            </div>
          )}
          {applied && (
            <Button size="sm" variant="outline" onClick={cancel}>
              닫기
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        {error && (
          <div className="mb-3 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!preview && !error && (
          <p className="text-xs text-muted-foreground">
            미매칭 수금 전체를 스캔해서 정확 일치(잔액 0)인 건은 자동으로 매칭 후보로, 그 외 근접 후보는 검토 목록으로 보여드립니다.
            적용 전 미리보기로 확인할 수 있습니다.
          </p>
        )}

        {preview && (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap gap-3">
              <Stat label="자동 매칭 가능" value={preview.auto_matched.length} tone="pos" />
              <Stat label="검토 필요" value={preview.suggestions.length} tone="warn" />
              <Stat label="후보 없음" value={preview.no_candidate} tone="muted" />
              {applied && <span className="text-emerald-700 dark:text-emerald-400">✓ 적용 완료</span>}
            </div>

            {preview.auto_matched.length > 0 && (
              <Section title={applied ? '자동 매칭 완료' : '자동 매칭 예정'} tone="pos">
                <ul className="space-y-1">
                  {preview.auto_matched.map((it) => (
                    <li key={it.receipt_id} className="flex justify-between gap-2 border-b border-emerald-200/40 py-1 last:border-0 dark:border-emerald-800/30">
                      <span className="truncate">
                        {formatDate(it.receipt_date)} · {it.customer_name || '—'}
                      </span>
                      <span className="mono shrink-0 text-emerald-700 dark:text-emerald-400">
                        {formatNumber(it.total_matched)}원 ({it.outbound_ids.length}건)
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {preview.suggestions.length > 0 && (
              <Section title="검토 필요 (아래 매칭 패널에서 수동 확정)" tone="warn">
                <ul className="space-y-1">
                  {preview.suggestions.map((s) => (
                    <li key={s.receipt_id} className="flex justify-between gap-2 border-b border-amber-200/40 py-1 last:border-0 dark:border-amber-800/30">
                      <span className="truncate">
                        {formatDate(s.receipt_date)} · {s.customer_name || '—'}
                        <span className="ml-1 text-muted-foreground">({s.match_type})</span>
                      </span>
                      <span className="mono shrink-0">
                        {formatNumber(s.amount)}원 / 후보 {s.candidates.length}건
                        {s.difference !== 0 && ` · 차액 ${formatNumber(s.difference)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'pos' | 'warn' | 'muted' }) {
  const color =
    tone === 'pos'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'warn'
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-muted-foreground';
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${color}`}>{value}건</span>
    </div>
  );
}

function Section({ title, tone, children }: { title: string; tone: 'pos' | 'warn'; children: React.ReactNode }) {
  const border = tone === 'pos' ? 'border-emerald-300/40 bg-emerald-50/40 dark:border-emerald-800/30 dark:bg-emerald-950/20'
    : 'border-amber-300/40 bg-amber-50/30 dark:border-amber-800/30 dark:bg-amber-950/10';
  return (
    <div className={`rounded-md border px-3 py-2 ${border}`}>
      <div className="mb-1 text-[11px] font-medium text-foreground/80">{title}</div>
      {children}
    </div>
  );
}
