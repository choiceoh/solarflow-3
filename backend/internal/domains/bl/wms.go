// bl/wms.go — BL 입고완료 전환 시 receiving_logs 자동 생성.
//
// 이전: backend/internal/handler/wms_automation.go 의 (h *BLHandler) ensureReceivingLogsForBL method.
// PR-C 에서 bl 패키지로 이동 — Go 의 cross-package method 정의 불허 때문.
// 의미적으로 *BL 도메인의 책임* (BL 입고 완료 → receiving_logs) 이라 위치 자연.

package bl

import (
	"encoding/json"
)

func (h *BLHandler) ensureReceivingLogsForBL(bl BLShipment) error {
	if bl.BLID == "" || bl.WarehouseID == nil || *bl.WarehouseID == "" {
		return nil
	}
	data, _, err := h.DB.From("bl_line_items").
		Select("bl_line_id, bl_id, product_id, quantity, products(product_code, product_name)", "exact", false).
		Eq("bl_id", bl.BLID).
		Execute()
	if err != nil {
		return err
	}
	var lines []struct {
		BLLineID  string `json:"bl_line_id"`
		BLID      string `json:"bl_id"`
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
		Products  *struct {
			ProductCode *string `json:"product_code"`
			ProductName *string `json:"product_name"`
		} `json:"products"`
	}
	if err := json.Unmarshal(data, &lines); err != nil {
		return err
	}
	if len(lines) == 0 {
		return nil
	}
	for _, line := range lines {
		_, count, err := h.DB.From("receiving_logs").
			Select("receiving_id", "exact", true).
			Eq("source_type", "bl_line").
			Eq("bl_line_id", line.BLLineID).
			Range(0, 0, "").
			Execute()
		if err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		insert := map[string]any{
			"source_type":       "bl_line",
			"bl_line_id":        line.BLLineID,
			"warehouse_id":      *bl.WarehouseID,
			"product_id":        line.ProductID,
			"quantity_expected": line.Quantity,
			"quantity_received": line.Quantity,
			"notes":             "자동 생성: B/L 입고완료 전환 시 검수 로그 생성",
		}
		if line.Products != nil {
			if line.Products.ProductCode != nil {
				insert["product_code_snapshot"] = *line.Products.ProductCode
			}
			if line.Products.ProductName != nil {
				insert["product_name_snapshot"] = *line.Products.ProductName
			}
		}
		if _, _, err := h.DB.From("receiving_logs").Insert(insert, false, "", "", "").Execute(); err != nil {
			return err
		}
	}
	return nil
}
