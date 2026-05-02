package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// --- 허용값 맵 (감리 규칙: map[string]bool 패턴, if-else 나열 금지) ---

var allowedInboundTypes = map[string]bool{
	"import": true, "domestic": true, "domestic_foreign": true, "group": true,
}

var allowedUsageCategories = map[string]bool{
	"sale": true, "sale_spare": true, "construction": true, "construction_damage": true,
	"maintenance": true, "disposal": true, "transfer": true, "adjustment": true, "other": true,
}

var allowedItemTypes = map[string]bool{
	"main": true, "spare": true,
}

var allowedPaymentTypes = map[string]bool{
	"paid": true, "free": true,
}

var allowedExpenseTypes = map[string]bool{
	"dock_charge": true, "shuttle": true, "customs_fee": true, "transport": true,
	"storage": true, "handling": true, "surcharge": true, "lc_fee": true,
	"lc_acceptance": true, "telegraph": true, "other": true,
}

var allowedReceiptMethods = map[string]bool{
	"purchase_order": true, "phone": true, "email": true, "other": true,
}

var allowedManagementCategories = map[string]bool{
	"sale": true, "construction": true, "spare": true, "repowering": true,
	"maintenance": true, "other": true,
}

var allowedFulfillmentSources = map[string]bool{
	"stock": true, "incoming": true,
}

var allowedGroupTrade = map[string]bool{
	"Y": true, "N": true,
}

// validateAllowedValues — 허용값 검증 (감리 규칙: map 패턴)
// 비유: "허용 목록표 대조" — 값이 목록에 있는지 확인
func validateAllowedValues(rowNum int, value string, field string, allowed map[string]bool) *model.ImportError {
	if value == "" {
		return nil
	}
	if !allowed[value] {
		keys := make([]string, 0, len(allowed))
		for k := range allowed {
			keys = append(keys, k)
		}
		return &model.ImportError{
			Row:     rowNum,
			Field:   field,
			Message: fmt.Sprintf("%d행: %s은(는) %s 중 하나여야 합니다", rowNum, field, strings.Join(keys, "/")),
		}
	}
	return nil
}

// ImportHandler — 엑셀 Import 7종 API를 처리하는 핸들러
// 비유: "일괄 등록 창구" — 엑셀에서 파싱된 행들을 DB에 일괄 INSERT
type ImportHandler struct {
	DB *supa.Client
}

// NewImportHandler — ImportHandler 생성자
func NewImportHandler(db *supa.Client) *ImportHandler {
	return &ImportHandler{DB: db}
}

// --- 공통 헬퍼 ---

var datePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
var monthPattern = regexp.MustCompile(`^\d{4}-\d{2}$`)

// getString — map에서 string 값 안전 추출
func getString(row map[string]interface{}, key string) string {
	v, ok := row[key]
	if !ok || v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprintf("%v", v))
}

// getFloat — map에서 float64 값 안전 추출 (없으면 0, 에러 시 0)
func getFloat(row map[string]interface{}, key string) (float64, bool) {
	return assertFloat(row[key])
}

