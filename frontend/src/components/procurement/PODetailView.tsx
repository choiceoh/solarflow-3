import { useState } from 'react';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn, formatDate } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import POForm from './POForm';
import POLineTable from './POLineTable';
import POLineForm from './POLineForm';
import LinkedMemoWidget from '@/components/memo/LinkedMemoWidget';
import POInboundProgress from './POInboundProgress';
import { fetchWithAuth } from '@/lib/api';
import { usePOLines, useLCList, useTTList } from '@/hooks/useProcurement';
import { PO_STATUS_LABEL, PO_STATUS_COLOR, CONTRACT_TYPE_LABEL, type PurchaseOrder, type POLineItem, type LCRecord, type TTRemittance } from '@/types/procurement';
import { LC_STATUS_LABEL, LC_STATUS_COLOR, TT_STATUS_LABEL, TT_STATUS_COLOR } from '@/types/procurement';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatUSD, formatNumber } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';

interface Props { po: PurchaseOrder; onBack: () => void; onReload: () => void; }

function Field({ label, value }: { label: string; value: string | undefined }) {
  return <div><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-sm">{value || '—'}</p></div>;
}

function LCSubTable({ items }: { items: LCRecord[] }) {
  if (items.length === 0) return <EmptyState message="연결된 LC가 없습니다" />;
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="text-xs">
        <TableHeader><TableRow>
          <TableHead>LC번호</TableHead><TableHead>은행</TableHead><TableHead>개설일</TableHead>
          <TableHead className="text-right">금액(USD)</TableHead><TableHead>만기일</TableHead><TableHead>상태</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map((lc) => (
            <TableRow key={lc.lc_id}>
              <TableCell className="font-mono">{lc.lc_number || '—'}</TableCell>
              <TableCell>{lc.bank_name ?? '—'}</TableCell>
              <TableCell>{formatDate(lc.open_date ?? '')}</TableCell>
              <TableCell className="text-right">{formatUSD(lc.amount_usd)}</TableCell>
              <TableCell>{formatDate(lc.maturity_date ?? '')}</TableCell>
              <TableCell><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', LC_STATUS_COLOR[lc.status])}>{LC_STATUS_LABEL[lc.status]}</span></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TTSubTable({ items, poLines }: { items: TTRemittance[]; poLines: POLineItem[] }) {
  if (items.length === 0) return <EmptyState message="연결된 TT가 없습니다" />;
  const totalUsd = items.reduce((s, t) => s + t.amount_usd, 0);
  // 송금비율: TT합계 / PO 라인아이템 총액 합계
  const poTotalUsd = poLines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
  const remitRatio = poTotalUsd > 0 ? (totalUsd / poTotalUsd) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-x-auto">
        <Table className="text-xs">
          <TableHeader><TableRow>
            <TableHead>송금일</TableHead><TableHead className="text-right">금액(USD)</TableHead>
            <TableHead className="text-right">원화</TableHead><TableHead className="text-right">환율</TableHead>
            <TableHead>목적</TableHead><TableHead>상태</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((tt) => (
              <TableRow key={tt.tt_id}>
                <TableCell>{formatDate(tt.remit_date ?? '')}</TableCell>
                <TableCell className="text-right">{formatUSD(tt.amount_usd)}</TableCell>
                <TableCell className="text-right">{tt.amount_krw != null ? `${formatNumber(tt.amount_krw)}원` : '—'}</TableCell>
                <TableCell className="text-right">{tt.exchange_rate?.toFixed(2) ?? '—'}</TableCell>
                <TableCell>{tt.purpose ?? '—'}</TableCell>
                <TableCell><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', TT_STATUS_COLOR[tt.status])}>{TT_STATUS_LABEL[tt.status]}</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>TT 합계: {formatUSD(totalUsd)}</span>
        <span>송금비율: {remitRatio.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export default function PODetailView({ po, onBack, onReload }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [editLine, setEditLine] = useState<POLineItem | null>(null);
  const { data: lines, loading: linesLoading, reload: reloadLines } = usePOLines(po.po_id);
  const { data: lcs, loading: lcsLoading } = useLCList({ po_id: po.po_id });
  const { data: tts, loading: ttsLoading } = useTTList({ po_id: po.po_id });

  const handleUpdatePO = async (data: Record<string, unknown>) => {
    await fetchWithAuth(`/api/v1/pos/${po.po_id}`, { method: 'PUT', body: JSON.stringify(data) });
    onReload();
  };

  const handleCreateLine = async (data: Record<string, unknown>) => {
    await fetchWithAuth(`/api/v1/pos/${po.po_id}/lines`, { method: 'POST', body: JSON.stringify(data) });
    reloadLines();
  };
  const handleUpdateLine = async (data: Record<string, unknown>) => {
    if (!editLine) return;
    await fetchWithAuth(`/api/v1/pos/${po.po_id}/lines/${editLine.po_line_id}`, { method: 'PUT', body: JSON.stringify(data) });
    setEditLine(null); reloadLines();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <h2 className="text-base font-semibold flex-1">PO {po.po_number || '—'}</h2>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', PO_STATUS_COLOR[po.status])}>{PO_STATUS_LABEL[po.status]}</span>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="mr-1 h-3.5 w-3.5" />수정</Button>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">기본정보</TabsTrigger>
          <TabsTrigger value="lines">라인아이템</TabsTrigger>
          <TabsTrigger value="lc">LC현황</TabsTrigger>
          <TabsTrigger value="tt">TT이력</TabsTrigger>
          <TabsTrigger value="inbound">입고현황</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card><CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              <Field label="계약유형" value={CONTRACT_TYPE_LABEL[po.contract_type]} />
              <Field label="제조사" value={po.manufacturer_name} />
              <Field label="계약일" value={formatDate(po.contract_date ?? '')} />
              <Field label="Incoterms" value={po.incoterms} />
              <Field label="결제조건" value={po.payment_terms} />
              {po.total_qty != null && <Field label="총수량" value={formatNumber(po.total_qty).toString()} />}
              {po.memo && <Field label="메모" value={po.memo} />}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="lines">
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setEditLine(null); setLineFormOpen(true); }}><Plus className="mr-1 h-3.5 w-3.5" />추가</Button>
            </div>
            {linesLoading ? <LoadingSpinner /> : <POLineTable items={lines} onEdit={(l) => { setEditLine(l); setLineFormOpen(true); }} />}
          </div>
        </TabsContent>

        <TabsContent value="lc">{lcsLoading ? <LoadingSpinner /> : <LCSubTable items={lcs} />}</TabsContent>
        <TabsContent value="tt">{ttsLoading ? <LoadingSpinner /> : <TTSubTable items={tts} poLines={lines} />}</TabsContent>
        <TabsContent value="inbound"><POInboundProgress poId={po.po_id} poLines={lines} /></TabsContent>
      </Tabs>

      <LinkedMemoWidget linkedTable="purchase_orders" linkedId={po.po_id} />

      <POForm open={editOpen} onOpenChange={setEditOpen} onSubmit={handleUpdatePO} editData={po} />
      <POLineForm open={lineFormOpen} onOpenChange={setLineFormOpen} onSubmit={editLine ? handleUpdateLine : handleCreateLine} editData={editLine} poId={po.po_id} />
    </div>
  );
}
