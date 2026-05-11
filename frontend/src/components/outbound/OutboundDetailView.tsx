import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { PartnerCombobox } from '@/components/common/PartnerCombobox';
import { formatDate, formatNumber, formatKw } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { DetailSection, DetailField, DetailFieldGrid, EditableDetailField } from '@/components/common/detail';
import OutboundStatusBadge from './OutboundStatusBadge';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import OutboundCancelFlow from './OutboundCancelFlow';
import LinkedMemoWidget from '@/components/memo/LinkedMemoWidget';
import OutboundTransportCostPanel from './OutboundTransportCostPanel';
import OutboundWorkflowPanel from './OutboundWorkflowPanel';
import OutboundFifoMatchesPanel from './OutboundFifoMatchesPanel';
import { useOutboundDetail } from '@/hooks/useOutbound';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import { USAGE_CATEGORY_LABEL } from '@/types/outbound';
import type { Partner } from '@/types/masters';

interface Props {
  outboundId: string;
  onBack: () => void;
}

export default function OutboundDetailView({ outboundId, onBack }: Props) {
  const { data: ob, loading, reload } = useOutboundDetail(outboundId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [saleFormOpen, setSaleFormOpen] = useState(false);
  const [saleCustomerId, setSaleCustomerId] = useState('');
  const [saleUnitPriceWp, setSaleUnitPriceWp] = useState('');
  const [saleTaxInvoiceDate, setSaleTaxInvoiceDate] = useState('');
  const [saleTaxInvoiceEmail, setSaleTaxInvoiceEmail] = useState('');
  const [saleCreateError, setSaleCreateError] = useState('');
  const [saleCreating, setSaleCreating] = useState(false);

  useEffect(() => {
    fetchWithAuth<Partner[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ob) return;
    setSaleCustomerId(ob.customer_id ?? '');
    setSaleUnitPriceWp(ob.unit_price_wp != null ? String(ob.unit_price_wp) : '');
    setSaleTaxInvoiceDate(ob.sale?.tax_invoice_date ?? '');
    setSaleTaxInvoiceEmail(ob.sale?.tax_invoice_email ?? '');
    setSaleCreateError('');
  }, [ob]);

  if (loading || !ob) return <LoadingSpinner />;

  const isCancelled = ob.status === 'cancelled';

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

  // 출고 본체 부분 편집 — UpdateOutboundRequest 가 모든 필드를 optional 로 받으므로
  // 변경된 단일 키만 PUT 으로 전송. 취소/취소대기 상태에서는 비활성.
  const saveOutboundField = async (key: string, value: unknown) => {
    await fetchWithAuth(`/api/v1/outbounds/${outboundId}`, {
      method: 'PUT',
      body: JSON.stringify({ [key]: value }),
    });
    notify.success('수정되었습니다');
    reload();
  };

  // 매출 부분 편집 — UpdateSaleRequest 가 모든 필드를 optional. PUT /api/v1/sales/{id}.
  const saveSaleField = async (key: string, value: unknown) => {
    if (!ob.sale) return;
    await fetchWithAuth(`/api/v1/sales/${ob.sale.sale_id}`, {
      method: 'PUT',
      body: JSON.stringify({ [key]: value }),
    });
    notify.success('수정되었습니다');
    reload();
  };

  const createSaleFromOutbound = async () => {
    const price = Number(saleUnitPriceWp);
    if (!saleCustomerId) {
      setSaleCreateError('거래처를 선택해주세요');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setSaleCreateError('Wp단가는 양수로 입력해주세요');
      return;
    }

    const invoiceDate = saleTaxInvoiceDate.trim();
    const invoiceEmail = saleTaxInvoiceEmail.trim();
    setSaleCreating(true);
    setSaleCreateError('');
    try {
      await fetchWithAuth('/api/v1/sales', {
        method: 'POST',
        body: JSON.stringify({
          outbound_id: ob.outbound_id,
          order_id: ob.order_id,
          customer_id: saleCustomerId,
          quantity: ob.quantity,
          capacity_kw: ob.capacity_kw,
          unit_price_wp: price,
          tax_invoice_date: invoiceDate || undefined,
          tax_invoice_email: invoiceEmail || undefined,
          erp_closed: false,
        }),
      });
      if (invoiceDate) {
        await fetchWithAuth(`/api/v1/outbounds/${ob.outbound_id}`, {
          method: 'PUT',
          body: JSON.stringify({ tax_invoice_issued: true }),
        });
      }
      notify.success('매출을 생성했습니다');
      setSaleFormOpen(false);
      reload();
    } catch (err) {
      setSaleCreateError(err instanceof Error ? err.message : '매출 생성에 실패했습니다');
    } finally {
      setSaleCreating(false);
    }
  };

  const usageOptions = (Object.entries(USAGE_CATEGORY_LABEL) as [string, string][])
    .map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-4">
      <div className="sf-detail-header">
        <button type="button" className="sf-detail-header-back" onClick={onBack} aria-label="목록으로">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 text-base font-semibold" style={{ letterSpacing: '-0.012em' }}>출고 상세</h2>
        <OutboundCancelFlow outboundId={outboundId} currentStatus={ob.status} onChanged={reload} />
        {!isCancelled && (
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />취소 처리
          </Button>
        )}
      </div>

      <DetailSection
        title="기본 정보"
        badges={
          <>
            <OutboundStatusBadge status={ob.status} />
            <InvoiceStatusBadge outbound={ob} />
          </>
        }
      >
            <DetailFieldGrid cols={4}>
              <EditableDetailField
                label="출고일"
                value={ob.outbound_date}
                display={formatDate(ob.outbound_date)}
                fieldKey="outbound_date"
                editType="date"
                disabled={isCancelled}
                onSave={saveOutboundField}
              />
              <EditableDetailField
                label="용도"
                value={ob.usage_category}
                display={USAGE_CATEGORY_LABEL[ob.usage_category] ?? ob.usage_category}
                fieldKey="usage_category"
                editType="select"
                options={usageOptions}
                disabled={isCancelled}
                onSave={saveOutboundField}
              />
              <EditableDetailField
                label="ERP 출고번호"
                value={ob.erp_outbound_no}
                fieldKey="erp_outbound_no"
                editType="text"
                disabled={isCancelled}
                onSave={saveOutboundField}
              />
              <DetailField label="수주연결" value={ob.order_number} />
            </DetailFieldGrid>
      </DetailSection>

      <DetailSection title="제품 · 수량 · 창고">
            <DetailFieldGrid cols={4}>
              <DetailField label="품번" value={ob.product_code} />
              <DetailField label="제조사" value={ob.manufacturer_name} />
              <DetailField label="품명" value={ob.product_name} span={2} />
              <DetailField label="규격" value={ob.spec_wp ? `${ob.spec_wp}Wp` : undefined} />
              <EditableDetailField
                label="수량"
                value={ob.quantity}
                display={formatNumber(ob.quantity)}
                fieldKey="quantity"
                editType="number"
                disabled={isCancelled}
                onSave={saveOutboundField}
              />
              <DetailField label="용량" value={formatKw(ob.capacity_kw)} />
              <EditableDetailField
                label="스페어"
                value={ob.spare_qty}
                display={ob.spare_qty?.toString()}
                fieldKey="spare_qty"
                editType="number"
                disabled={isCancelled}
                onSave={saveOutboundField}
              />
              <DetailField label="창고" value={ob.warehouse_name} />
            </DetailFieldGrid>
      </DetailSection>

      <DetailSection title="현장 · 연결">
            <DetailFieldGrid cols={4}>
              <EditableDetailField
                label="현장명"
                value={ob.site_name}
                fieldKey="site_name"
                editType="text"
                disabled={isCancelled}
                onSave={saveOutboundField}
              />
              <EditableDetailField
                label="현장 주소"
                value={ob.site_address}
                fieldKey="site_address"
                editType="text"
                disabled={isCancelled}
                span={3}
                onSave={saveOutboundField}
              />
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

      <DetailSection title="메모">
        <DetailFieldGrid cols={1}>
          <EditableDetailField
            label="메모"
            value={ob.memo}
            display={ob.memo ? <span className="whitespace-pre-wrap break-words">{ob.memo}</span> : null}
            fieldKey="memo"
            editType="textarea"
            disabled={isCancelled}
            placeholder="메모 (Ctrl+Enter로 저장, Esc로 취소)"
            onSave={saveOutboundField}
          />
        </DetailFieldGrid>
      </DetailSection>

      {/* D-055: 외부 양식(탑솔라 그룹 등) 변환 시 보존된 워크플로우 4종 + 원본 행 */}
      <OutboundWorkflowPanel outbound={ob} onUpdated={reload} />

      <OutboundTransportCostPanel outbound={ob} />

      <Separator />

      {ob.sale ? (
        <DetailSection title="매출 정보">
          <DetailFieldGrid cols={4}>
            <DetailField label="거래처" value={ob.sale.customer_name} span={2} />
            <EditableDetailField
              label="Wp단가"
              value={ob.sale.unit_price_wp}
              display={ob.sale.unit_price_wp ? `${formatNumber(ob.sale.unit_price_wp)}원/Wp` : undefined}
              fieldKey="unit_price_wp"
              editType="number"
              disabled={isCancelled}
              onSave={saveSaleField}
            />
            <EditableDetailField
              label="EA단가"
              value={ob.sale.unit_price_ea}
              display={ob.sale.unit_price_ea ? `${formatNumber(ob.sale.unit_price_ea)}원` : undefined}
              fieldKey="unit_price_ea"
              editType="number"
              disabled={isCancelled}
              onSave={saveSaleField}
            />
            <DetailField label="공급가" value={ob.sale.supply_amount ? `${formatNumber(ob.sale.supply_amount)}원` : undefined} />
            <DetailField label="부가세" value={ob.sale.vat_amount ? `${formatNumber(ob.sale.vat_amount)}원` : undefined} />
            <DetailField label="합계" value={ob.sale.total_amount ? `${formatNumber(ob.sale.total_amount)}원` : undefined} />
            <DetailField label="ERP 마감" value={ob.sale.erp_closed ? `마감 (${formatDate(ob.sale.erp_closed_date ?? '')})` : '미마감'} />
            <EditableDetailField
              label="계산서 발행일"
              value={ob.sale.tax_invoice_date}
              display={ob.sale.tax_invoice_date ? formatDate(ob.sale.tax_invoice_date) : undefined}
              fieldKey="tax_invoice_date"
              editType="date"
              disabled={isCancelled}
              onSave={saveSaleField}
            />
            <EditableDetailField
              label="계산서 이메일"
              value={ob.sale.tax_invoice_email}
              fieldKey="tax_invoice_email"
              editType="text"
              disabled={isCancelled}
              span={3}
              onSave={saveSaleField}
            />
            <EditableDetailField
              label="매출 메모"
              value={ob.sale.memo}
              display={ob.sale.memo ? <span className="whitespace-pre-wrap break-words">{ob.sale.memo}</span> : null}
              fieldKey="memo"
              editType="textarea"
              disabled={isCancelled}
              span={4}
              placeholder="매출 메모 (Ctrl+Enter로 저장)"
              onSave={saveSaleField}
            />
          </DetailFieldGrid>
        </DetailSection>
      ) : (
        <DetailSection
          title="매출 정보"
          actions={!isCancelled && (
            <Button type="button" size="sm" className="h-8 gap-1.5" onClick={() => setSaleFormOpen((open) => !open)}>
              <Plus className="h-3.5 w-3.5" />
              매출 생성
            </Button>
          )}
        >
          {saleFormOpen ? (
            <div className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-4">
                <div className="lg:col-span-2">
                  <Label className="mb-1.5 text-xs">거래처</Label>
                  <PartnerCombobox
                    partners={partners}
                    value={saleCustomerId}
                    onChange={setSaleCustomerId}
                    placeholder="거래처 선택"
                    error={!saleCustomerId && !!saleCreateError}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 text-xs">Wp단가</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={saleUnitPriceWp}
                    onChange={(event) => setSaleUnitPriceWp(event.target.value)}
                    placeholder="원/Wp"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 text-xs">계산서일</Label>
                  <DateInput value={saleTaxInvoiceDate} onChange={setSaleTaxInvoiceDate} />
                </div>
                <div className="lg:col-span-2">
                  <Label className="mb-1.5 text-xs">계산서 이메일</Label>
                  <Input
                    value={saleTaxInvoiceEmail}
                    onChange={(event) => setSaleTaxInvoiceEmail(event.target.value)}
                    placeholder="선택 입력"
                  />
                </div>
                <DetailField label="수량" value={formatNumber(ob.quantity)} />
                <DetailField label="용량" value={formatKw(ob.capacity_kw)} />
              </div>
              {saleCreateError && <div className="text-xs text-destructive">{saleCreateError}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSaleFormOpen(false)}>
                  취소
                </Button>
                <Button type="button" size="sm" className="gap-1.5" disabled={saleCreating} onClick={createSaleFromOutbound}>
                  {saleCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  생성
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              등록된 매출 정보가 없습니다
            </div>
          )}
        </DetailSection>
      )}

      <OutboundFifoMatchesPanel outboundId={outboundId} />

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