// assertFloat — interface{} 값을 float64로 안전 변환 (json.Number/int/string 포함)
// 비유: 봉투 안 숫자가 어떤 형태(float/int/json.Number/문자열)로 와도 동일 규격으로 꺼냄
// nil/타입 불일치/파싱 실패는 모두 ok=false. 호출부는 반드시 ok를 검사할 것.
// (단정 실패를 zero value로 흘리면 VAT 0원 같은 무성 손상이 발생)
func assertFloat(v interface{}) (float64, bool) {
	if v == nil {
		return 0, false
	}
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		f, err := n.Float64()
		if err != nil {
			return 0, false
		}
		return f, true
	case string:
		// 엑셀 텍스트 셀 또는 JSON에서 따옴표로 감싼 숫자 처리
		s := strings.TrimSpace(n)
		if s == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

// requireFloat — row에서 float 필수 추출. 형식 오류 시 사용자 친화적 ImportError 반환
// 비유: validateRequired는 빈 칸만 보지만, 이건 숫자 형식까지 검증
// validateRequired 통과 후 사용 — !ok면 "값은 있으나 숫자가 아님"을 의미
func requireFloat(rowNum int, row map[string]interface{}, key string) (float64, *model.ImportError) {
	v, ok := getFloat(row, key)
	if !ok {
		return 0, &model.ImportError{
			Row: rowNum, Field: key,
			Message: fmt.Sprintf("%s 숫자 형식이 올바르지 않습니다", key),
		}
	}
	return v, nil
}

// requireInt — row에서 int 필수 추출. 형식 오류 시 사용자 친화적 ImportError 반환
func requireInt(rowNum int, row map[string]interface{}, key string) (int, *model.ImportError) {
	v, ok := getInt(row, key)
	if !ok {
		return 0, &model.ImportError{
			Row: rowNum, Field: key,
			Message: fmt.Sprintf("%s 숫자 형식이 올바르지 않습니다", key),
		}
	}
	return v, nil
}

// getInt — map에서 int 값 안전 추출
func getInt(row map[string]interface{}, key string) (int, bool) {
	f, ok := getFloat(row, key)
	if !ok {
		return 0, false
	}
	return int(f), true
}

// getFloatPtr — 값이 있으면 *float64, 없으면 nil
func getFloatPtr(row map[string]interface{}, key string) *float64 {
	f, ok := getFloat(row, key)
	if !ok {
		return nil
	}
	return &f
}

// getStringPtr — 값이 있으면 *string, 없으면 nil
func getStringPtr(row map[string]interface{}, key string) *string {
	s := getString(row, key)
	if s == "" {
		return nil
	}
	return &s
}

// getBoolPtr — Y/N → *bool
func getBoolPtr(row map[string]interface{}, key string) *bool {
	s := strings.ToUpper(getString(row, key))
	if s == "Y" {
		t := true
		return &t
	}
	if s == "N" {
		f := false
		return &f
	}
	return nil
}

// getIntPtr — 값이 있으면 *int, 없으면 nil
func getIntPtr(row map[string]interface{}, key string) *int {
	i, ok := getInt(row, key)
	if !ok {
		return nil
	}
	return &i
}

// validateRequired — 필수 필드 검증
// 비유: 접수 창구에서 빈 칸 확인
func validateRequired(rowNum int, row map[string]interface{}, fields []string) []model.ImportError {
	var errs []model.ImportError
	for _, f := range fields {
		if getString(row, f) == "" {
			errs = append(errs, model.ImportError{
				Row: rowNum, Field: f, Message: f + "은(는) 필수 항목입니다",
			})
		}
	}
	return errs
}

// resolveFK — 코드로 FK(UUID) 조회
// 비유: 코드표에서 UUID를 찾아오는 번역기
func (h *ImportHandler) resolveFK(table string, matchCol string, matchVal string, idCol string) (string, error) {
	data, _, err := h.DB.From(table).
		Select(idCol, "exact", false).
		Eq(matchCol, matchVal).
		Execute()
	if err != nil {
		return "", fmt.Errorf("DB 조회 실패: %v", err)
	}

	var results []map[string]interface{}
	if err := json.Unmarshal(data, &results); err != nil {
		return "", fmt.Errorf("결과 파싱 실패: %v", err)
	}
	if len(results) == 0 {
		return "", fmt.Errorf("존재하지 않는 %s입니다: %s", matchCol, matchVal)
	}

	id, ok := results[0][idCol].(string)
	if !ok {
		return "", fmt.Errorf("ID 추출 실패")
	}
	return id, nil
}

// resolveProductWithWattage — 품번 코드로 product_id + wattage_kw 조회
func (h *ImportHandler) resolveProductWithWattage(productCode string) (string, float64, error) {
	data, _, err := h.DB.From("products").
		Select("product_id, wattage_kw", "exact", false).
		Eq("product_code", productCode).
		Execute()
	if err != nil {
		return "", 0, fmt.Errorf("DB 조회 실패: %v", err)
	}

	var results []map[string]interface{}
	if err := json.Unmarshal(data, &results); err != nil {
		return "", 0, fmt.Errorf("결과 파싱 실패: %v", err)
	}
	if len(results) == 0 {
		return "", 0, fmt.Errorf("존재하지 않는 품번코드입니다: %s", productCode)
	}

	id, ok := results[0]["product_id"].(string)
	if !ok || id == "" {
		return "", 0, fmt.Errorf("product_id 추출 실패 (productCode=%s)", productCode)
	}
	wattage, ok := assertFloat(results[0]["wattage_kw"])
	if !ok {
		return "", 0, fmt.Errorf("wattage_kw 추출 실패 (productCode=%s) — 단가 계산 불가", productCode)
	}
	return id, wattage, nil
}

// --- 1. Inbound Import ---

// Inbound — POST /api/v1/import/inbound — 입고 일괄 등록
// 비유: 엑셀에서 읽은 B/L + 라인아이템을 한 번에 등록
// 같은 B/L No. 그룹핑: bl_shipments 1건 + bl_line_items N건 (지적 3 반영)
func (h *ImportHandler) Inbound(w http.ResponseWriter, r *http.Request) {
	var req model.ImportRowsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[입고 Import 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if len(req.Rows) == 0 {
		response.RespondError(w, http.StatusBadRequest, "등록할 행이 없습니다")
		return
	}

	imported := 0

	// B/L 번호별 그룹핑·검증 — pure 함수에 위임 (io_import_parsers.go)
	groups, groupOrder, importErrors, warnings := groupInboundRowsByBL(req.Rows)

	// 그룹별 INSERT
	for _, blNum := range groupOrder {
		grp := groups[blNum]
		first := grp.FirstRow
		rowNum := grp.FirstIdx

		// FK 해소: company, manufacturer
		companyID, err := h.resolveFK("companies", "company_code", getString(first, "company_code"), "company_id")
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "company_code", Message: err.Error()})
			continue
		}
		mfgID, err := h.resolveFK("manufacturers", "name_kr", getString(first, "manufacturer_name"), "manufacturer_id")
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "manufacturer_name", Message: err.Error()})
			continue
		}

		// 창고 FK (선택)
		var warehouseID *string
		if wc := getString(first, "warehouse_code"); wc != "" {
			wID, err := h.resolveFK("warehouses", "warehouse_code", wc, "warehouse_id")
			if err != nil {
				importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "warehouse_code", Message: err.Error()})
				continue
			}
			warehouseID = &wID
		}

		// bl_shipments INSERT
		blReq := model.CreateBLRequest{
			BLNumber:       blNum,
			CompanyID:      companyID,
			ManufacturerID: mfgID,
			InboundType:    getString(first, "inbound_type"),
			Currency:       getString(first, "currency"),
			ExchangeRate:   getFloatPtr(first, "exchange_rate"),
			ETD:            getStringPtr(first, "etd"),
			ETA:            getStringPtr(first, "eta"),
			ActualArrival:  getStringPtr(first, "actual_arrival"),
			Port:           getStringPtr(first, "port"),
			Forwarder:      getStringPtr(first, "forwarder"),
			WarehouseID:    warehouseID,
			InvoiceNumber:  getStringPtr(first, "invoice_number"),
			Status:         "scheduled",
			Memo:           getStringPtr(first, "memo"),
		}

		if msg := blReq.Validate(); msg != "" {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "bl_shipments", Message: msg})
			continue
		}

		blData, _, err := h.DB.From("bl_shipments").
			Insert(blReq, false, "", "", "").
			Execute()
		if err != nil {
			log.Printf("[입고 Import B/L INSERT 실패] %v", err)
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "bl_shipments", Message: "B/L 등록 실패"})
			continue
		}

		var createdBLs []model.BLShipment
		if err := json.Unmarshal(blData, &createdBLs); err != nil || len(createdBLs) == 0 {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "bl_shipments", Message: "B/L 등록 결과 확인 실패"})
			continue
		}
		blID := createdBLs[0].BLID

		// 라인아이템 INSERT
		lineOK := true
		for j, lineRow := range grp.LineRows {
			lineRowNum := grp.LineIdxes[j]

			productCode := getString(lineRow, "product_code")
			productID, wattageKW, err := h.resolveProductWithWattage(productCode)
			if err != nil {
				importErrors = append(importErrors, model.ImportError{Row: lineRowNum, Field: "product_code", Message: err.Error()})
				lineOK = false
				continue
			}

			qty, qErr := requireInt(lineRowNum, lineRow, "quantity")
			if qErr != nil {
				importErrors = append(importErrors, *qErr)
				lineOK = false
				continue
			}
			capacityKW := float64(qty) * wattageKW

			lineReq := model.CreateBLLineRequest{
				BLID:             blID,
				ProductID:        productID,
				Quantity:         qty,
				CapacityKW:       capacityKW,
				ItemType:         getString(lineRow, "item_type"),
				PaymentType:      getString(lineRow, "payment_type"),
				InvoiceAmountUSD: getFloatPtr(lineRow, "invoice_amount_usd"),
				UnitPriceUSDWp:   getFloatPtr(lineRow, "unit_price_usd_wp"),
				UnitPriceKRWWp:   getFloatPtr(lineRow, "unit_price_krw_wp"),
				UsageCategory:    getString(lineRow, "usage_category"),
				Memo:             getStringPtr(lineRow, "line_memo"),
			}

			if msg := lineReq.Validate(); msg != "" {
				importErrors = append(importErrors, model.ImportError{Row: lineRowNum, Field: "bl_line_items", Message: msg})
				lineOK = false
				continue
			}

			_, _, err = h.DB.From("bl_line_items").
				Insert(lineReq, false, "", "", "").
				Execute()
			if err != nil {
				log.Printf("[입고 Import 라인 INSERT 실패] %v", err)
				importErrors = append(importErrors, model.ImportError{Row: lineRowNum, Field: "bl_line_items", Message: "라인아이템 등록 실패"})
				lineOK = false
				continue
			}
		}

		if lineOK {
			imported += len(grp.LineRows)
		}
	}

	resp := model.ImportResponse{
		Success:       len(importErrors) == 0,
		ImportedCount: imported,
		ErrorCount:    len(importErrors),
		WarningCount:  len(warnings),
		Errors:        importErrors,
		Warnings:      warnings,
	}
	if resp.Errors == nil {
		resp.Errors = []model.ImportError{}
	}
	if resp.Warnings == nil {
		resp.Warnings = []model.ImportWarning{}
	}

	response.RespondJSON(w, http.StatusOK, resp)
}

