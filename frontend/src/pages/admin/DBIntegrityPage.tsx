import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Sparkles, RefreshCw, Database, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithAuth, streamFetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';

// D-064 PR 37: 운영자 전용 DB 정합성 검증 + 로컬 AI 분석.
// /api/v1/admin/db-integrity 응답 구조 (admin_db_integrity.go).

interface IntegrityCheck {
  category: string;
  severity: 'high' | 'med' | 'low';
  name: string;
  description: string;
  baseline?: number;
  actual: number;
  tolerance: number;
  status: 'pass' | 'warn' | 'fail';
  hint?: string;
}

interface IntegrityResponse {
  checks: IntegrityCheck[];
  summary: {
    high_fails: number;
    med_fails: number;
    low_fails: number;
    total_fails: number;
    total: number;
  };
  generated_at: string;
}

const SEVERITY_LABEL: Record<string, string> = { high: '치명', med: '주의', low: '참고' };
const SEVERITY_BADGE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  med: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};
const STATUS_ICON = (status: string) =>
  status === 'fail' ? (
    <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
  ) : (
    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
  );

export default function DBIntegrityPage() {
  const [data, setData] = useState<IntegrityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI 분석 상태
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithAuth<IntegrityResponse>('/api/v1/admin/db-integrity');
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : '검증 실행 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // 로컬 AI 로 결과 분석 — assistant chat API SSE 스트림 사용.
  const analyzeWithAI = async () => {
    if (!data) return;
    setAiBusy(true);
    setAiError(null);
    setAiText('');

    const failedChecks = data.checks.filter((c) => c.status === 'fail');
    const prompt = buildAIPrompt(data, failedChecks);

    try {
      const res = await streamFetchWithAuth('/api/v1/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`AI 호출 실패 ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let collected = '';
      // Vercel AI SDK 형식 SSE: 각 line `0:"text"\n` 식. 단순 텍스트 추출.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          // `0:"foo"` 형식의 텍스트 청크만 발췌
          const m = line.match(/^0:"((?:\\.|[^"\\])*)"/);
          if (m) {
            collected += m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
            setAiText(collected);
          }
        }
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI 분석 실패');
    } finally {
      setAiBusy(false);
    }
  };

  if (loading && !data) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!data) return null;

  const grouped = groupByCategory(data.checks);
  const { summary } = data;

  return (
    <div className="space-y-4 p-4">
      {/* 헤더 + 요약 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <Database className="h-4 w-4" />
            DB 정합성
          </h1>
          <p className="text-xs text-muted-foreground">
            운영 데이터의 회귀/손실/정합성을 자동 검증. 결과를 로컬 AI 가 해석.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          재검증
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCard label="치명" value={summary.high_fails} total={countSeverity(data.checks, 'high')} tone="red" />
        <SummaryCard label="주의" value={summary.med_fails} total={countSeverity(data.checks, 'med')} tone="amber" />
        <SummaryCard label="참고" value={summary.low_fails} total={countSeverity(data.checks, 'low')} tone="slate" />
        <SummaryCard label="전체" value={summary.total_fails} total={summary.total} tone={summary.high_fails > 0 ? 'red' : summary.total_fails > 0 ? 'amber' : 'green'} />
      </div>

      {/* AI 분석 카드 */}
      <div className="rounded-md border bg-blue-50/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bot className="h-4 w-4 text-blue-700" />
            로컬 AI 분석
          </div>
          <Button size="sm" variant={aiText ? 'outline' : 'default'} onClick={analyzeWithAI} disabled={aiBusy || data.checks.length === 0}>
            <Sparkles className={`mr-1 h-3.5 w-3.5 ${aiBusy ? 'animate-pulse' : ''}`} />
            {aiBusy ? '분석 중…' : aiText ? '다시 분석' : 'AI 분석'}
          </Button>
        </div>
        {aiError && <div className="mb-2 text-xs text-red-700">{aiError}</div>}
        {aiText ? (
          <pre className="whitespace-pre-wrap break-words text-xs text-slate-700">{aiText}</pre>
        ) : aiBusy ? (
          <div className="text-xs text-muted-foreground">AI 가 결과를 분석 중…</div>
        ) : (
          <div className="text-xs text-muted-foreground">
            'AI 분석' 클릭 → 검증 결과 + 위반 항목을 로컬 모델이 요약/권장 조치 제공.
          </div>
        )}
      </div>

      {/* 검증 결과 — 카테고리별 */}
      {Array.from(grouped.entries()).map(([category, items]) => (
        <div key={category} className="rounded-md border">
          <div className="border-b bg-muted/30 px-3 py-2 text-xs font-semibold">{category}</div>
          <div className="divide-y">
            {items.map((c) => (
              <CheckRow key={c.name} c={c} />
            ))}
          </div>
        </div>
      ))}

      <div className="text-right text-[11px] text-muted-foreground">
        검증 시각: {new Date(data.generated_at).toLocaleString('ko-KR')}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'red' | 'amber' | 'slate' | 'green' }) {
  const colorMap = {
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    green: 'border-green-200 bg-green-50 text-green-700',
  };
  return (
    <div className={`rounded border p-2 ${colorMap[tone]}`}>
      <div className="text-xs font-medium">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {value} <span className="text-xs font-normal opacity-60">/ {total}</span>
      </div>
    </div>
  );
}

