import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Database,
  Bot,
  EyeOff,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchWithAuth, streamFetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';

// D-064 PR 37/38/39 + PR 091.
// - 집계 검증 (v_integrity_check / mv_integrity_check): 위반 건수 카운트.
// - 개별 이상치 (v_db_anomalies + anomaly_ignores): 어떤 row 가 의심인지 노출.

const SEVERITY_LABEL: Record<string, string> = { high: '치명', med: '주의', low: '참고' };
const SEVERITY_BADGE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  med: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

export default function DBIntegrityPage() {
  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="flex items-center gap-2 text-base font-semibold">
          <Database className="h-4 w-4" />
          DB 정합성
        </h1>
        <p className="text-xs text-muted-foreground">
          운영 데이터의 회귀/손실/정합성을 자동 검증. 결과를 로컬 AI 가 해석.
        </p>
      </header>

      <Tabs defaultValue="aggregate">
        <TabsList variant="line">
          <TabsTrigger value="aggregate">집계 검증</TabsTrigger>
          <TabsTrigger value="row-level">개별 이상치</TabsTrigger>
          <TabsTrigger value="trend">추세</TabsTrigger>
        </TabsList>
        <TabsContent value="aggregate" className="mt-4">
          <AggregateIntegrityView />
        </TabsContent>
        <TabsContent value="row-level" className="mt-4">
          <RowLevelAnomaliesView />
        </TabsContent>
        <TabsContent value="trend" className="mt-4">
          <AnomalyTrendView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// 집계 검증 (PR 37/38/39) — 기존 로직
// ============================================================

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

function AggregateIntegrityView() {
  const [data, setData] = useState<IntegrityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI 분석 상태
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
    );
  }
  if (!data) return null;

  const grouped = groupByCategory(data.checks);
  const { summary } = data;

  return (
    <div className="space-y-4">
      {/* 헤더 + 재검증 버튼 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          v_integrity_check 50+ 검증 통합 view → mv_integrity_check 캐시.
        </p>
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
      <div className="mt-0.5">
        {c.status === 'fail' ? (
          <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
        )}
      </div>
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

// ============================================================
// 개별 이상치 (PR 091) — row 단위 SQL 룰 + 무시 목록
// ============================================================

interface AnomalyRow {
  rule_name: string;
  severity: 'high' | 'med' | 'low';
  category: string;
  table_name: string;
  row_pk: string;
  row_label: string;
  description: string;
  detail: Record<string, unknown> | null;
}

interface AnomalyResponse {
  anomalies: AnomalyRow[];
  summary: { high: number; med: number; low: number; total: number };
  generated_at: string;
}

function RowLevelAnomaliesView() {
  const [data, setData] = useState<AnomalyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithAuth<AnomalyResponse>('/api/v1/admin/db-anomalies');
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : '이상치 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ignoreRow = async (a: AnomalyRow) => {
    const key = anomalyKey(a);
    setBusyKey(key);
    try {
      await fetchWithAuth('/api/v1/admin/db-anomalies/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: a.table_name,
          row_pk: a.row_pk,
          rule_name: a.rule_name,
        }),
      });
      // 즉시 목록에서 제거 (다음 조회까지 기다리지 않음)
      setData((prev) =>
        prev
          ? {
              ...prev,
              anomalies: prev.anomalies.filter((x) => anomalyKey(x) !== key),
              summary: recountSummary(prev.anomalies.filter((x) => anomalyKey(x) !== key)),
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '무시 등록 실패');
    } finally {
      setBusyKey(null);
    }
  };

  if (loading && !data) return <LoadingSpinner />;
  if (error && !data) {
    return <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  }
  if (!data) return null;

  const grouped = groupAnomaliesByCategory(data.anomalies);

  return (
    <div className="space-y-4">
      {/* 헤더 + 재검사 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          v_db_anomalies — 개별 row 단위 이상치. 판매가 0, 단가 누락, 산식 mismatch 등.
          "정상" 으로 표시한 row 는 다음 조회부터 자동 제외됩니다.
        </p>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          재검사
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}

      {/* 요약 */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCard label="치명" value={data.summary.high} total={data.summary.high} tone="red" />
        <SummaryCard label="주의" value={data.summary.med} total={data.summary.med} tone="amber" />
        <SummaryCard label="참고" value={data.summary.low} total={data.summary.low} tone="slate" />
        <SummaryCard
          label="전체"
          value={data.summary.total}
          total={data.summary.total}
          tone={data.summary.high > 0 ? 'red' : data.summary.total > 0 ? 'amber' : 'green'}
        />
      </div>

      {data.anomalies.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          개별 이상치 없음 — 모든 row 정상.
        </div>
      ) : (
        Array.from(grouped.entries()).map(([category, items]) => (
          <AnomalyCategoryBlock
            key={category}
            category={category}
            items={items}
            busyKey={busyKey}
            onIgnore={ignoreRow}
          />
        ))
      )}

      <IgnoreListSection onUnignore={load} />

      <div className="text-right text-[11px] text-muted-foreground">
        검사 시각: {new Date(data.generated_at).toLocaleString('ko-KR')}
      </div>
    </div>
  );
}