// --- 2. Outbound Import ---

// Outbound — POST /api/v1/import/outbound — 출고 일괄 등록
// 비유: 엑셀에서 읽은 출고 전표를 한 번에 등록
func (h *ImportHandler) Outbound(w http.ResponseWriter, r *http.Request) {
	var req model.ImportRowsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[출고 Import 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if len(req.Rows) == 0 {
		response.RespondError(w, http.StatusBadRequest, "등록할 행이 없습니다")
		return
	}

	var importErrors []model.ImportError
	imported := 0

	for i, row := range req.Rows {
		rowNum := i + 2

		errs := validateRequired(rowNum, row, []string{
			"outbound_date", "company_code", "product_code", "quantity", "warehouse_code", "usage_category",
		})
		if len(errs) > 0 {
			importErrors = append(importErrors, errs...)
			continue
		}

		// 허용값 검증 (감리 즉시수정)
		allowedErrs := false
		if e := validateAllowedValues(rowNum, getString(row, "usage_category"), "usage_category", allowedUsageCategories); e != nil {
			importErrors = append(importErrors, *e)
			allowedErrs = true
		}
		if gt := getString(row, "group_trade"); gt != "" {
			if e := validateAllowedValues(rowNum, gt, "group_trade", allowedGroupTrade); e != nil {
				importErrors = append(importErrors, *e)
				allowedErrs = true
			}
		}
		if allowedErrs {
			continue
		}

		// FK
		companyID, err := h.resolveFK("companies", "company_code", getString(row, "company_code"), "company_id")
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "company_code", Message: err.Error()})
			continue
		}

		productCode := getString(row, "product_code")
		productID, wattageKW, err := h.resolveProductWithWattage(productCode)
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "product_code", Message: err.Error()})
			continue
		}

		warehouseID, err := h.resolveFK("warehouses", "warehouse_code", getString(row, "warehouse_code"), "warehouse_id")
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "warehouse_code", Message: err.Error()})
			continue
		}

		qty, qErr := requireInt(rowNum, row, "quantity")
		if qErr != nil {
			importErrors = append(importErrors, *qErr)
			continue
		}
		capacityKW := float64(qty) * wattageKW

		// group_trade: "Y" -> true
		groupTrade := getBoolPtr(row, "group_trade")

		// 상대법인 FK (그룹거래 시)
		var targetCompanyID *string
		if tc := getString(row, "target_company_code"); tc != "" {
			tcID, err := h.resolveFK("companies", "company_code", tc, "company_id")
			if err != nil {
				importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "target_company_code", Message: err.Error()})
				continue
			}
			targetCompanyID = &tcID
		}

		// 수주 FK (선택)
		var orderID *string
		if on := getString(row, "order_number"); on != "" {
			oID, err := h.resolveFK("orders", "order_number", on, "order_id")
			if err != nil {
				importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "order_number", Message: err.Error()})
				continue
			}
			orderID = &oID
		}

		outReq := model.CreateOutboundRequest{
			OutboundDate:    getString(row, "outbound_date"),
			CompanyID:       companyID,
			ProductID:       productID,
			Quantity:        qty,
			CapacityKw:      &capacityKW,
			WarehouseID:     warehouseID,
			UsageCategory:   getString(row, "usage_category"),
			OrderID:         orderID,
			SiteName:        getStringPtr(row, "site_name"),
			SiteAddress:     getStringPtr(row, "site_address"),
			SpareQty:        getIntPtr(row, "spare_qty"),
			GroupTrade:      groupTrade,
			TargetCompanyID: targetCompanyID,
			ErpOutboundNo:   getStringPtr(row, "erp_outbound_no"),
			Status:          "active",
			Memo:            getStringPtr(row, "memo"),
		}

		if msg := outReq.Validate(); msg != "" {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "outbound", Message: msg})
			continue
		}

		outData, _, err := h.DB.From("outbounds").
			Insert(outReq, false, "", "", "").
			Execute()
		if err != nil {
			log.Printf("[출고 Import INSERT 실패] row=%d, err=%v", rowNum, err)
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "outbound", Message: "출고 등록 실패"})
			continue
		}
		var createdOutbounds []model.Outbound
		if json.Unmarshal(outData, &createdOutbounds) == nil && len(createdOutbounds) > 0 {
			writeAuditLog(h.DB, r, "outbounds", createdOutbounds[0].OutboundID, "create", nil, auditRawFromValue(createdOutbounds[0]), "excel_import")
		}

		imported++
	}

	resp := model.ImportResponse{
		Success:       len(importErrors) == 0,
		ImportedCount: imported,
		ErrorCount:    len(importErrors),
		Errors:        importErrors,
		Warnings:      []model.ImportWarning{},
	}
	if resp.Errors == nil {
		resp.Errors = []model.ImportError{}
	}

	response.RespondJSON(w, http.StatusOK, resp)
}

