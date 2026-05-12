package intercompany

import (
	"encoding/json"

	"solarflow-backend/internal/domains/outbound"
)

func (h *IntercompanyRequestHandler) ensureReceivingLogForIntercompanyRequest(requestID, receiverUserID string) error {
	data, _, err := h.DB.From("intercompany_requests").
		Select("request_id, product_id, quantity, outbound_id", "exact", false).
		Eq("request_id", requestID).
		Execute()
	if err != nil {
		return err
	}
	var requests []outbound.WmsIntercompanyRequestRow
	if err := json.Unmarshal(data, &requests); err != nil {
		return err
	}
	if len(requests) == 0 || requests[0].Quantity <= 0 || requests[0].OutboundID == nil || *requests[0].OutboundID == "" {
		return nil
	}

	ob, err := outbound.NewOutboundHandler(h.DB).FetchOutboundByID(*requests[0].OutboundID)
	if err != nil {
		return err
	}
	if ob.WarehouseID == "" {
		return nil
	}

	_, count, err := h.DB.From("receiving_logs").
		Select("receiving_id", "exact", true).
		Eq("source_type", "intercompany").
		Eq("intercompany_request_id", requestID).
		Range(0, 0, "").
		Execute()
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	product, _ := outbound.NewOutboundHandler(h.DB).ProductSnapshot(requests[0].ProductID)
	insert := intercompanyReceivingLogInsert(requests[0], ob.WarehouseID, product, receiverUserID)
	if _, _, err := h.DB.From("receiving_logs").Insert(insert, false, "", "", "").Execute(); err != nil {
		return err
	}
	return nil
}

func intercompanyReceivingLogInsert(row outbound.WmsIntercompanyRequestRow, warehouseID string, product outbound.WmsProductSnapshot, receiverUserID string) map[string]any {
	insert := map[string]any{
		"source_type":             "intercompany",
		"intercompany_request_id": row.RequestID,
		"warehouse_id":            warehouseID,
		"product_id":              row.ProductID,
		"quantity_expected":       row.Quantity,
		"quantity_received":       row.Quantity,
		"notes":                   "자동 생성: 그룹내 매입 입고확인 시 검수 로그 생성",
	}
	if receiverUserID != "" {
		insert["receiver_user_id"] = receiverUserID
	}
	if product.ProductCode != nil {
		insert["product_code_snapshot"] = *product.ProductCode
	}
	if product.ProductName != nil {
		insert["product_name_snapshot"] = *product.ProductName
	}
	return insert
}
