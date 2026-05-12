import { useCallback, useEffect, useState } from "react"
import { motion } from "motion/react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, formatNumber, formatKw, moduleLabel } from "@/lib/utils"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import StatusPill from "@/components/common/StatusPill"
import {
  DetailSection,
  DetailField,
  DetailFieldGrid,
  EditableDetailField,
} from "@/components/common/detail"
import FulfillmentSourceBadge from "./FulfillmentSourceBadge"
import OrderFulfillmentRiskBadge from "./OrderFulfillmentRiskBadge"
import LinkedMemoWidget from "@/components/memo/LinkedMemoWidget"
import { useOrderDetail, useOrderFulfillmentRisk, useOrderOutbounds } from "@/hooks/useOrders"
import { fetchWithAuth } from "@/lib/api"
import { notify } from "@/lib/notify"
import {
  FULFILLMENT_SOURCE_LABEL,
  ORDER_FULFILLMENT_ETA_STATUS_COLOR,
  ORDER_FULFILLMENT_ETA_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_COLOR,
  RECEIPT_METHOD_LABEL,
  MANAGEMENT_CATEGORY_LABEL,
  type OrderFulfillmentEtaStatus,
  type OrderFulfillmentRiskItem,
} from "@/types/orders"
import {
  OUTBOUND_STATUS_LABEL,
  OUTBOUND_STATUS_COLOR,
  USAGE_CATEGORY_LABEL,
} from "@/types/outbound"
import type { Sale } from "@/types/outbound"

interface Props {
  orderId: string
  onBack: () => void
}

function safeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function formatMaybeNumber(value: unknown, suffix = ""): string | undefined {
  const n = safeNumber(value)
  return n === undefined ? undefined : `${formatNumber(n)}${suffix}`
}

function formatMaybeKw(value: unknown): string | undefined {
  const n = safeNumber(value)
  return n === undefined ? undefined : formatKw(n)
}

function formatMaybeDate(value: unknown): string | undefined {
  return typeof value === "string" && value ? formatDate(value) : undefined
}

function isKnownEtaStatus(value: string | undefined): value is OrderFulfillmentEtaStatus {
  return Boolean(value && value in ORDER_FULFILLMENT_ETA_STATUS_LABEL)
}

function etaStatusBadge(status: string | undefined) {
  if (!status) return null
  const known = isKnownEtaStatus(status)
  return (
    <StatusPill
      label={known ? ORDER_FULFILLMENT_ETA_STATUS_LABEL[status] : status}
      colorClassName={known ? ORDER_FULFILLMENT_ETA_STATUS_COLOR[status] : "sf-tone-muted"}
    />
  )
}

function FulfillmentEvidencePanel({
  risk,
  loading,
  orderDeliveryDue,
}: {
  risk?: OrderFulfillmentRiskItem
  loading: boolean
  orderDeliveryDue?: string
}) {
  if (loading) {
    return (
      <DetailSection title="충당 근거">
        <LoadingSpinner />
      </DetailSection>
    )
  }

  if (!risk) {
    return (
      <DetailSection title="충당 근거">
        <div className="py-5 text-center text-sm text-muted-foreground">
          진행 중 수주 잔량이 없습니다
        </div>
      </DetailSection>
    )
  }

  const source = risk.fulfillment_source
  const sourceLabel =
    source === "stock" || source === "incoming" ? FULFILLMENT_SOURCE_LABEL[source] : source || "—"
  const breakdown = risk.breakdown
  const isIncoming = source === "incoming"
  const deliveryDue = risk.delivery_due ?? orderDeliveryDue

  return (
    <DetailSection title="충당 근거" badges={<OrderFulfillmentRiskBadge risk={risk} />}>
      <DetailFieldGrid cols={4}>
        <DetailField label="충당소스" value={sourceLabel} />
        <DetailField
          label="배정 순번"
          value={risk.allocation_rank ? `${formatNumber(risk.allocation_rank)}번째` : undefined}
        />
        <DetailField label="잔량" value={`${formatNumber(risk.remaining_qty)}장`} />
        <DetailField label="필요 용량" value={formatKw(risk.need_kw)} />
        <DetailField label="배정 전 가용" value={formatKw(risk.available_before_kw)} />
        <DetailField label="배정 후 가용" value={formatKw(risk.available_after_kw)} />
        <DetailField
          label="부족"
          value={risk.shortage_kw > 0 ? formatKw(risk.shortage_kw) : "없음"}
          className={risk.shortage_kw > 0 ? "text-destructive" : undefined}
        />
        <DetailField label="ETA 상태">{etaStatusBadge(risk.eta_status) ?? "—"}</DetailField>
        <DetailField label="납기일" value={formatMaybeDate(deliveryDue)} />
        <DetailField label="예상 가용일" value={formatMaybeDate(risk.expected_available_date)} />
        <DetailField
          label="지연"
          value={risk.eta_days_late ? `${formatNumber(risk.eta_days_late)}일` : "없음"}
        />
        <DetailField label="판정" value={risk.reason} />
      </DetailFieldGrid>

      <div className="border-t pt-3">
        <p className="mb-3 text-xs font-medium text-muted-foreground">{sourceLabel} 풀 구성</p>
        <DetailFieldGrid cols={3}>
          {isIncoming ? (
            <>
              <DetailField label="B/L 미착" value={formatMaybeKw(breakdown?.bl_incoming_kw)} />
              <DetailField label="L/C 잔여" value={formatMaybeKw(breakdown?.lc_incoming_kw)} />
              <DetailField
                label="기존 예약"
                value={formatMaybeKw(breakdown?.incoming_allocated_kw)}
              />
            </>
          ) : (
            <>
              <DetailField
                label="입고완료"
                value={formatMaybeKw(breakdown?.inbound_completed_kw)}
              />
              <DetailField label="활성 출고" value={formatMaybeKw(breakdown?.outbound_active_kw)} />
              <DetailField label="기존 예약" value={formatMaybeKw(breakdown?.stock_allocated_kw)} />
            </>
          )}
        </DetailFieldGrid>
      </div>

      {risk.eta_reason ? (
        <p className="border-t pt-3 text-xs text-muted-foreground">{risk.eta_reason}</p>
      ) : null}
    </DetailSection>
  )
}

