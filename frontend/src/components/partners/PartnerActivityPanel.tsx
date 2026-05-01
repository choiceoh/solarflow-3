import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import {
  ACTIVITY_KIND_LABEL,
  ACTIVITY_KIND_OPTIONS,
  type ActivityKind,
  type PartnerActivity,
} from '@/types/crm';

interface Props {
  partnerId: string;
}

const KIND_BADGE_VARIANT: Record<ActivityKind, 'default' | 'secondary' | 'outline'> = {
  call: 'default',
  visit: 'secondary',
  email: 'outline',
  memo: 'outline',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function dueLabel(due: string | null): { text: string; tone: 'normal' | 'warn' | 'danger' } {
  if (!due) return { text: '기한 없음', tone: 'normal' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(due + 'T00:00:00');
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { text: `${due} (${-diffDays}일 지남)`, tone: 'danger' };
  if (diffDays === 0) return { text: `${due} (오늘)`, tone: 'warn' };
  return { text: `${due} (D-${diffDays})`, tone: 'normal' };
}

export default function PartnerActivityPanel({ partnerId }: Props) {
  const [items, setItems] = useState<PartnerActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<ActivityKind>('call');
  const [body, setBody] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDue, setFollowUpDue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchWithAuth<PartnerActivity[]>(
        `/api/v1/partners/${partnerId}/activities`,
      );
      setItems(data ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '활동 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    if (partnerId) void refresh();
  }, [partnerId, refresh]);

  const resetForm = () => {
    setBody('');
    setFollowUpRequired(false);
    setFollowUpDue('');
    setKind('call');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!body.trim()) {
      setSubmitError('내용을 입력하세요');
      return;
    }
    if (followUpRequired && !followUpDue) {
      setSubmitError('후속 필요 시 기한을 선택하세요');
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithAuth('/api/v1/partner-activities', {
        method: 'POST',
        body: JSON.stringify({
          partner_id: partnerId,
          kind,
          body: body.trim(),
          follow_up_required: followUpRequired,
          follow_up_due: followUpRequired ? followUpDue : undefined,
        }),
      });
      resetForm();
      await refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '활동 등록에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFollowup = async (id: string, done: boolean) => {
    try {
      await fetchWithAuth(`/api/v1/partner-activities/${id}/followup`, {
        method: 'PATCH',
        body: JSON.stringify({ done }),
      });
      await refresh();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '후속 상태 변경에 실패했습니다');
    }
  };

  return (
    <div className="space-y-6">
      {/* 등록 폼 */}
      <form onSubmit={handleSubmit} className="rounded-md border border-[var(--line)] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as ActivityKind)}>
            <SelectTrigger className="w-28 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_KIND_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">새 활동 기록</span>
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="내용 (예: 단가 문의 — 2025-Q3 25kW 모듈 100장)"
          rows={3}
          maxLength={2000}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={`fu-${partnerId}`} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id={`fu-${partnerId}`}
              checked={followUpRequired}
              onCheckedChange={(checked) => setFollowUpRequired(checked === true)}
            />
            <span>후속 필요</span>
          </label>
          {followUpRequired && (
            <input
              type="date"
              value={followUpDue}
              onChange={(e) => setFollowUpDue(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              required
            />
          )}
          <div className="ml-auto flex items-center gap-2">
            {submitError && <span className="text-xs text-destructive">{submitError}</span>}
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? '등록 중...' : '등록'}
            </Button>
          </div>
        </div>
      </form>

      {/* 타임라인 */}
      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 활동 기록이 없습니다.</p>
        ) : (
          items.map((it) => {
            const due = dueLabel(it.follow_up_due);
            return (
              <div key={it.activity_id} className="rounded-md border border-[var(--line)] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={KIND_BADGE_VARIANT[it.kind]}>
                    {ACTIVITY_KIND_LABEL[it.kind]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTime(it.created_at)}</span>
                  {it.follow_up_required && (
                    <Badge
                      variant={
                        it.follow_up_done
                          ? 'outline'
                          : due.tone === 'danger'
                            ? 'destructive'
                            : due.tone === 'warn'
                              ? 'default'
                              : 'secondary'
                      }
                    >
                      {it.follow_up_done ? `후속 완료` : `후속: ${due.text}`}
                    </Badge>
                  )}
                  {it.follow_up_required && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 px-2 text-xs"
                      onClick={() => toggleFollowup(it.activity_id, !it.follow_up_done)}
                    >
                      {it.follow_up_done ? '미완료로 되돌리기' : '완료 표시'}
                    </Button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{it.body}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
