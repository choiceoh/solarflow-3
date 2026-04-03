import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        <Card>
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-xs">한도 복원 타임라인</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-1.5">
              {events.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-16 shrink-0">{formatDate(ev.date)}</span>
                  <span className="font-medium">{ev.bank_name}</span>
                  <span className="text-green-600">+{formatUSD(ev.amount)}</span>
                  <span className="text-muted-foreground truncate">({ev.description})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 월별 가용한도 AreaChart */}
      {monthlyProjection.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-xs">월별 가용한도 추이</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyProjection}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(value) => formatUSD(Number(value))} />
                <Area
                  type="monotone"
                  dataKey="projected_available"
                  stroke="#22c55e"
                  fill="#bbf7d0"
                  name="가용한도"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
