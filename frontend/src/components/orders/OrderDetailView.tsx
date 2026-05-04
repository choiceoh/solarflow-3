import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatNumber, formatKw, moduleLabel } from '@/lib/utils';
import { cn } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { DetailSection, DetailField, DetailFieldGrid, EditableDetailField } from '@/components/common/detail';
import FulfillmentSourceBadge from './FulfillmentSourceBadge';
import LinkedMemoWidget from '@/components/memo/LinkedMemoWidget';
import { useOrderDetail, useOrderOutbounds } from '@/hooks/useOrders';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import {
  ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, RECEIPT_METHOD_LABEL,
  MANAGEMENT_CATEGORY_LABEL,
} from '@/types/orders';
import { USAGE_CATEGORY_LABEL } from '@/types/outbound';
import type { Sale } from '@/types/outbound';

interface Props {
  orderId: string;
  onBack: () => void;
}

function safeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function formatMaybeNumber(value: unknown, suffix = ''): string | undefined {
  const n = safeNumber(value);
  return n === undefined ? undefined : `${formatNumber(n)}${suffix}`;
}

function formatMaybeKw(value: unknown): string | undefined {
  const n = safeNumber(value);
  return n === undefined ? undefined : formatKw(n);
}

export default function OrderDetailView({ orderId, onBack }: Props) {
  const { data: order, loading, reload } = useOrderDetail(orderId);
  const { data: outbounds, loading: obLoading } = useOrderOutbounds(orderId);
  const [sales, setSales] = useState<Sale[]>([]);

  const loadSales = async () => {
    const list = await fetchWithAuth<Array<{ sale?: Sale } & Sale>>(`/api/v1/sales?order_id=${orderId}`);
    setSales(list.map((item) => item.sale ?? item));
  };

  useEffect(() => {
    loadSales().catch(() => setSales([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSales는 매 렌더 재생성되는 내부 헬퍼
  }, [orderId]);

  if (loading) return <LoadingSpinner />;
  if (!order) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <div className="font-medium">수주 상세를 조회하지 못했습니다.</div>
        <p className="mt-1 text-xs">목록 화면은 유지됩니다. 조회가 반복해서 실패하면 새로고침 후 다시 열어주세요.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onBack}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  const orderKey = order.order_id || orderId;
  const shortOrderId = orderKey.slice(0, 8);
  const outboundRows = Array.isArray(outbounds) ? outbounds : [];
  const salesRows = Array.isArray(sales) ? sales : [];
  const orderQty = safeNumber(order.quantity) ?? 0;
  const shippedQty = safeNumber(order.shipped_qty) ?? 0;
  const totalShipped = outboundRows.reduce((sum, ob) => sum + (safeNumber(ob.quantity) ?? 0), 0);
  const remaining = Math.max(orderQty - Math.max(shippedQty, totalShipped), 0);
  const moduleText = order.manufacturer_name || order.spec_wp
    ? moduleLabel(order.manufacturer_name, order.spec_wp)
    : undefined;
  const statusLabel = order.status ? (ORDER_STATUS_LABEL[order.status] ?? order.status) : '—';
  const statusColor = order.status ? (ORDER_STATUS_COLOR[order.status] ?? 'bg-slate-100 text-slate-600') : 'bg-slate-100 text-slate-600';
  const receiptMethodLabel = order.receipt_method ? (RECEIPT_METHOD_LABEL[order.receipt_method] ?? order.receipt_method) : undefined;
  const managementLabel = order.management_category ? (MANAGEMENT_CATEGORY_LABEL[order.management_category] ?? order.management_category) : undefined;
  const sale = salesRows[0];
  const isCancelled = order.status === 'cancelled';

  const saveOrderField = async (key: string, value: unknown) => {
    await fetchWithAuth(`/api/v1/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({ [key]: value }),
    });
    notify.success('수정되었습니다');
    reload();
  };

  const receiptOptions = (Object.entries(RECEIPT_METHOD_LABEL) as [string, string][])
    .map(([value, label]) => ({ value, label }));
  const managementOptions = (Object.entries(MANAGEMENT_CATEGORY_LABEL) as [string, string][])
    .map(([value, label]) => ({ value, label }));

  const statusBadge = (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', statusColor)}>
      {statusLabel}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="sf-detail-header">
        <button type="button" className="sf-detail-header-back" onClick={onBack} aria-label="목록으로">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 text-base font-semibold" style={{ letterSpacing: '-0.012em' }}>
          수주 <span className="sf-mono">{order.order_number || shortOrderId}</span>
        </h2>
      </div>

      <DetailSection
        title="기본 정보"
        badges={statusBadge}
      >
            <DetailFieldGrid cols={4}>
              <EditableDetailField
                label="발주번호"
                value={order.order_number}
                fieldKey="order_number"
                editType="text"
                disabled={isCancelled}
                onSave={saveOrderField}
              />
              <EditableDetailField
                label="수주일"
                value={order.order_date}
                display={formatDate(order.order_date)}
                fieldKey="order_date"
                editType="date"
                disabled={isCancelled}
                onSave={saveOrderField}
              />
              <DetailField label="거래처" value={order.customer_name} span={2} />
              <EditableDetailField
                label="접수방법"
                value={order.receipt_method}
                display={receiptMethodLabel}
                fieldKey="receipt_method"
                editType="select"
                options={receiptOptions}
                disabled={isCancelled}
                onSave={saveOrderField}
              />
              <EditableDetailField
                label="관리구분"
                value={order.management_category}
                display={managementLabel}
                fieldKey="management_category"
                editType="select"
                options={managementOptions}
                disabled={isCancelled}
                onSave={saveOrderField}
              />
              <DetailField label="충당소스">
                {order.fulfillment_source ? <FulfillmentSourceBadge source={order.fulfillment_source} /> : '—'}
              </DetailField>
              <EditableDetailField
                label="납기일"
                value={order.delivery_due}
                display={order.delivery_due ? formatDate(order.delivery_due) : undefined}
                fieldKey="delivery_due"
                editType="date"
                disabled={isCancelled}
                onSave={saveOrderField}
              />
            </DetailFieldGrid>
      </DetailSection>

      <DetailSection title="제품 · 수량">
            <DetailFieldGrid cols={4}>
              <DetailField label="제조사/규격" value={moduleText} span={2} />
              <DetailField label="품번" value={order.product_code} />
              <DetailField label="규격" value={order.spec_wp ? `${order.spec_wp}Wp` : undefined} />
              <DetailField label="품명" value={order.product_name} span={4} />
              <EditableDetailField
                label="수량"
                value={order.quantity}
                display={formatMaybeNumber(order.quantity)}
                fieldKey="quantity"
                editType="number"
                disabled={isCancelled}
                onSave={saveOrderField}
              />
              <DetailField label="잔량" value={formatMaybeNumber(remaining)} />
              <DetailField label="용량" value={formatMaybeKw(order.capacity_kw)} />
              <EditableDetailField
                label="스페어"
                value={order.spare_qty}
                display={formatMaybeNumber(order.spare_qty)}
                fieldKey="spare_qty"
                editType="number"
                disabled={isCancelled}
                onSave={saveOrderField}
              />
              <EditableDetailField
                label="장당단가"
                value={order.unit_price_ea}
                display={order.unit_price_ea != null ? formatMaybeNumber(order.unit_price_ea, '원/장') : (order.unit_price_wp != null && order.spec_wp ? formatMaybeNumber(order.unit_price_wp * order.spec_wp, '원/장') : undefined)}
                fieldKey="unit_price_ea"
                editType="number"
                disabled={isCancelled}
                onSave={saveOrderField}
              />
              <EditableDetailField
                label="Wp단가"
                value={order.unit_price_wp}
                display={formatMaybeNumber(order.unit_price_wp, '원/Wp')}
                fieldKey="unit_price_wp"
                editType="number"
                disabled={isCancelled}
                onSave={saveOrderField}
              />
            </DetailFieldGrid>
      </DetailSection>

      <DetailSection title="현장">
            <DetailFieldGrid cols={4}>
              <EditableDetailField
                label="현장명"
                value={order.site_name}
                fieldKey="site_name"
                editType="text"
                disabled={isCancelled}
                span={2}
                onSave={saveOrderField}
              />
              <EditableDetailField
                label="현장 주소"
                value={order.site_address}
                fieldKey="site_address"
                editType="text"
                disabled={isCancelled}
                span={2}
                onSave={saveOrderField}
              />
              <EditableDetailField
                label="현장 담당"
                value={order.site_contact}
                fieldKey="site_contact"
                editType="text"
                disabled={isCancelled}
                onSave={saveOrderField}
              />
              <EditableDetailField
                label="현장 전화"
                value={order.site_phone}
                fieldKey="site_phone"
                editType="text"
                disabled={isCancelled}
                onSave={saveOrderField}
              />
            </DetailFieldGrid>
      </DetailSection>

      <DetailSection title="결제">
            <DetailFieldGrid cols={4}>
              <EditableDetailField
                label="결제조건"
                value={order.payment_terms}
                fieldKey="payment_terms"
                editType="text"
                disabled={isCancelled}
                span={2}
                onSave={saveOrderField}
              />
              <EditableDetailField
                label="현금/선수금율"
                value={order.deposit_rate}
                display={formatMaybeNumber(order.deposit_rate, '%')}
                fieldKey="deposit_rate"
                editType="number"
                disabled={isCancelled}
                onSave={saveOrderField}
              />
            </DetailFieldGrid>
      </DetailSection>

      <DetailSection title="메모">
        <DetailFieldGrid cols={1}>
          <EditableDetailField
            label="메모"
            value={order.memo}
            display={order.memo ? <span className="whitespace-pre-wrap break-words">{order.memo}</span> : null}
            fieldKey="memo"
            editType="textarea"
            disabled={isCancelled}
            placeholder="메모 (Ctrl+Enter로 저장, Esc로 취소)"
            onSave={saveOrderField}
          />
        </DetailFieldGrid>
      </DetailSection>

      <Separator />

      {sale ? (
        <DetailSection title="계산서">
          <DetailFieldGrid cols={4}>
            <DetailField label="거래처" value={sale.customer_name ?? order.customer_name} span={2} />
            <DetailField label="수량" value={formatMaybeNumber(safeNumber(sale.quantity) ?? order.quantity)} />
            <DetailField label="장당단가" value={formatMaybeNumber(sale.unit_price_ea, '원/장')} />
            <DetailField label="Wp단가" value={formatMaybeNumber(sale.unit_price_wp, '원/Wp')} />
            <DetailField label="공급가" value={formatMaybeNumber(sale.supply_amount, '원')} />
            <DetailField label="부가세" value={formatMaybeNumber(sale.vat_amount, '원')} />
            <DetailField label="합계" value={formatMaybeNumber(sale.total_amount, '원')} />
            <DetailField label="계산서 발행일" value={sale.tax_invoice_date ? formatDate(sale.tax_invoice_date) : undefined} />
            <DetailField label="출고 연결" value={sale.outbound_id ? '연결됨' : '출고 전'} />
          </DetailFieldGrid>
        </DetailSection>
      ) : (
        <DetailSection title="계산서">
          <div className="text-center py-6 text-sm text-muted-foreground">등록된 계산서가 없습니다</div>
        </DetailSection>
      )}

      <Separator />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">연결된 출고</h3>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">
            출고: {formatNumber(totalShipped)} / 잔량: {formatNumber(remaining)}
          </p>
        </div>
      </div>

      {obLoading ? <LoadingSpinner /> : outboundRows.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">연결된 출고가 없습니다</div>
      ) : (
        <div className="rounded-md border">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>출고일</TableHead>
                <TableHead>현장명</TableHead>
                <TableHead>품명</TableHead>
                <TableHead className="text-right">수량</TableHead>
                <TableHead>용도</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outboundRows.map((ob) => (
                <TableRow key={ob.outbound_id}>
                  <TableCell>{formatDate(ob.outbound_date)}</TableCell>
                  <TableCell>{ob.site_name ?? '—'}</TableCell>
                  <TableCell>{ob.product_name ?? '—'}</TableCell>
                  <TableCell className="text-right">{formatMaybeNumber(ob.quantity) ?? '—'}</TableCell>
                  <TableCell>{USAGE_CATEGORY_LABEL[ob.usage_category] ?? ob.usage_category}</TableCell>
                  <TableCell>
                    <span className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      ob.status === 'active' ? 'bg-green-100 text-green-700' :
                      ob.status === 'cancel_pending' ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {ob.status === 'active' ? '정상' : ob.status === 'cancel_pending' ? '취소예정' : '취소완료'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LinkedMemoWidget linkedTable="orders" linkedId={orderId} />
    </div>
  );
}