// --- 3. Sales Import (지적 1 반영) ---

// Sales — POST /api/v1/import/sales — 매출 일괄 등록
// 비유: outbound_id로 출고를 직접 찾아 매출 전표를 생성
func (h *ImportHandler) Sales(w http.ResponseWriter, r *http.Request) {
	var req model.ImportRowsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[매출 Import 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if len(req.Rows) == 0 {
		response.RespondError(w, http.StatusBadRequest, "등록할 행이 없습니다")
		return
	}

	var importErrors []model.ImportError
	imported := 0

	for i, row := range req.Rows {
		rowNum := i + 2

		errs := validateRequired(rowNum, row, []string{"outbound_id", "customer_name", "unit_price_wp"})
		if len(errs) > 0 {
			importErrors = append(importErrors, errs...)
			continue
		}

		outboundID := getString(row, "outbound_id")

		// outbound 조회 — product_id, quantity, spec_wp 가져옴
		obData, _, err := h.DB.From("outbounds").
			Select("outbound_id, product_id, quantity, products(spec_wp)", "exact", false).
			Eq("outbound_id", outboundID).
			Execute()
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "outbound_id", Message: "출고 조회 실패"})
			continue
		}

		var outbounds []map[string]interface{}
		if err := json.Unmarshal(obData, &outbounds); err != nil || len(outbounds) == 0 {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "outbound_id", Message: "존재하지 않는 outbound_id입니다: " + outboundID})
			continue
		}

		ob := outbounds[0]
		quantity, qOk := assertFloat(ob["quantity"])
		if !qOk || quantity <= 0 {
			// 단정 실패 → 0이 흘러 VAT 0원으로 등록되는 무성 손상 방지
			importErrors = append(importErrors, model.ImportError{
				Row: rowNum, Field: "outbound_id",
				Message: fmt.Sprintf("출고 수량(quantity) 추출 실패: outbound_id=%s", outboundID),
			})
			continue
		}

		// products 서브쿼리에서 spec_wp 추출
		// PostgREST FK join은 객체 또는 배열로 올 수 있어 두 형태 모두 처리
		var specWP float64
		var specOk bool
		switch p := ob["products"].(type) {
		case map[string]interface{}:
			specWP, specOk = assertFloat(p["spec_wp"])
		case []interface{}:
			if len(p) > 0 {
				if first, ok := p[0].(map[string]interface{}); ok {
					specWP, specOk = assertFloat(first["spec_wp"])
				}
			}
		}
		if !specOk || specWP <= 0 {
			importErrors = append(importErrors, model.ImportError{
				Row: rowNum, Field: "outbound_id",
				Message: fmt.Sprintf("품번 spec_wp 추출 실패 또는 0: outbound_id=%s — 단가/VAT 계산 불가", outboundID),
			})
			continue
		}

		// 거래처 FK
		customerName := getString(row, "customer_name")
		customerID, err := h.resolveFK("partners", "partner_name", customerName, "partner_id")
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "customer_name", Message: err.Error()})
			continue
		}

		unitPriceWp, upErr := requireFloat(rowNum, row, "unit_price_wp")
		if upErr != nil {
			importErrors = append(importErrors, *upErr)
			continue
		}
		if unitPriceWp <= 0 {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "unit_price_wp", Message: "unit_price_wp는 양수여야 합니다"})
			continue
		}

		// 자동계산: ea = wp × spec_wp, supply = ea × qty, vat = supply × 0.1, total = supply + vat
		unitPriceEa := unitPriceWp * specWP
		supplyAmount := unitPriceEa * quantity
		vatAmount := supplyAmount * 0.1
		totalAmount := supplyAmount + vatAmount

		invoiceQty := int(quantity)
		saleReq := model.CreateSaleRequest{
			OutboundID:      &outboundID,
			CustomerID:      customerID,
			Quantity:        &invoiceQty,
			UnitPriceWp:     unitPriceWp,
			UnitPriceEa:     &unitPriceEa,
			SupplyAmount:    &supplyAmount,
			VatAmount:       &vatAmount,
			TotalAmount:     &totalAmount,
			TaxInvoiceDate:  getStringPtr(row, "tax_invoice_date"),
			TaxInvoiceEmail: getStringPtr(row, "tax_invoice_email"),
			ErpClosed:       getBoolPtr(row, "erp_closed"),
			ErpClosedDate:   getStringPtr(row, "erp_closed_date"),
			Memo:            getStringPtr(row, "memo"),
		}

		if msg := saleReq.Validate(); msg != "" {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "sale", Message: msg})
			continue
		}

		saleData, _, err := h.DB.From("sales").
			Insert(saleReq, false, "", "", "").
			Execute()
		if err != nil {
			log.Printf("[매출 Import INSERT 실패] row=%d, err=%v", rowNum, err)
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "sale", Message: "매출 등록 실패"})
			continue
		}
		var createdSales []model.Sale
		if json.Unmarshal(saleData, &createdSales) == nil && len(createdSales) > 0 {
			writeAuditLog(h.DB, r, "sales", createdSales[0].SaleID, "create", nil, auditRawFromValue(createdSales[0]), "excel_import")
		}

		imported++
	}

	resp := model.ImportResponse{
		Success:       len(importErrors) == 0,
		ImportedCount: imported,
		ErrorCount:    len(importErrors),
		Errors:        importErrors,
		Warnings:      []model.ImportWarning{},
	}
	if resp.Errors == nil {
		resp.Errors = []model.ImportError{}
	}

	response.RespondJSON(w, http.StatusOK, resp)
}

