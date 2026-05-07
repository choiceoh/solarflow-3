import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/api';
import { ACTIVITY_KIND_LABEL, type OpenFollowup } from '@/types/crm';

function dueDescriptor(due: string | null): { text: string; tone: 'normal' | 'warn' | 'danger' } {
  if (!due) return { text: '기한 없음', tone: 'normal' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(due + 'T00:00:00');
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { text: `${due} · ${-diffDays}일 지남`, tone: 'danger' };
  if (diffDays === 0) return { text: `${due} · 오늘`, tone: 'warn' };
  return { text: `${due} · D-${diffDays}`, tone: 'normal' };
}

export default function CRMInboxPage() {
  const [items, setItems] = useState<OpenFollowup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWithAuth<OpenFollowup[]>('/api/v1/me/open-followups');
      setItems(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '미처리 문의를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markDone = async (id: string) => {
    try {
      await fetchWithAuth(`/api/v1/partner-activities/${id}/followup`, {
        method: 'PATCH',
        body: JSON.stringify({ done: true }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '완료 처리에 실패했습니다');
    }
  };

  return (
    <div className="sf-page">
      <div className="sf-page-header">
        <div className="min-w-0">
          <div className="sf-eyebrow">CRM</div>
          <h1 className="sf-page-title flex items-center gap-2">
            <Inbox className="h-5 w-5" /> 내 미처리 문의
          </h1>
          <p className="sf-page-description">
            내가 등록한 활동 중 후속 답변이 필요한 항목입니다. 완료하면 목록에서 사라집니다.
          </p>
        </div>
      </div>

      <div className="card mx-auto w-full max-w-3xl p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            🎉 미처리 문의가 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => {
              const due = dueDescriptor(it.follow_up_due);
              return (
                <li
                  key={it.activity_id}
                  className="rounded-md border border-[var(--line)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {it.partner ? (
                      <Link
                        to={`/data/partners/${it.partner.partner_id}/edit?tab=activity`}
                        className="text-sm font-medium hover:underline inline-flex items-center gap-1"
                      >
                        {it.partner.partner_name}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-muted-foreground">(거래처 미상)</span>
                    )}
                    <Badge variant="secondary">{ACTIVITY_KIND_LABEL[it.kind]}</Badge>
                    <Badge
                      variant={
                        due.tone === 'danger'
                          ? 'destructive'
                          : due.tone === 'warn'
                            ? 'default'
                            : 'outline'
                      }
                    >
                      {due.text}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="ml-auto h-7 px-2 text-xs"
                      onClick={() => markDone(it.activity_id)}
                    >
                      완료
                    </Button>
                  </div>
                  <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {it.body}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
