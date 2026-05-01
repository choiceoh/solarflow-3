import { formatUSD, formatDate } from '@/lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TimelineEvent, MonthlyProjection } from '@/types/banking';

interface Props {
  events: TimelineEvent[];
  monthlyProjection: MonthlyProjection[];
}

export default function LimitTimelineView({ events, monthlyProjection }: Props) {
  return (
    <div className="space-y-4">
      {/* 한도 복원 타임라인 이벤트 */}
      {events.length > 0 && (
        <div
          className="rounded-md p-4"
          style={{ background: 'var(--sf-surface)', border: '1px solid var(--sf-line)', boxShadow: 'var(--sf-shadow-1)' }}
        >
          <div className="sf-eyebrow mb-3">한도 복원 타임라인</div>
          <div className="space-y-1.5">
            {events.map((ev, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="sf-mono w-16 shrink-0 tabular-nums" style={{ color: 'var(--sf-ink-3)' }}>{formatDate(ev.date)}</span>
                <span className="font-semibold" style={{ color: 'var(--sf-ink)' }}>{ev.bank_name}</span>
                <span className="sf-mono font-semibold tabular-nums" style={{ color: 'var(--sf-pos)' }}>+{formatUSD(ev.amount)}</span>
                <span className="truncate" style={{ color: 'var(--sf-ink-3)' }}>{ev.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 월별 가용한도 AreaChart */}
      {monthlyProjection.length > 0 && (
        <div
          className="rounded-md p-4"
          style={{ background: 'var(--sf-surface)', border: '1px solid var(--sf-line)', boxShadow: 'var(--sf-shadow-1)' }}
        >
          <div className="sf-eyebrow mb-3">월별 가용한도 추이</div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyProjection}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={(value) => formatUSD(Number(value))} />
              <Area
                type="monotone"
                dataKey="projected_available"
                stroke="var(--sf-pos)"
                fill="var(--sf-pos-bg)"
                fillOpacity={0.6}
                name="가용한도"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
