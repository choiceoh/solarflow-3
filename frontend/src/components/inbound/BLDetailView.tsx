import { useState, useEffect } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { formatDate, formatNumber } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import InboundStatusBadge from './InboundStatusBadge';
import StatusChanger from './StatusChanger';
import BLLineTable from './BLLineTable';
import BLLineForm from './BLLineForm';
import LinkedMemoWidget from '@/components/memo/LinkedMemoWidget';
import BLForm from './BLForm';
import { useBLDetail, useBLLines } from '@/hooks/useInbound';
import { fetchWithAuth } from '@/lib/api';
import { INBOUND_TYPE_LABEL, type BLLineItem } from '@/types/inbound';
import type { Manufacturer } from '@/types/masters';
import BLExpensesTab from './BLExpensesTab';

interface Props {
  blId: string;
  onBack: () => void;
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );
}

export default function BLDetailView({ blId, onBack }: Props) {
  const { data: bl, loading: blLoading, reload: reloadBL } = useBLDetail(blId);
  const { data: lines, loading: linesLoading, reload: reloadLines } = useBLLines(blId);
  const [editBLOpen, setEditBLOpen] = useState(false);
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [editLine, setEditLine] = useState<BLLineItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [manufacturerName, setManufacturerName] = useState<string>('');

  // 평탄 응답에는 공급사명이 포함되지 않으므로 별도 조회
  useEffect(() => {
    if (!bl?.manufacturer_id) { setManufacturerName(''); return; }
    if (bl.manufacturer_name) { setManufacturerName(bl.manufacturer_name); return; }
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => {
        const m = list.find((x) => x.manufacturer_id === bl.manufacturer_id);
        setManufacturerName(m?.name_kr ?? '');
      })
      .catch(() => setManufacturerName(''));
  }, [bl?.manufacturer_id, bl?.manufacturer_name]);

  if (blLoading || !bl) return <LoadingSpinner />;

  const isImport = bl.inbound_type === 'import';

  const handleUpdateBL = async (data: Record<string, unknown>) => {
    // bl_id, lines는 PUT 본문에서 제거 (URL 경로 / 별도 엔드포인트)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { bl_id, lines, ...rest } = data;
    void bl_id; void lines;
    await fetchWithAuth(`/api/v1/bls/${blId}`, { method: 'PUT', body: JSON.stringify(rest) });
    reloadBL();
  };

  const handleCreateLine = async (data: Record<string, unknown>) => {
    await fetchWithAuth(`/api/v1/bls/${blId}/lines`, { method: 'POST', body: JSON.stringify(data) });
    reloadLines();
  };

  const handleUpdateLine = async (data: Record<string, unknown>) => {
    if (!editLine) return;
    await fetchWithAuth(`/api/v1/bls/${blId}/lines/${editLine.bl_line_id}`, { method: 'PUT', body: JSON.stringify(data) });
    setEditLine(null);
    reloadLines();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetchWithAuth(`/api/v1/bls/${blId}`, { method: 'DELETE' });
      setDeleteOpen(false);
      onBack();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold flex-1">입고 {bl.bl_number}</h2>
        <StatusChanger blId={blId} currentStatus={bl.status} inboundType={bl.inbound_type} onChanged={reloadBL} />
        <Button variant="outline" size="sm" onClick={() => setEditBLOpen(true)}>
          <Pencil className="mr-1 h-3.5 w-3.5" />수정
        </Button>
        {/* F20: 면장 등록 버튼 삭제 — 면장번호는 BLForm 수정에서 직접 입력 */}
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />삭제
        </Button>
      </div>

      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">기본정보</TabsTrigger>
          <TabsTrigger value="lines">입고품목</TabsTrigger>
          <TabsTrigger value="customs">부대비용 등록</TabsTrigger>
          <TabsTrigger value="outbound">출고추적</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">기본 정보</CardTitle>
                <InboundStatusBadge status={bl.status} />
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                <Field label="입고 구분" value={INBOUND_TYPE_LABEL[bl.inbound_type]} />
                <Field label="공급사" value={manufacturerName || bl.manufacturer_name || '—'} />
                {/* R3-보완2: PO/LC 클릭 시 상세 이동 */}
                {bl.po_id && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">PO번호</p>
                    <button className="text-sm text-primary underline" onClick={() => { window.location.href = `/procurement?po=${bl.po_id}`; }}>{bl.po_number ?? bl.po_id.slice(0, 8)}</button>
                  </div>
                )}
                {bl.lc_id && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">LC번호</p>
                    <button className="text-sm text-primary underline" onClick={() => { window.location.href = `/lc?lc=${bl.lc_id}`; }}>{bl.lc_number ?? bl.lc_id.slice(0, 8)}</button>
                  </div>
                )}
                <Field label="통화" value={bl.currency === 'USD' ? 'USD (달러)' : 'KRW (원)'} />
                {isImport && <Field label="환율" value={bl.exchange_rate?.toString()} />}
                {isImport && <Field label="ETD" value={formatDate(bl.etd ?? '')} />}
                {isImport && <Field label="ETA" value={formatDate(bl.eta ?? '')} />}
                <Field label={isImport ? '실제입항' : '입고/납품일'} value={formatDate(bl.actual_arrival ?? '')} />
                {isImport && <Field label="항구" value={bl.port} />}
                {isImport && <Field label="포워더" value={bl.forwarder} />}
                {isImport && <Field label="Invoice No." value={bl.invoice_number} />}
                {bl.declaration_number && <Field label="면장번호" value={bl.declaration_number} />}
                {isImport && <Field label="인코텀즈" value={bl.incoterms} />}
                <Field label="입고 창고" value={bl.warehouse_name} />
                {bl.payment_terms && <Field label="결제조건" value={bl.payment_terms} />}
                {bl.counterpart_company_id && <Field label="상대법인" value={bl.counterpart_company_id} />}
                {bl.memo && <Field label="메모" value={bl.memo} />}
              </div>
              {lines.length > 0 && (() => {
                const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
                const totalMW = lines.reduce((s, l) => s + (l.capacity_kw ?? 0), 0) / 1000;
                const totalInvoice = lines.reduce((s, l) => s + (l.invoice_amount_usd ?? 0), 0);
                return (
                  <div className="mt-4 pt-3 border-t grid grid-cols-3 gap-x-6">
                    <div>
                      <p className="text-[10px] text-muted-foreground">총 수량</p>
                      <p className="text-sm font-mono font-medium">{formatNumber(totalQty)} EA</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">총 용량</p>
                      <p className="text-sm font-mono font-medium">{totalMW.toFixed(3)} MW</p>
                    </div>
                    {totalInvoice > 0 && (
                      <div>
                        <p className="text-[10px] text-muted-foreground">총 입고금액</p>
                        <p className="text-sm font-mono font-medium">${formatNumber(Math.round(totalInvoice))}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lines">
          <Separator className="my-2" />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">입고 품목</h3>
            <Button size="sm" onClick={() => { setEditLine(null); setLineFormOpen(true); }}>
              <Plus className="mr-1 h-3.5 w-3.5" />추가
            </Button>
          </div>
          {linesLoading ? <LoadingSpinner /> : (
            <BLLineTable
              items={lines}
              currency={bl.currency}
              manufacturerName={manufacturerName || bl.manufacturer_name}
              onEdit={(line) => { setEditLine(line); setLineFormOpen(true); }}
            />
          )}
        </TabsContent>

        <TabsContent value="customs">
          {/* F20: BL 부대비용 등록 (8유형 인라인 + Wp당 자동계산) */}
          <BLExpensesTab blId={blId} lines={lines} />
        </TabsContent>

        <TabsContent value="outbound">
          <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
            출고추적은 Round 4에서 활성화됩니다
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <BLForm open={editBLOpen} onOpenChange={setEditBLOpen} onSubmit={handleUpdateBL} editData={bl} />
      <LinkedMemoWidget linkedTable="bl_shipments" linkedId={blId} />

      <BLLineForm
        open={lineFormOpen}
        onOpenChange={setLineFormOpen}
        onSubmit={editLine ? handleUpdateLine : handleCreateLine}
        editData={editLine}
        blId={blId}
        currency={bl.currency}
        manufacturerId={bl.manufacturer_id}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="입고 삭제"
        description={`"${bl.bl_number}" 입고 건과 연결된 입고품목이 모두 삭제됩니다. 정말 삭제하시겠습니까?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
