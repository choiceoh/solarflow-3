import { useState, useEffect } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatDate, formatNumber, formatKw } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { DetailSection, DetailField, DetailFieldGrid } from '@/components/common/detail';
import OutboundStatusBadge from './OutboundStatusBadge';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import OutboundCancelFlow from './OutboundCancelFlow';
import OutboundForm from './OutboundForm';
import SaleForm from './SaleForm';
import LinkedMemoWidget from '@/components/memo/LinkedMemoWidget';
import OutboundTransportCostPanel from './OutboundTransportCostPanel';
import { useOutboundDetail } from '@/hooks/useOutbound';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import { USAGE_CATEGORY_LABEL } from '@/types/outbound';
import type { BLShipment, BLLineItem } from '@/types/inbound';

interface Props {
  outboundId: string;
  onBack: () => void;
}

export default function OutboundDetailView({ outboundId, onBack }: Props) {
  const { data: ob, loading, reload } = useOutboundDetail(outboundId);
  const [editingOutbound, setEditingOutbound] = useState(false);
  const [editingSale, setEditingSale] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [avgCostPerWp, setAvgCostPerWp] = useState<number | null>(null);

  useEffect(() => {
    if (!ob?.bl_items?.length || !ob.product_id) { setAvgCostPerWp(null); return; }
    let cancelled = false;
    Promise.all(
      ob.bl_items.map(async (item) => {
        const [bl, lines] = await Promise.all([
          fetchWithAuth<BLShipment>(`/api/v1/bls/${item.bl_id}`),
          fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${item.bl_id}/lines`),
        ]);
        const isImport = bl.inbound_type === 'import';
        const exRate = bl.exchange_rate ?? 0;
        const matchingLines = lines.filter((l) => l.product_id === ob.product_id);
        let totalCostWp = 0, totalQty = 0;
        for (const line of matchingLines) {
          const costWp = isImport
            ? (line.unit_price_usd_wp != null ? line.unit_price_usd_wp * exRate : 0)
            : (line.unit_price_krw_wp ?? 0);
          if (costWp > 0) { totalCostWp += costWp * line.quantity; totalQty += line.quantity; }
        }
        return totalQty > 0 ? { avgCostWp: totalCostWp / totalQty, qty: item.quantity } : null;
      })
    ).then((results) => {
      if (cancelled) return;
      const valid = results.filter(Boolean) as { avgCostWp: number; qty: number }[];
      if (!valid.length) { setAvgCostPerWp(null); return; }
      const totalCost = valid.reduce((s, r) => s + r.avgCostWp * r.qty, 0);
      const totalQty = valid.reduce((s, r) => s + r.qty, 0);
      setAvgCostPerWp(totalQty > 0 ? totalCost / totalQty : null);
    }).catch(() => setAvgCostPerWp(null));
    return () => { cancelled = true; };
  }, [ob?.bl_items, ob?.product_id]);

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
      notify.error(err instanceof Error ? err.message : '취소 처리에 실패했습니다');
    } finally {
      setDeleting(false);
    }
  };

  const canEdit = !isCancelled;

  return (
    <div className="space-y-4">
      <div className="sf-detail-header">
        <button type="button" className="sf-detail-header-back" onClick={onBack} aria-label="목록으로">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 text-base font-semibold" style={{ letterSpacing: '-0.012em' }}>출고 상세</h2>
        <OutboundCancelFlow outboundId={outboundId} currentStatus={ob.status} onChanged={reload} />
        {canEdit && !editingOutbound && (
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />취소 처리
          </Button>
        )}
      </div>

      {editingOutbound ? (
        <DetailSection title="출고 수정">
          <OutboundForm
            variant="inline"
            onOpenChange={(o) => { if (!o) setEditingOutbound(false); }}
            onSubmit={handleUpdate}
            editData={ob}
          />
        </DetailSection>
      ) : (
        <>
          <DetailSection
            title="기본 정보"
            badges={
              <>
                <OutboundStatusBadge status={ob.status} />
                <InvoiceStatusBadge outbound={ob} />
              </>
            }
            actions={canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditingOutbound(true)}>
                <Pencil className="mr-1 h-3.5 w-3.5" />수정
              </Button>
            )}
          >
            <DetailFieldGrid cols={4}>
              <DetailField label="출고일" value={formatDate(ob.outbound_date)} />
              <DetailField label="용도" value={USAGE_CATEGORY_LABEL[ob.usage_category] ?? ob.usage_category} />
              <DetailField label="ERP 출고번호" value={ob.erp_outbound_no} />
              <DetailField label="수주연결" value={ob.order_number} />
            </DetailFieldGrid>
          </DetailSection>

          <DetailSection title="제품 · 수량 · 창고">
            <DetailFieldGrid cols={4}>
              <DetailField label="품번" value={ob.product_code} />
              <DetailField label="품명" value={ob.product_name} span={2} />
              <DetailField label="규격" value={ob.spec_wp ? `${ob.spec_wp}Wp` : undefined} />
              <DetailField label="수량" value={formatNumber(ob.quantity)} />
              <DetailField label="용량" value={formatKw(ob.capacity_kw)} />
              <DetailField label="스페어" value={ob.spare_qty?.toString()} />
              <DetailField label="창고" value={ob.warehouse_name} />
            </DetailFieldGrid>
          </DetailSection>

          <DetailSection title="현장 · 연결">
            <DetailFieldGrid cols={4}>
              <DetailField label="현장명" value={ob.site_name} />
              <DetailField label="현장 주소" value={ob.site_address} span={3} />
              {ob.group_trade && (
                <>
                  <DetailField label="그룹거래" value="그룹내 거래" />
                  <DetailField label="상대법인" value={ob.target_company_name} span={3} />
                </>
              )}
            </DetailFieldGrid>
          </DetailSection>

          {ob.bl_items && ob.bl_items.length > 0 && (
            <DetailSection title="B/L 연결 (분할선적)">
              <div className="space-y-1.5">
                {ob.bl_items.map((item) => (
                  <div
                    key={item.outbound_bl_item_id}
                    className="flex items-center gap-3 rounded border bg-blue-50 px-3 py-2 text-xs text-blue-800"
                  >
                    <span className="font-mono font-medium">{item.bl_number ?? item.bl_id.slice(0, 8)}</span>
                    <span className="text-blue-500">·</span>
                    <span>{item.quantity.toLocaleString('ko-KR')} EA</span>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {ob.memo && (
            <DetailSection title="메모">
              <p className="text-sm whitespace-pre-wrap break-words">{ob.memo}</p>
            </DetailSection>
          )}
        </>
      )}

      <OutboundTransportCostPanel outbound={ob} />

      <Separator />

      {editingSale && canEdit ? (
        <DetailSection title={ob.sale ? '매출 수정' : '매출 등록'}>
          <SaleForm
            variant="inline"
            onOpenChange={(o) => { if (!o) setEditingSale(false); }}
            onSubmit={handleSaleSubmit}
            outbound={ob}
            editData={ob.sale ?? null}
            costPerWp={avgCostPerWp}
          />
        </DetailSection>
      ) : ob.sale ? (
        <DetailSection
          title="매출 정보"
          actions={canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditingSale(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />매출 수정
            </Button>
          )}
        >
          <DetailFieldGrid cols={4}>
            <DetailField label="거래처" value={ob.sale.customer_name} span={2} />
            <DetailField label="Wp단가" value={ob.sale.unit_price_wp ? `${formatNumber(ob.sale.unit_price_wp)}원/Wp` : undefined} />
            <DetailField label="EA단가" value={ob.sale.unit_price_ea ? `${formatNumber(ob.sale.unit_price_ea)}원` : undefined} />
            <DetailField label="공급가" value={ob.sale.supply_amount ? `${formatNumber(ob.sale.supply_amount)}원` : undefined} />
            <DetailField label="부가세" value={ob.sale.vat_amount ? `${formatNumber(ob.sale.vat_amount)}원` : undefined} />
            <DetailField label="합계" value={ob.sale.total_amount ? `${formatNumber(ob.sale.total_amount)}원` : undefined} />
            <DetailField label="ERP 마감" value={ob.sale.erp_closed ? `마감 (${formatDate(ob.sale.erp_closed_date ?? '')})` : '미마감'} />
            <DetailField label="계산서 발행일" value={ob.sale.tax_invoice_date ? formatDate(ob.sale.tax_invoice_date) : undefined} />
            <DetailField label="계산서 이메일" value={ob.sale.tax_invoice_email} span={3} />
            {ob.sale.memo && <DetailField label="메모" value={ob.sale.memo} span={4} />}
          </DetailFieldGrid>
        </DetailSection>
      ) : (
        <DetailSection
          title="매출 정보"
          actions={canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditingSale(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />매출 등록
            </Button>
          )}
        >
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            등록된 매출 정보가 없습니다
          </div>
        </DetailSection>
      )}

      <LinkedMemoWidget linkedTable="outbounds" linkedId={outboundId} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="출고 취소 처리"
        description="이 출고 건은 취소 상태로 보존됩니다. 연결된 출고 기준 매출도 함께 취소 처리됩니다."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