// --- 4. Declarations Import (지적 2 반영) ---

// Declarations — POST /api/v1/import/declarations — 면장+원가 통합 등록
// 비유: 면장을 먼저 등록하고, 면장번호→ID 매핑 맵으로 원가를 연결
func (h *ImportHandler) Declarations(w http.ResponseWriter, r *http.Request) {
	var req model.DeclarationImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[면장 Import 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if len(req.Declarations) == 0 && len(req.Costs) == 0 {
		response.RespondError(w, http.StatusBadRequest, "등록할 데이터가 없습니다")
		return
	}

	var importErrors []model.ImportError
	declImported := 0
	costImported := 0

	// 면장번호 → declaration_id 매핑 맵
	declIDMap := make(map[string]string)

	// 단계 1: declarations INSERT
	for i, row := range req.Declarations {
		rowNum := i + 2

		errs := validateRequired(rowNum, row, []string{
			"declaration_number", "bl_number", "company_code", "declaration_date",
		})
		if len(errs) > 0 {
			importErrors = append(importErrors, errs...)
			continue
		}

		// FK: bl_number → bl_id
		blNumber := getString(row, "bl_number")
		blID, err := h.resolveFK("bl_shipments", "bl_number", blNumber, "bl_id")
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "bl_number", Message: err.Error()})
			continue
		}

		companyID, err := h.resolveFK("companies", "company_code", getString(row, "company_code"), "company_id")
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "company_code", Message: err.Error()})
			continue
		}

		declReq := model.CreateDeclarationRequest{
			DeclarationNumber: getString(row, "declaration_number"),
			BLID:              blID,
			CompanyID:         companyID,
			DeclarationDate:   getString(row, "declaration_date"),
			ArrivalDate:       getStringPtr(row, "arrival_date"),
			ReleaseDate:       getStringPtr(row, "release_date"),
			HSCode:            getStringPtr(row, "hs_code"),
			CustomsOffice:     getStringPtr(row, "customs_office"),
			Port:              getStringPtr(row, "port"),
			Memo:              getStringPtr(row, "memo"),
		}

		if msg := declReq.Validate(); msg != "" {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "declaration", Message: msg})
			continue
		}

		declData, _, err := h.DB.From("declarations").
			Insert(declReq, false, "", "", "").
			Execute()
		if err != nil {
			log.Printf("[면장 Import INSERT 실패] row=%d, err=%v", rowNum, err)
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "declaration", Message: "면장 등록 실패"})
			continue
		}

		var created []model.ImportDeclaration
		if err := json.Unmarshal(declData, &created); err != nil || len(created) == 0 {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "declaration", Message: "면장 등록 결과 확인 실패"})
			continue
		}

		declIDMap[created[0].DeclarationNumber] = created[0].DeclarationID
		declImported++
	}

	// 단계 2: costs INSERT (면장번호로 매핑)
	for i, row := range req.Costs {
		rowNum := i + 2

		errs := validateRequired(rowNum, row, []string{
			"declaration_number", "product_code", "quantity", "exchange_rate", "cif_total_krw",
		})
		if len(errs) > 0 {
			importErrors = append(importErrors, errs...)
			continue
		}

		declNum := getString(row, "declaration_number")
		declID, ok := declIDMap[declNum]
		if !ok {
			importErrors = append(importErrors, model.ImportError{
				Row: rowNum, Field: "declaration_number",
				Message: fmt.Sprintf("%d행: 면장번호 %s가 위 면장 데이터에 없습니다", rowNum, declNum),
			})
			continue
		}

		productCode := getString(row, "product_code")
		productID, wattageKW, err := h.resolveProductWithWattage(productCode)
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "product_code", Message: err.Error()})
			continue
		}

		qty, qErr := requireInt(rowNum, row, "quantity")
		if qErr != nil {
			importErrors = append(importErrors, *qErr)
			continue
		}
		capacityKW := float64(qty) * wattageKW
		exchangeRate, exErr := requireFloat(rowNum, row, "exchange_rate")
		if exErr != nil {
			importErrors = append(importErrors, *exErr)
			continue
		}
		cifTotalKrw, cifErr := requireFloat(rowNum, row, "cif_total_krw")
		if cifErr != nil {
			importErrors = append(importErrors, *cifErr)
			continue
		}

		// cif_wp_krw 자동: cif_total_krw / (qty * spec_wp) — spec_wp가 0이면 0
		cifWpKrw := 0.0
		if capacityKW > 0 {
			cifWpKrw = cifTotalKrw / (capacityKW * 1000)
		}

		costReq := model.CreateCostDetailRequest{
			DeclarationID:  declID,
			ProductID:      productID,
			Quantity:       qty,
			CapacityKw:     &capacityKW,
			FobUnitUsd:     getFloatPtr(row, "fob_unit_usd"),
			FobTotalUsd:    getFloatPtr(row, "fob_total_usd"),
			FobWpKrw:       getFloatPtr(row, "fob_wp_krw"),
			ExchangeRate:   exchangeRate,
			CifUnitUsd:     getFloatPtr(row, "cif_unit_usd"),
			CifTotalUsd:    getFloatPtr(row, "cif_total_usd"),
			CifTotalKrw:    cifTotalKrw,
			CifWpKrw:       cifWpKrw,
			TariffRate:     getFloatPtr(row, "tariff_rate"),
			TariffAmount:   getFloatPtr(row, "tariff_amount"),
			VatAmount:      getFloatPtr(row, "vat_amount"),
			CustomsFee:     getFloatPtr(row, "customs_fee"),
			IncidentalCost: getFloatPtr(row, "incidental_cost"),
			Memo:           getStringPtr(row, "memo"),
		}

		if msg := costReq.Validate(); msg != "" {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "cost_detail", Message: msg})
			continue
		}

		_, _, err = h.DB.From("cost_details").
			Insert(costReq, false, "", "", "").
			Execute()
		if err != nil {
			log.Printf("[원가 Import INSERT 실패] row=%d, err=%v", rowNum, err)
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "cost_detail", Message: "원가 등록 실패"})
			continue
		}

		costImported++
	}

	resp := model.ImportResponse{
		Success:       len(importErrors) == 0,
		ImportedCount: declImported + costImported,
		ErrorCount:    len(importErrors),
		Errors:        importErrors,
		Warnings:      []model.ImportWarning{},
	}
	if resp.Errors == nil {
		resp.Errors = []model.ImportError{}
	}

	response.RespondJSON(w, http.StatusOK, resp)
}