export default function OrderDetailView({ orderId, onBack }: Props) {
  const { data: order, loading, reload } = useOrderDetail(orderId)
  const { data: outbounds, loading: obLoading } = useOrderOutbounds(orderId)
  const {
    items: fulfillmentRiskItems,
    loading: fulfillmentRiskLoading,
    reload: reloadFulfillmentRisk,
  } = useOrderFulfillmentRisk(orderId ? [orderId] : [])
  const [sales, setSales] = useState<Sale[]>([])

  const loadSales = useCallback(async () => {
    const list = await fetchWithAuth<Array<{ sale?: Sale } & Sale>>(
      `/api/v1/sales?order_id=${orderId}`,
    )
    setSales(list.map((item) => item.sale ?? item))
  }, [orderId])

  useEffect(() => {
    loadSales().catch(() => setSales([]))
  }, [loadSales])

  if (loading) return <LoadingSpinner />
  if (!order) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <div className="font-medium">수주 상세를 조회하지 못했습니다.</div>
        <p className="mt-1 text-xs">
          목록 화면은 유지됩니다. 조회가 반복해서 실패하면 새로고침 후 다시 열어주세요.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onBack}>
          목록으로 돌아가기
        </Button>
      </div>
    )
  }

  const orderKey = order.order_id || orderId
  const fulfillmentRisk = fulfillmentRiskItems.find((item) => item.order_id === orderKey)
  const shortOrderId = orderKey.slice(0, 8)
  const outboundRows = Array.isArray(outbounds) ? outbounds : []
  const salesRows = Array.isArray(sales) ? sales : []
  const orderQty = safeNumber(order.quantity) ?? 0
  const shippedQty = safeNumber(order.shipped_qty) ?? 0
  const totalShipped = outboundRows.reduce((sum, ob) => sum + (safeNumber(ob.quantity) ?? 0), 0)
  const remaining = Math.max(orderQty - Math.max(shippedQty, totalShipped), 0)
  const unitPriceEa =
    order.unit_price_ea ??
    (order.unit_price_wp != null && order.spec_wp ? order.unit_price_wp * order.spec_wp : null)
  const expectedAmount = unitPriceEa != null ? unitPriceEa * order.quantity : null
  const moduleText =
    order.manufacturer_name || order.spec_wp
      ? moduleLabel(order.manufacturer_name, order.spec_wp)
      : undefined
  const statusLabel = order.status ? (ORDER_STATUS_LABEL[order.status] ?? order.status) : "—"
  const statusColor = order.status
    ? (ORDER_STATUS_COLOR[order.status] ?? "sf-tone-muted")
    : "sf-tone-muted"
  const receiptMethodLabel = order.receipt_method
    ? (RECEIPT_METHOD_LABEL[order.receipt_method] ?? order.receipt_method)
    : undefined
  const managementLabel = order.management_category
    ? (MANAGEMENT_CATEGORY_LABEL[order.management_category] ?? order.management_category)
    : undefined
  const sale = salesRows[0]
  const isCancelled = order.status === "cancelled"

  const saveOrderField = async (key: string, value: unknown) => {
    await fetchWithAuth(`/api/v1/orders/${orderId}`, {
      method: "PUT",
      body: JSON.stringify({ [key]: value }),
    })
    notify.success("수정되었습니다")
    await reload()
    await reloadFulfillmentRisk()
  }

  const receiptOptions = (Object.entries(RECEIPT_METHOD_LABEL) as [string, string][]).map(
    ([value, label]) => ({ value, label }),
  )
  const managementOptions = (Object.entries(MANAGEMENT_CATEGORY_LABEL) as [string, string][]).map(
    ([value, label]) => ({ value, label }),
  )

  const statusBadge = <StatusPill label={statusLabel} colorClassName={statusColor} />

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="sf-detail-header">
        <button
          type="button"
          className="sf-detail-header-back"
          onClick={onBack}
          aria-label="목록으로"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 text-base font-semibold" style={{ letterSpacing: "-0.012em" }}>
          수주 <span className="sf-mono">{order.order_number || shortOrderId}</span>
        </h2>
      </div>

      <DetailSection title="기본 정보" badges={statusBadge}>
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
            {order.fulfillment_source ? (
              <FulfillmentSourceBadge source={order.fulfillment_source} />
            ) : (
              "—"
            )}
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
          <DetailField label="품번"><span className="text-xs">{order.product_code ?? '—'}</span></DetailField>
          <DetailField label="규격" value={order.spec_wp ? `${order.spec_wp}Wp` : undefined} />
          <DetailField label="품명" span={4}><span className="text-xs">{order.product_name ?? '—'}</span></DetailField>
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
            display={
              order.unit_price_ea != null
                ? formatMaybeNumber(order.unit_price_ea, "원/장")
                : order.unit_price_wp != null && order.spec_wp
                  ? formatMaybeNumber(order.unit_price_wp * order.spec_wp, "원/장")
                  : undefined
            }
            fieldKey="unit_price_ea"
            editType="number"
            disabled={isCancelled}
            onSave={saveOrderField}
          />
          <EditableDetailField
            label="Wp단가"
            value={order.unit_price_wp}
            display={formatMaybeNumber(order.unit_price_wp, "원/Wp")}
            fieldKey="unit_price_wp"
            editType="number"
            disabled={isCancelled}
            onSave={saveOrderField}
          />
          <DetailField
            label="예상금액"
            value={
              expectedAmount != null
                ? formatMaybeNumber(expectedAmount, "원 (VAT 별도)")
                : undefined
            }
          />
        </DetailFieldGrid>
      </DetailSection>

      <FulfillmentEvidencePanel
        risk={fulfillmentRisk}
        loading={fulfillmentRiskLoading}
        orderDeliveryDue={order.delivery_due}
      />

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
            display={formatMaybeNumber(order.deposit_rate, "%")}
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
            display={
              order.memo ? (
                <span className="whitespace-pre-wrap break-words">{order.memo}</span>
              ) : null
            }
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
            <DetailField
              label="거래처"
              value={sale.customer_name ?? order.customer_name}
              span={2}
            />
            <DetailField
              label="수량"
              value={formatMaybeNumber(safeNumber(sale.quantity) ?? order.quantity)}
            />
            <DetailField label="장당단가" value={formatMaybeNumber(sale.unit_price_ea, "원/장")} />
            <DetailField label="Wp단가" value={formatMaybeNumber(sale.unit_price_wp, "원/Wp")} />
            <DetailField label="공급가" value={formatMaybeNumber(sale.supply_amount, "원")} />
            <DetailField label="부가세" value={formatMaybeNumber(sale.vat_amount, "원")} />
            <DetailField label="합계" value={formatMaybeNumber(sale.total_amount, "원")} />
            <DetailField
              label="계산서 발행일"
              value={sale.tax_invoice_date ? formatDate(sale.tax_invoice_date) : undefined}
            />
            <DetailField label="출고 연결" value={sale.outbound_id ? "연결됨" : "출고 전"} />
          </DetailFieldGrid>
        </DetailSection>
      ) : (
        <DetailSection title="계산서">
          <div className="text-center py-6 text-sm text-muted-foreground">
            등록된 계산서가 없습니다
          </div>
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

      {obLoading ? (
        <LoadingSpinner />
      ) : outboundRows.length === 0 ? (
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
                  <TableCell>{ob.site_name ?? "—"}</TableCell>
                  <TableCell>{ob.product_name ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {formatMaybeNumber(ob.quantity) ?? "—"}
                  </TableCell>
                  <TableCell>
                    {USAGE_CATEGORY_LABEL[ob.usage_category] ?? ob.usage_category}
                  </TableCell>
                  <TableCell>
                    <StatusPill
                      label={OUTBOUND_STATUS_LABEL[ob.status] ?? ob.status}
                      colorClassName={OUTBOUND_STATUS_COLOR[ob.status] ?? "sf-tone-muted"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LinkedMemoWidget linkedTable="orders" linkedId={orderId} />
    </motion.div>
  )
}
