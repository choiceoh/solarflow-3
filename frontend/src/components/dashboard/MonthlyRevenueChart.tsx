import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { formatKRW } from '@/lib/utils';
import type { MonthlyRevenue } from '@/types/dashboard';

interface Props {
  data: MonthlyRevenue;
}

export default function MonthlyRevenueChart({ data }: Props) {
  const months = data.months || [];

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm">월별 매출/마진</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {months.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
            데이터가 없습니다
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={months}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => `${(v / 100000000).toFixed(0)}억`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                formatter={(value, name) => {
                  const v = Number(value);
                  if (name === '마진율') return [`${v.toFixed(1)}%`, name];
                  return [formatKRW(v), name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="revenue_krw" fill="#3b82f6" name="매출" />
              <Bar yAxisId="left" dataKey="margin_krw" fill="#22c55e" name="마진" />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="margin_rate"
                stroke="#ef4444"
                strokeDasharray="5 5"
                dot={{ r: 3 }}
                name="마진율"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