// --- 5. Expenses Import ---

// Expenses — POST /api/v1/import/expenses — 부대비용 일괄 등록
// 비유: 엑셀에서 읽은 부대비용 전표를 한 번에 등록
func (h *ImportHandler) Expenses(w http.ResponseWriter, r *http.Request) {
	var req model.ImportRowsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[부대비용 Import 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if len(req.Rows) == 0 {
		response.RespondError(w, http.StatusBadRequest, "등록할 행이 없습니다")
		return
	}

	var importErrors []model.ImportError
	imported := 0

	for i, row := range req.Rows {
		rowNum := i + 2

		errs := validateRequired(rowNum, row, []string{"company_code", "expense_type", "amount"})
		if len(errs) > 0 {
			importErrors = append(importErrors, errs...)
			continue
		}

		// 허용값 검증 (감리 즉시수정)
		if e := validateAllowedValues(rowNum, getString(row, "expense_type"), "expense_type", allowedExpenseTypes); e != nil {
			importErrors = append(importErrors, *e)
			continue
		}

		// bl_id 또는 month 필수
		blNum := getString(row, "bl_number")
		month := getString(row, "month")
		if blNum == "" && month == "" {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "bl_number/month", Message: "B/L 또는 월 중 하나는 필수입니다"})
			continue
		}

		companyID, err := h.resolveFK("companies", "company_code", getString(row, "company_code"), "company_id")
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "company_code", Message: err.Error()})
			continue
		}

		var blID *string
		if blNum != "" {
			bID, err := h.resolveFK("bl_shipments", "bl_number", blNum, "bl_id")
			if err != nil {
				importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "bl_number", Message: err.Error()})
				continue
			}
			blID = &bID
		}

		amount, amErr := requireFloat(rowNum, row, "amount")
		if amErr != nil {
			importErrors = append(importErrors, *amErr)
			continue
		}
		vat := getFloatPtr(row, "vat")
		total := amount
		if vat != nil {
			total = amount + *vat
		}

		var monthPtr *string
		if month != "" {
			monthPtr = &month
		}

		expReq := model.CreateExpenseRequest{
			BLID:        blID,
			Month:       monthPtr,
			CompanyID:   companyID,
			ExpenseType: getString(row, "expense_type"),
			Amount:      amount,
			Vat:         vat,
			Total:       total,
			Vendor:      getStringPtr(row, "vendor"),
			Memo:        getStringPtr(row, "memo"),
		}

		if msg := expReq.Validate(); msg != "" {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "expense", Message: msg})
			continue
		}

		_, _, err = h.DB.From("incidental_expenses").
			Insert(expReq, false, "", "", "").
			Execute()
		if err != nil {
			log.Printf("[부대비용 Import INSERT 실패] row=%d, err=%v", rowNum, err)
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "expense", Message: "부대비용 등록 실패"})
			continue
		}

		imported++
	}

	resp := model.ImportResponse{
		Success:       len(importErrors) == 0,
		ImportedCount: imported,
		ErrorCount:    len(importErrors),
		Errors:        importErrors,
		Warnings:      []model.ImportWarning{},
	}
	if resp.Errors == nil {
		resp.Errors = []model.ImportError{}
	}

	response.RespondJSON(w, http.StatusOK, resp)
}

