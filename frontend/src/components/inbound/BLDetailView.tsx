import { useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatDate } from '@/lib/utils';
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

  if (blLoading || !bl) return <LoadingSpinner />;

  const isImport = bl.inbound_type === 'import';

  const handleUpdateBL = async (data: Record<string, unknown>) => {
    await fetchWithAuth(`/api/v1/bls/${blId}`, { method: 'PUT', body: JSON.stringify(data) });
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
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />삭제
        </Button>
      </div>

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
            <Field label="공급사" value={bl.manufacturer_name} />
            <Field label="통화" value={bl.currency === 'USD' ? 'USD (달러)' : 'KRW (원)'} />
            {isImport && <Field label="환율" value={bl.exchange_rate?.toString()} />}
            {isImport && <Field label="ETD" value={formatDate(bl.etd ?? '')} />}
            {isImport && <Field label="ETA" value={formatDate(bl.eta ?? '')} />}
            <Field label={isImport ? '실제입항' : '입고/납품일'} value={formatDate(bl.actual_arrival ?? '')} />
            {isImport && <Field label="항구" value={bl.port} />}
            {isImport && <Field label="포워더" value={bl.forwarder} />}
            {isImport && <Field label="Invoice No." value={bl.invoice_number} />}
            {isImport && <Field label="인코텀즈" value={bl.incoterms} />}
            <Field label="입고 창고" value={bl.warehouse_name} />
            {bl.payment_terms && <Field label="결제조건" value={bl.payment_terms} />}
            {bl.counterpart_company_id && <Field label="상대법인" value={bl.counterpart_company_id} />}
            {bl.memo && <Field label="메모" value={bl.memo} />}
          </div>
        </CardContent>
      </Card>

      <Separator />

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
          onEdit={(line) => { setEditLine(line); setLineFormOpen(true); }}
        />
      )}

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
        description={`"${bl.bl_number}" 입고 건과 연결된 라인아이템이 모두 삭제됩니다. 정말 삭제하시겠습니까?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
