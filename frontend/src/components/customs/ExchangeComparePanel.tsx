import { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatNumber, formatKRW, formatPercent } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useExchangeCompare } from '@/hooks/useExchange';

// 비유: 환율 비교는 두 환전소에서 같은 달러를 바꿨을 때 원화 차이를 보여주는 것
export default function ExchangeComparePanel() {
  const [amountUsd, setAmountUsd] = useState('');
  const [rate1, setRate1] = useState('');
  const [rate2, setRate2] = useState('');
  const { result, loading, error, compare } = useExchangeCompare();

  const handleCompare = () => {
    const amt = parseFloat(amountUsd);
    const r1 = parseFloat(rate1);
    const r2 = parseFloat(rate2);
    if (amt > 0 && r1 > 0 && r2 > 0) {
      compare(amt, r1, r2);
    }
  };

  const canCompare = parseFloat(amountUsd) > 0 && parseFloat(rate1) > 0 && parseFloat(rate2) > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">환율 비교 (Rust API 연동)</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <Label>금액 (USD)</Label>
              <Input
                type="number"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder="100000"
                min={0}
                step="0.01"
              />
            </div>
            <div>
              <Label>환율 1</Label>
              <Input
                type="number"
                value={rate1}
                onChange={(e) => setRate1(e.target.value)}
                placeholder="1350.00"
                min={0}
                step="0.01"
              />
            </div>
            <div>
              <Label>환율 2</Label>
              <Input
                type="number"
                value={rate2}
                onChange={(e) => setRate2(e.target.value)}
                placeholder="1380.00"
                min={0}
                step="0.01"
              />
            </div>
          </div>
          <Button onClick={handleCompare} disabled={loading || !canCompare}>
            <ArrowRightLeft className="mr-1.5 h-4 w-4" />비교
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading && <LoadingSpinner />}

      {result && result.comparisons && result.comparisons.length > 0 && (
        <Card>
          <CardContent className="px-4 py-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>항목</TableHead>
                  <TableHead className="text-right">환율1 결과</TableHead>
                  <TableHead className="text-right">환율2 결과</TableHead>
                  <TableHead className="text-right">차이</TableHead>
                  <TableHead className="text-right">차이율</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.comparisons.map((c, i) => {
                  // 양수=빨간(원화부담 증가), 음수=초록(감소)
                  const diffColor = c.difference > 0
                    ? 'text-red-600 font-medium'
                    : c.difference < 0
                    ? 'text-green-600 font-medium'
                    : '';

                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs">${formatNumber(c.amount)}</TableCell>
                      <TableCell className="text-xs text-right">{formatKRW(c.rate1_result)}</TableCell>
                      <TableCell className="text-xs text-right">{formatKRW(c.rate2_result)}</TableCell>
                      <TableCell className={`text-xs text-right ${diffColor}`}>
                        {c.difference > 0 ? '+' : ''}{formatKRW(c.difference)}
                      </TableCell>
                      <TableCell className={`text-xs text-right ${diffColor}`}>
                        {c.difference_percent > 0 ? '+' : ''}{formatPercent(c.difference_percent)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
