import { useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatDate, formatNumber, formatKw } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import OutboundStatusBadge from './OutboundStatusBadge';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import OutboundCancelFlow from './OutboundCancelFlow';
import OutboundForm from './OutboundForm';
import SaleForm from './SaleForm';
import LinkedMemoWidget from '@/components/memo/LinkedMemoWidget';
import { useOutboundDetail } from '@/hooks/useOutbound';
import { fetchWithAuth } from '@/lib/api';
import { USAGE_CATEGORY_LABEL } from '@/types/outbound';

interface Props {
  outboundId: string;
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

export default function OutboundDetailView({ outboundId, onBack }: Props) {
  const { data: ob, loading, reload } = useOutboundDetail(outboundId);
  const [editOpen, setEditOpen] = useState(false);
  const [saleFormOpen, setSaleFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading || !ob) return <LoadingSpinner />;

  const isCancelled = ob.status === 'cancelled';

  const handleUpdate = async (data: Record<string, unknown>) => {
    await fetchWithAuth(`/api/v1/outbounds/${outboundId}`, { method: 'PUT', body: JSON.stringify(data) });
    reload();
  };

  const handleSaleSubmit = async (data: Record<string, unknown>) => {
    if (ob.sale) {
      await fetchWithAuth(`/api/v1/sales/${ob.sale.sale_id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await fetchWithAuth('/api/v1/sales', { method: 'POST', body: JSON.stringify(data) });
    }
    reload();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetchWithAuth(`/api/v1/outbounds/${outboundId}`, { method: 'DELETE' });
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
        <h2 className="text-base font-semibold flex-1">출고 상세</h2>
        <OutboundCancelFlow outboundId={outboundId} currentStatus={ob.status} onChanged={reload} />
        {!isCancelled && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" />수정
          </Button>
        )}
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />삭제
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">출고 정보</CardTitle>
            <OutboundStatusBadge status={ob.status} />
            <InvoiceStatusBadge outbound={ob} />
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="출고일" value={formatDate(ob.outbound_date)} />
            <Field label="품번" value={ob.product_code} />
            <Field label="품명" value={ob.product_name} />
            <Field label="규격" value={ob.spec_wp ? `${ob.spec_wp}Wp` : undefined} />
            <Field label="수량" value={formatNumber(ob.quantity)} />
            <Field label="용량" value={formatKw(ob.capacity_kw)} />
            <Field label="창고" value={ob.warehouse_name} />
            <Field label="용도" value={USAGE_CATEGORY_LABEL[ob.usage_category] ?? ob.usage_category} />
            <Field label="현장명" value={ob.site_name} />
            <Field label="현장 주소" value={ob.site_address} />
            <Field label="수주연결" value={ob.order_number} />
            <Field label="스페어" value={ob.spare_qty?.toString()} />
            {ob.group_trade && (
              <>
                <Field label="그룹거래" value="그룹내 거래" />
                <Field label="상대법인" value={ob.target_company_name} />
              </>
            )}
            <Field label="ERP 출고번호" value={ob.erp_outbound_no} />
            {ob.memo && <Field label="메모" value={ob.memo} />}
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">매출 정보</h3>
        {!isCancelled && (
          <Button size="sm" onClick={() => setSaleFormOpen(true)}>
            {ob.sale ? (
              <><Pencil className="mr-1 h-3.5 w-3.5" />매출 수정</>
            ) : (
              <><Plus className="mr-1 h-3.5 w-3.5" />매출 등록</>
            )}
          </Button>
        )}
      </div>

      {ob.sale ? (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              <Field label="거래처" value={ob.sale.customer_name} />
              <Field label="Wp단가" value={ob.sale.unit_price_wp ? `${formatNumber(ob.sale.unit_price_wp)}원/Wp` : undefined} />
              <Field label="EA단가" value={ob.sale.unit_price_ea ? `${formatNumber(ob.sale.unit_price_ea)}원` : undefined} />
              <Field label="공급가" value={ob.sale.supply_amount ? `${formatNumber(ob.sale.supply_amount)}원` : undefined} />
              <Field label="부가세" value={ob.sale.vat_amount ? `${formatNumber(ob.sale.vat_amount)}원` : undefined} />
              <Field label="합계" value={ob.sale.total_amount ? `${formatNumber(ob.sale.total_amount)}원` : undefined} />
              <Field label="계산서 발행일" value={ob.sale.tax_invoice_date ? formatDate(ob.sale.tax_invoice_date) : undefined} />
              <Field label="계산서 이메일" value={ob.sale.tax_invoice_email} />
              <Field label="ERP 마감" value={ob.sale.erp_closed ? `마감 (${formatDate(ob.sale.erp_closed_date ?? '')})` : '미마감'} />
              {ob.sale.memo && <Field label="메모" value={ob.sale.memo} />}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          등록된 매출 정보가 없습니다
        </div>
      )}

      {!isCancelled && (
        <OutboundForm open={editOpen} onOpenChange={setEditOpen} onSubmit={handleUpdate} editData={ob} />
      )}
      <LinkedMemoWidget linkedTable="outbounds" linkedId={outboundId} />

      {!isCancelled && (
        <SaleForm
          open={saleFormOpen}
          onOpenChange={setSaleFormOpen}
          onSubmit={handleSaleSubmit}
          outbound={ob}
          editData={ob.sale ?? null}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="출고 삭제"
        description="이 출고 건과 연결된 매출 정보가 모두 삭제됩니다. 정말 삭제하시겠습니까?"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
