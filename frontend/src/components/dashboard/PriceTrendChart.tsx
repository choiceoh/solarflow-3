import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import type { PriceTrend } from '@/types/dashboard';

interface Props {
  data: PriceTrend;
}

export default function PriceTrendChart({ data }: Props) {
  const manufacturers = data.manufacturers || [];
  const [visibleMfgs, setVisibleMfgs] = useState<Set<string>>(
    new Set(manufacturers.slice(0, 5).map((m) => m.name))
  );

  const toggleMfg = (name: string) => {
    setVisibleMfgs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // 모든 period를 X축으로 통합
  const allPeriods = new Set<string>();
  manufacturers.forEach((m) => m.data_points.forEach((dp) => allPeriods.add(dp.period)));
  const periods = Array.from(allPeriods).sort();

  // 차트 데이터: period별로 제조사 가격
  const chartData = periods.map((period) => {
    const row: Record<string, string | number> = { period };
    manufacturers.forEach((m) => {
      if (visibleMfgs.has(m.name)) {
        const dp = m.data_points.find((d) => d.period === period);
        if (dp) row[m.name] = dp.price_usd_wp;
      }
    });
    return row;
  });

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm">단가 추이 (제조사별)</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {/* 제조사 필터 체크박스 */}
        <div className="flex flex-wrap gap-3 mb-3">
          {manufacturers.map((m) => (
            <div key={m.name} className="flex items-center gap-1.5">
              <Checkbox
                id={`mfg-${m.name}`}
                checked={visibleMfgs.has(m.name)}
                onCheckedChange={() => toggleMfg(m.name)}
              />
              <Label htmlFor={`mfg-${m.name}`} className="text-xs cursor-pointer">
                <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: m.color }} />
                {m.name}
              </Label>
            </div>
          ))}
        </div>

        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
            데이터가 없습니다
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
              <Tooltip formatter={(value) => [`$${Number(value).toFixed(4)}/Wp`]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {manufacturers
                .filter((m) => visibleMfgs.has(m.name))
                .map((m) => (
                  <Line
                    key={m.name}
                    type="monotone"
                    dataKey={m.name}
                    stroke={m.color}
                    dot
                    name={m.name}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