// --- 6. Orders Import ---

// Orders — POST /api/v1/import/orders — 수주 일괄 등록
// 비유: 엑셀에서 읽은 수주 계약을 한 번에 등록
func (h *ImportHandler) Orders(w http.ResponseWriter, r *http.Request) {
	var req model.ImportRowsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[수주 Import 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if len(req.Rows) == 0 {
		response.RespondError(w, http.StatusBadRequest, "등록할 행이 없습니다")
		return
	}

	var importErrors []model.ImportError
	imported := 0

	for i, row := range req.Rows {
		rowNum := i + 2

		errs := validateRequired(rowNum, row, []string{
			"company_code", "customer_name", "order_date", "receipt_method",
			"management_category", "fulfillment_source", "product_code", "quantity", "unit_price_wp",
		})
		if len(errs) > 0 {
			importErrors = append(importErrors, errs...)
			continue
		}

		// 허용값 검증 (감리 즉시수정)
		allowedErrs := false
		for _, av := range []struct {
			val, field string
			allowed    map[string]bool
		}{
			{getString(row, "receipt_method"), "receipt_method", allowedReceiptMethods},
			{getString(row, "management_category"), "management_category", allowedManagementCategories},
			{getString(row, "fulfillment_source"), "fulfillment_source", allowedFulfillmentSources},
		} {
			if e := validateAllowedValues(rowNum, av.val, av.field, av.allowed); e != nil {
				importErrors = append(importErrors, *e)
				allowedErrs = true
			}
		}
		if allowedErrs {
			continue
		}

		companyID, err := h.resolveFK("companies", "company_code", getString(row, "company_code"), "company_id")
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "company_code", Message: err.Error()})
			continue
		}

		customerID, err := h.resolveFK("partners", "partner_name", getString(row, "customer_name"), "partner_id")
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "customer_name", Message: err.Error()})
			continue
		}

		productCode := getString(row, "product_code")
		productID, wattageKW, err := h.resolveProductWithWattage(productCode)
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "product_code", Message: err.Error()})
			continue
		}

		qty, qErr := requireInt(rowNum, row, "quantity")
		if qErr != nil {
			importErrors = append(importErrors, *qErr)
			continue
		}
		capacityKW := float64(qty) * wattageKW
		unitPriceWp, upErr := requireFloat(rowNum, row, "unit_price_wp")
		if upErr != nil {
			importErrors = append(importErrors, *upErr)
			continue
		}

		// 자동값: shipped_qty=0, remaining_qty=quantity, status="received"
		shippedQty := 0
		remainingQty := qty

		orderReq := model.CreateOrderRequest{
			OrderNumber:        getStringPtr(row, "order_number"),
			CompanyID:          companyID,
			CustomerID:         customerID,
			OrderDate:          getString(row, "order_date"),
			ReceiptMethod:      getString(row, "receipt_method"),
			ProductID:          productID,
			Quantity:           qty,
			CapacityKw:         &capacityKW,
			UnitPriceWp:        unitPriceWp,
			SiteName:           getStringPtr(row, "site_name"),
			SiteAddress:        getStringPtr(row, "site_address"),
			SiteContact:        getStringPtr(row, "site_contact"),
			SitePhone:          getStringPtr(row, "site_phone"),
			PaymentTerms:       getStringPtr(row, "payment_terms"),
			DepositRate:        getFloatPtr(row, "deposit_rate"),
			DeliveryDue:        getStringPtr(row, "delivery_due"),
			Status:             "received",
			ManagementCategory: getString(row, "management_category"),
			FulfillmentSource:  getString(row, "fulfillment_source"),
			SpareQty:           getIntPtr(row, "spare_qty"),
			Memo:               getStringPtr(row, "memo"),
		}

		if msg := orderReq.Validate(); msg != "" {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "order", Message: msg})
			continue
		}

		// shipped_qty, remaining_qty는 CreateOrderRequest에 없으므로 별도 구조체 사용
		type orderInsert struct {
			model.CreateOrderRequest
			ShippedQty   int `json:"shipped_qty"`
			RemainingQty int `json:"remaining_qty"`
		}

		insertData := orderInsert{
			CreateOrderRequest: orderReq,
			ShippedQty:         shippedQty,
			RemainingQty:       remainingQty,
		}

		_, _, err = h.DB.From("orders").
			Insert(insertData, false, "", "", "").
			Execute()
		if err != nil {
			log.Printf("[수주 Import INSERT 실패] row=%d, err=%v", rowNum, err)
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "order", Message: "수주 등록 실패"})
			continue
		}

		imported++
	}

	resp := model.ImportResponse{
		Success:       len(importErrors) == 0,
		ImportedCount: imported,
		ErrorCount:    len(importErrors),
		Errors:        importErrors,
		Warnings:      []model.ImportWarning{},
	}
	if resp.Errors == nil {
		resp.Errors = []model.ImportError{}
	}

	response.RespondJSON(w, http.StatusOK, resp)
}