interface IgnoreEntry {
  ignore_id: number;
  table_name: string;
  row_pk: string;
  rule_name: string;
  reason?: string;
  ignored_by?: string;
  ignored_at: string;
}

interface IgnoreListResponse {
  ignores: IgnoreEntry[];
  total: number;
}

// "정상" 으로 잘못 표시한 row 를 해제할 수 있는 섹션.
// 기본 접힘 — count 만 헤더에 노출. 펼쳐야 목록 로드 (불필요한 호출 방지).
function IgnoreListSection({ onUnignore }: { onUnignore: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<IgnoreListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyID, setBusyID] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithAuth<IgnoreListResponse>('/api/v1/admin/db-anomalies/ignores');
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : '무시 목록 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !data) void load();
  }, [open, data, load]);

  const unignore = async (entry: IgnoreEntry) => {
    setBusyID(entry.ignore_id);
    try {
      await fetchWithAuth(`/api/v1/admin/db-anomalies/ignore/${entry.ignore_id}`, {
        method: 'DELETE',
      });
      setData((prev) =>
        prev
          ? {
              ignores: prev.ignores.filter((i) => i.ignore_id !== entry.ignore_id),
              total: prev.total - 1,
            }
          : prev,
      );
      onUnignore();
    } catch (e) {
      setError(e instanceof Error ? e.message : '해제 실패');
    } finally {
      setBusyID(null);
    }
  };

  const count = data?.total ?? 0;

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="font-semibold">무시 목록</span>
        {data && (
          <span className="text-muted-foreground">· {count}건</span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          "정상" 처리한 row — 해제하면 다음 검사부터 다시 검출됩니다
        </span>
      </button>

      {open && (
        <div className="border-t">
          {loading && !data ? (
            <div className="p-3 text-xs text-muted-foreground">로딩 중…</div>
          ) : error ? (
            <div className="p-3 text-xs text-red-700">{error}</div>
          ) : !data || data.ignores.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">무시 목록이 비어 있습니다.</div>
          ) : (
            <div className="divide-y">
              {data.ignores.map((e) => (
                <div key={e.ignore_id} className="flex items-start gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{e.rule_name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {e.table_name} / {e.row_pk.slice(0, 8)}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      등록: {new Date(e.ignored_at).toLocaleString('ko-KR')}
                      {e.reason && ` · ${e.reason}`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyID === e.ignore_id}
                    onClick={() => unignore(e)}
                    title="무시 해제 — 다음 검사부터 다시 표시"
                  >
                    {busyID === e.ignore_id ? '...' : '해제'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnomalyCategoryBlock({
  category,
  items,
  busyKey,
  onIgnore,
}: {
  category: string;
  items: AnomalyRow[];
  busyKey: string | null;
  onIgnore: (a: AnomalyRow) => void;
}) {
  // 같은 rule_name 끼리 묶어서 한 번에 펼침/접기.
  const byRule = useMemo(() => groupAnomaliesByRule(items), [items]);
  return (
    <div className="rounded-md border">
      <div className="border-b bg-muted/30 px-3 py-2 text-xs font-semibold">{category}</div>
      <div className="divide-y">
        {Array.from(byRule.entries()).map(([ruleName, rows]) => (
          <AnomalyRuleBlock
            key={ruleName}
            ruleName={ruleName}
            rows={rows}
            busyKey={busyKey}
            onIgnore={onIgnore}
          />
        ))}
      </div>
    </div>
  );
}

function AnomalyRuleBlock({
  ruleName,
  rows,
  busyKey,
  onIgnore,
}: {
  ruleName: string;
  rows: AnomalyRow[];
  busyKey: string | null;
  onIgnore: (a: AnomalyRow) => void;
}) {
  const [open, setOpen] = useState(rows.length <= 5);
  const first = rows[0];
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/40"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="mt-0.5">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{ruleName}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_BADGE[first.severity]}`}>
              {SEVERITY_LABEL[first.severity]}
            </span>
            <span className="text-[11px] text-muted-foreground">· {rows.length}건</span>
          </div>
          <div className="text-[11px] text-muted-foreground">{first.description}</div>
        </div>
      </button>
      {open && (
        <div className="divide-y border-t bg-slate-50/40">
          {rows.map((a) => (
            <AnomalyRowItem
              key={anomalyKey(a)}
              a={a}
              busy={busyKey === anomalyKey(a)}
              onIgnore={onIgnore}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// row 의 listing/detail 페이지로 가는 링크. 매핑이 없으면 null (clickable 안 됨).
// focus_* 파라미터는 해당 페이지가 처리 안 해도 안전 — URL 만 깨끗하게 유지될 뿐.
function anomalyDetailHref(a: AnomalyRow): string | null {
  switch (a.table_name) {
    case 'sales':
      return `/orders?tab=sales&focus_sale_id=${encodeURIComponent(a.row_pk)}`;
    case 'outbounds':
      return `/orders?tab=outbound&focus_outbound_id=${encodeURIComponent(a.row_pk)}`;
    case 'products':
      return `/data/products/${encodeURIComponent(a.row_pk)}/edit`;
    case 'import_declarations':
      return `/customs?focus_declaration_id=${encodeURIComponent(a.row_pk)}`;
    default:
      // inbounds, fifo_matches 는 명확한 단일 listing 페이지가 없어 일단 미연결.
      return null;
  }
}

function AnomalyRowItem({
  a,
  busy,
  onIgnore,
}: {
  a: AnomalyRow;
  busy: boolean;
  onIgnore: (a: AnomalyRow) => void;
}) {
  const href = anomalyDetailHref(a);
  return (
    <div className="flex items-start gap-3 px-3 py-2 pl-8">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {href ? (
            <Link
              to={href}
              className="text-sm font-medium text-blue-700 hover:underline inline-flex items-center gap-1"
              title="세부 페이지로 이동"
            >
              {a.row_label}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Link>
          ) : (
            <span className="text-sm font-medium">{a.row_label}</span>
          )}
          <span className="font-mono text-[10px] text-muted-foreground">
            {a.table_name} / {a.row_pk.slice(0, 8)}
          </span>
        </div>
        {a.detail && Object.keys(a.detail).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-slate-600">
            {Object.entries(a.detail).map(([k, v]) => (
              <span key={k}>
                <span className="text-muted-foreground">{k}:</span> {formatDetailValue(v)}
              </span>
            ))}
          </div>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => onIgnore(a)}
        title="이 row 를 무시 목록에 추가 — 다음 검사부터 표시 안 함"
      >
        <EyeOff className="mr-1 h-3.5 w-3.5" />
        {busy ? '...' : '정상'}
      </Button>
    </div>
  );
}

function anomalyKey(a: AnomalyRow): string {
  return `${a.table_name}|${a.row_pk}|${a.rule_name}`;
}

function groupAnomaliesByCategory(rows: AnomalyRow[]): Map<string, AnomalyRow[]> {
  const map = new Map<string, AnomalyRow[]>();
  for (const a of rows) {
    if (!map.has(a.category)) map.set(a.category, []);
    map.get(a.category)!.push(a);
  }
  return map;
}

function groupAnomaliesByRule(rows: AnomalyRow[]): Map<string, AnomalyRow[]> {
  const map = new Map<string, AnomalyRow[]>();
  for (const a of rows) {
    if (!map.has(a.rule_name)) map.set(a.rule_name, []);
    map.get(a.rule_name)!.push(a);
  }
  return map;
}

function recountSummary(rows: AnomalyRow[]): AnomalyResponse['summary'] {
  const s = { high: 0, med: 0, low: 0, total: rows.length };
  for (const a of rows) {
    if (a.severity === 'high') s.high++;
    else if (a.severity === 'med') s.med++;
    else if (a.severity === 'low') s.low++;
  }
  return s;
}

function formatDetailValue(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'number') return v.toLocaleString('ko-KR');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

// ============================================================
// 추세 그래프 (PR 후속 — D-20260512-171222 룰 6)
// ============================================================
// 운영 cron 이 매일 캡처한 db_anomaly_snapshots 의 룰별 일별 카운트를
// line chart 로 표시. 룰이 늘어나도 별도 wiring 불필요 — 서버 응답을 그대로
// 룰별 series 로 변환.

interface SnapshotRow {
  rule_name: string;
  severity: 'high' | 'med' | 'low';
  category: string;
  taken_date: string; // YYYY-MM-DD
  count: number;
}

interface SnapshotsResponse {
  snapshots: SnapshotRow[];
  days: number;
  generated_at: string;
}

const RULE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#0ea5e9', '#6366f1'];

function AnomalyTrendView() {
  const [data, setData] = useState<SnapshotRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchWithAuth<SnapshotsResponse>(
        `/api/v1/admin/db-anomalies/snapshots?days=${days}`,
      );
      setData(r.snapshots);
    } catch (e) {
      console.error(e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  // 룰별 series + x축 날짜 통합
  const { series, dates, rules } = useMemo(() => {
    if (!data) return { series: {}, dates: [] as string[], rules: [] as string[] };
    const dateSet = new Set<string>();
    const ruleSet = new Set<string>();
    const series: Record<string, Record<string, number>> = {};
    for (const r of data) {
      dateSet.add(r.taken_date);
      ruleSet.add(r.rule_name);
      series[r.rule_name] = series[r.rule_name] ?? {};
      series[r.rule_name][r.taken_date] = r.count;
    }
    return {
      series,
      dates: Array.from(dateSet).sort(),
      rules: Array.from(ruleSet).sort(),
    };
  }, [data]);

  const chartData = useMemo(() => {
    return dates.map((d) => {
      const row: Record<string, string | number> = { date: d };
      for (const r of rules) {
        row[r] = series[r]?.[d] ?? 0;
      }
      return row;
    });
  }, [dates, rules, series]);

  if (loading) return <LoadingSpinner />;
  if (!data || data.length === 0) {
    return (
      <div className="rounded border border-dashed border-slate-200 p-6 text-center text-xs text-muted-foreground">
        아직 일별 snapshot 데이터가 없습니다. 운영 cron 이 매일 자동으로 캡처합니다.
        <br />수동 1회 호출:{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">SELECT snapshot_db_anomalies()</code>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">기간:</span>
        {[7, 14, 30, 60, 90].map((d) => (
          <Button
            key={d}
            size="sm"
            variant={days === d ? 'default' : 'outline'}
            className="h-6 px-2 text-xs"
            onClick={() => setDays(d)}
          >
            {d}일
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-3 w-3" />새로고침
        </Button>
      </div>

      <AnomalyTrendChart data={chartData} rules={rules} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {rules.map((rule, i) => {
          const latest = chartData.at(-1)?.[rule];
          const previous = chartData.at(-2)?.[rule];
          const latestN = typeof latest === 'number' ? latest : 0;
          const prevN = typeof previous === 'number' ? previous : 0;
          const delta = latestN - prevN;
          return (
            <div key={rule} className="rounded border border-slate-200 p-2 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: RULE_COLORS[i % RULE_COLORS.length] }}
                />
                <span className="font-medium">{rule}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-base font-semibold">{latestN.toLocaleString('ko-KR')}</span>
                <span
                  className={
                    delta > 0
                      ? 'text-xs text-red-600'
                      : delta < 0
                        ? 'text-xs text-emerald-600'
                        : 'text-xs text-muted-foreground'
                  }
                >
                  {delta > 0 ? `+${delta}` : delta < 0 ? delta : '±0'} vs 전날
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnomalyTrendChart({ data, rules }: { data: Array<Record<string, string | number>>; rules: string[] }) {
  // Recharts 를 lazy import 로 — 추세 탭 들어갔을 때만 번들 로드.
  const [recharts, setRecharts] = useState<typeof import('recharts') | null>(null);
  useEffect(() => {
    let active = true;
    void import('recharts').then((mod) => {
      if (active) setRecharts(mod);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!recharts) return <div className="h-64 animate-pulse rounded bg-slate-50" />;

  const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = recharts;

  return (
    <div className="rounded border border-slate-200 p-2">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: '4px 8px' }}
            labelStyle={{ fontWeight: 600 }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {rules.map((rule, i) => (
            <Line
              key={rule}
              type="monotone"
              dataKey={rule}
              stroke={RULE_COLORS[i % RULE_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
