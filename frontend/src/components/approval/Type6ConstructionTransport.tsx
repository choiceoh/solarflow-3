// 유형 6: 공사 현장 운송료 — 기간 → 공사 출고 조회 → 운송비 수동 입력 → 텍스트 생성
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useType6 } from '@/hooks/useApproval';
import { generateType6 } from '@/lib/approvalTemplates';

interface Props { onGenerate: (text: string) => void }

function defaultFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function Type6ConstructionTransport({ onGenerate }: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const { data, setData, loading, generate } = useType6();

  const updateItem = useCallback((index: number, field: 'transportCost' | 'memo', value: number | string) => {
    if (!data) return;
    const newItems = [...data.items];
    if (field === 'transportCost') {
      newItems[index] = { ...newItems[index], transportCost: value as number };
    } else {
      newItems[index] = { ...newItems[index], memo: value as string };
    }
    const total = newItems.reduce((s, i) => s + i.transportCost, 0);
    setData({ ...data, items: newItems, totalTransport: total });
  }, [data, setData]);

  const handleGenerate = useCallback(() => {
    if (data) onGenerate(generateType6(data));
  }, [data, onGenerate]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>시작일</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>종료일</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <Button onClick={() => generate(from, to)} disabled={loading} size="sm">
        {loading ? '조회 중...' : '데이터 조회'}
      </Button>
      {data && data.items.length > 0 && (
        <div className="space-y-2">
          <Label>현장별 운송비 <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 ml-1">[수동 입력]</span></Label>
          <div className="border rounded divide-y text-sm">
            <div className="grid grid-cols-5 gap-2 px-3 py-1.5 bg-muted/50 font-medium text-xs">
              <span>현장</span><span>품번</span><span>수량</span><span>운송비</span><span>비고</span>
            </div>
            {data.items.map((item, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 px-3 py-1.5 items-center">
                <span className="text-xs truncate">{item.siteName}</span>
                <span className="text-xs truncate">{item.productName}</span>
                <span className="text-xs">{item.quantity}장</span>
                <Input
                  type="number"
                  className="h-7 text-xs bg-yellow-50 border-yellow-200"
                  value={item.transportCost || ''}
                  onChange={(e) => updateItem(i, 'transportCost', Number(e.target.value))}
                  placeholder="0"
                />
                <Input
                  type="text"
                  className="h-7 text-xs bg-yellow-50 border-yellow-200"
                  value={item.memo}
                  onChange={(e) => updateItem(i, 'memo', e.target.value)}
                  placeholder="비고"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">총 운송료: {data.totalTransport.toLocaleString()}원</p>
          <Button onClick={handleGenerate} size="sm" variant="outline">결재안 생성</Button>
        </div>
      )}
      {data && data.items.length === 0 && (
        <p className="text-xs text-muted-foreground">해당 기간에 공사 출고 데이터가 없습니다.</p>
      )}
    </div>
  );
}