// --- 7. Receipts Import ---

// Receipts — POST /api/v1/import/receipts — 수금 일괄 등록
// 비유: 엑셀에서 읽은 수금 전표를 한 번에 등록
func (h *ImportHandler) Receipts(w http.ResponseWriter, r *http.Request) {
	var req model.ImportRowsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[수금 Import 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if len(req.Rows) == 0 {
		response.RespondError(w, http.StatusBadRequest, "등록할 행이 없습니다")
		return
	}

	var importErrors []model.ImportError
	imported := 0

	for i, row := range req.Rows {
		rowNum := i + 2

		// 필수 검증 (FK 해석 전에 selectively)
		if errs := validateRequired(rowNum, row, []string{"customer_name", "receipt_date", "amount"}); len(errs) > 0 {
			importErrors = append(importErrors, errs...)
			continue
		}

		customerID, err := h.resolveFK("partners", "partner_name", getString(row, "customer_name"), "partner_id")
		if err != nil {
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "customer_name", Message: err.Error()})
			continue
		}

		// 필드 추출 + 검증 — pure 함수로 위임
		receiptReq, parseErrs := parseReceiptRow(rowNum, row, customerID)
		if len(parseErrs) > 0 {
			importErrors = append(importErrors, parseErrs...)
			continue
		}

		_, _, err = h.DB.From("receipts").
			Insert(receiptReq, false, "", "", "").
			Execute()
		if err != nil {
			log.Printf("[수금 Import INSERT 실패] row=%d, err=%v", rowNum, err)
			importErrors = append(importErrors, model.ImportError{Row: rowNum, Field: "receipt", Message: "수금 등록 실패"})
			continue
		}

		imported++
	}

	resp := model.ImportResponse{
		Success:       len(importErrors) == 0,
		ImportedCount: imported,
		ErrorCount:    len(importErrors),
		Errors:        importErrors,
		Warnings:      []model.ImportWarning{},
	}
	if resp.Errors == nil {
		resp.Errors = []model.ImportError{}
	}

	response.RespondJSON(w, http.StatusOK, resp)
}
