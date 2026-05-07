// AI 어시스턴트 Provider 설정 카드 (D-064 PR 40).
// 운영자가 primary/fallback provider+model 을 GUI 로 변경.
// system_settings 의 'assistant.providers' key 에 저장.
import { useCallback, useEffect, useState } from 'react';
import { Bot, Save, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';

interface ProviderConfig {
  provider: string;
  model: string;
}

interface AssistantProvidersValue {
  primary?: ProviderConfig;
  fallback?: ProviderConfig;
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: '로컬 vLLM (localhost:8000)' },
  { value: 'anthropic', label: 'Z.AI (api.z.ai)' },
];

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  openai: ['qwen3.6-35b-a3b'],
  anthropic: ['glm-5.1', 'glm-4.6', 'claude-sonnet-4-5'],
};

const DEFAULTS: Record<string, string> = {
  openai: 'qwen3.6-35b-a3b',
  anthropic: 'glm-5.1',
};

export default function AssistantProvidersCard() {
  const [primary, setPrimary] = useState<ProviderConfig>({ provider: 'openai', model: 'qwen3.6-35b-a3b' });
  const [fallback, setFallback] = useState<ProviderConfig>({ provider: 'anthropic', model: 'glm-5.1' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/system-settings/assistant.providers', {
        credentials: 'include',
        headers: await getAuthHeaders(),
      });
      if (res.status === 204) {
        // 미설정 — env 기본값 표시 (운영 현재 상태와 일치하도록 추정)
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const v = (await res.json()) as AssistantProvidersValue;
      if (v.primary) setPrimary({ provider: v.primary.provider || 'openai', model: v.primary.model || '' });
      if (v.fallback) setFallback({ provider: v.fallback.provider || 'anthropic', model: v.fallback.model || '' });
    } catch {
      // 미설정 또는 에러 — 기본값 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await fetchWithAuth('/api/v1/system-settings/assistant.providers', {
        method: 'PUT',
        body: JSON.stringify({ primary, fallback }),
      });
      notify.success('AI Provider 설정 저장됨 — 다음 채팅부터 적용 (최대 60초)');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  // provider 변경 시 model 도 default 로 reset
  const setPrimaryProvider = (p: string) => {
    setPrimary({ provider: p, model: DEFAULTS[p] ?? '' });
  };
  const setFallbackProvider = (p: string) => {
    setFallback({ provider: p, model: DEFAULTS[p] ?? '' });
  };

  return (
    <div className="rounded-lg border bg-card p-7 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <p className="text-lg font-medium">AI Provider 설정</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        primary 가 인프라 에러(타임아웃·5xx) 시 fallback 으로 자동 전환. 변경 후 최대 60초 내 backend 캐시 갱신.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <ProviderSection
          title="Primary (기본)"
          tone="green"
          config={primary}
          onProviderChange={setPrimaryProvider}
          onModelChange={(m) => setPrimary({ ...primary, model: m })}
        />
        <ProviderSection
          title="Fallback (폴백)"
          tone="amber"
          config={fallback}
          onProviderChange={setFallbackProvider}
          onModelChange={(m) => setFallback({ ...fallback, model: m })}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>

      <div className="rounded border bg-muted/40 p-3 text-xs">
        <p className="font-medium">현재 설정 미리보기:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
          <li>1차: <span className="font-mono">{primary.provider}</span> / <span className="font-mono">{primary.model || '(default)'}</span></li>
          <li>2차: <span className="font-mono">{fallback.provider}</span> / <span className="font-mono">{fallback.model || '(default)'}</span></li>
        </ul>
      </div>
    </div>
  );
}

function ProviderSection({
  title,
  tone,
  config,
  onProviderChange,
  onModelChange,
}: {
  title: string;
  tone: 'green' | 'amber';
  config: ProviderConfig;
  onProviderChange: (p: string) => void;
  onModelChange: (m: string) => void;
}) {
  const toneClass = tone === 'green' ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50';
  const suggestions = MODEL_SUGGESTIONS[config.provider] ?? [];
  return (
    <div className={`rounded border p-3 ${toneClass}`}>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="space-y-2">
        <div>
          <Label className="text-xs">Provider</Label>
          <Select value={config.provider} onValueChange={(v) => { if (v != null) onProviderChange(v); }}>
            <SelectTrigger className="mt-1 h-8 text-xs">
              <span className="truncate">{PROVIDER_OPTIONS.find((p) => p.value === config.provider)?.label ?? config.provider}</span>
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Model</Label>
          <Input
            value={config.model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder={DEFAULTS[config.provider] ?? ''}
            className="mt-1 h-8 text-xs font-mono"
            list={`models-${tone}`}
          />
          <datalist id={`models-${tone}`}>
            {suggestions.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
      </div>
    </div>
  );
}

// 인증 헤더 가져오기 — fetchWithAuth 의 일부 로직과 동일 패턴
async function getAuthHeaders(): Promise<HeadersInit> {
  const { supabase } = await import('@/lib/supabase');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