function CheckRow({ c }: { c: IntegrityCheck }) {
  return (
    <div className={`flex items-start gap-3 px-3 py-2 ${c.status === 'fail' ? 'bg-red-50/40' : ''}`}>
      <div className="mt-0.5">{STATUS_ICON(c.status)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{c.name}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_BADGE[c.severity]}`}>{SEVERITY_LABEL[c.severity]}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">{c.description}</div>
        {c.status === 'fail' && c.hint && (
          <div className="mt-1 text-[11px] text-amber-700">▸ {c.hint}</div>
        )}
      </div>
      <div className="text-right text-xs tabular-nums">
        <div className="font-mono">
          {c.actual.toLocaleString('ko-KR')}
          {c.baseline != null && (
            <span className="text-muted-foreground"> / {c.baseline.toLocaleString('ko-KR')}</span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground">±{(c.tolerance * 100).toFixed(0)}%</div>
      </div>
    </div>
  );
}

function groupByCategory(checks: IntegrityCheck[]): Map<string, IntegrityCheck[]> {
  const map = new Map<string, IntegrityCheck[]>();
  for (const c of checks) {
    if (!map.has(c.category)) map.set(c.category, []);
    map.get(c.category)!.push(c);
  }
  return map;
}

function countSeverity(checks: IntegrityCheck[], severity: string): number {
  return checks.filter((c) => c.severity === severity).length;
}

function buildAIPrompt(data: IntegrityResponse, failed: IntegrityCheck[]): string {
  return `너는 SolarFlow ERP 의 데이터 정합성 분석가다. 아래 검증 결과를 보고:
1. 각 위반 항목의 심각도와 가능한 원인을 한국어로 요약
2. 운영자가 즉시 취해야 할 조치를 우선순위 순으로 제안
3. 회귀 가능성 (이전 정상 → 현재 위반) 으로 보이는 패턴은 별도 강조

검증 시각: ${data.generated_at}
전체: ${data.summary.total} / 위반: ${data.summary.total_fails} (치명 ${data.summary.high_fails} · 주의 ${data.summary.med_fails} · 참고 ${data.summary.low_fails})

위반 항목:
${
  failed.length === 0
    ? '없음 — 모든 검증 통과'
    : failed
        .map(
          (c, i) =>
            `${i + 1}. [${c.severity}] ${c.name} (${c.category})
   - ${c.description}
   - 실제: ${c.actual} / 기대: ${c.baseline ?? '-'} (±${(c.tolerance * 100).toFixed(0)}%)
   - 힌트: ${c.hint ?? '없음'}`,
        )
        .join('\n')
}

위반이 0건이면 단순히 "모든 검증 통과 — 데이터 정합성 양호" 라고만 답하라.
500자 이내, 한국어, 운영자 보고서 톤.`;
}
