package handler

// io_import_parsers — Excel 행을 INSERT 페이로드로 변환하는 pure 함수 모음.
// 핸들러(io_import.go)는 FK 해석·INSERT만 담당하고, 검증·필드 추출·INSERT 페이로드 빌드는 본 파일에서.
//
// FK 해석은 호출 측에서 미리 수행해 ID를 인자로 넘긴다 (DB 의존 없이 단위테스트 가능).
// 단위테스트는 io_import_parsers_test.go.
//
// 현재 추출 완료: parseReceiptRow, groupInboundRowsByBL,
// parseExpenseRow, parseOutboundRow, parseOrderRow, parseSaleRow, parseDeclarationRow + parseDeclarationCostRow.

import (
	"fmt"
	"strings"

	"solarflow-backend/internal/model"
)

// parseReceiptRow — 한 행의 수금 데이터를 CreateReceiptRequest로 변환.
// customerID는 호출 측이 partner_name → partner_id로 미리 해석.
// 반환: req, errs. errs가 비어있지 않으면 req는 무효이고 호출 측은 INSERT 건너뛰어야 함.
func parseReceiptRow(rowNum int, row map[string]interface{}, customerID string) (model.CreateReceiptRequest, []model.ImportError) {
	amount, amErr := requireFloat(rowNum, row, "amount")
	if amErr != nil {
		return model.CreateReceiptRequest{}, []model.ImportError{*amErr}
	}
	if amount <= 0 {
		return model.CreateReceiptRequest{}, []model.ImportError{{
			Row: rowNum, Field: "amount", Message: "amount는 양수여야 합니다",
		}}
	}

	req := model.CreateReceiptRequest{
		CustomerID:  customerID,
		ReceiptDate: getString(row, "receipt_date"),
		Amount:      amount,
		BankAccount: getStringPtr(row, "bank_account"),
		Memo:        getStringPtr(row, "memo"),
	}
	if msg := req.Validate(); msg != "" {
		return req, []model.ImportError{{Row: rowNum, Field: "receipt", Message: msg}}
	}
	return req, nil
}

// parseExpenseRow — 부대비용 행 파싱. companyID·blID(선택)는 호출 측이 미리 FK 해석해서 넘김.
// expense_type 허용값 + bl_or_month 필수 + amount 양수 + 페이로드 검증을 포함.
func parseExpenseRow(rowNum int, row map[string]interface{}, companyID string, blID *string) (model.CreateExpenseRequest, []model.ImportError) {
	if e := validateAllowedValues(rowNum, getString(row, "expense_type"), "expense_type", allowedExpenseTypes); e != nil {
		return model.CreateExpenseRequest{}, []model.ImportError{*e}
	}

	month := getString(row, "month")
	if blID == nil && month == "" {
		return model.CreateExpenseRequest{}, []model.ImportError{{
			Row: rowNum, Field: "bl_number/month", Message: "B/L 또는 월 중 하나는 필수입니다",
		}}
	}

	amount, amErr := requireFloat(rowNum, row, "amount")
	if amErr != nil {
		return model.CreateExpenseRequest{}, []model.ImportError{*amErr}
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

	req := model.CreateExpenseRequest{
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
	if msg := req.Validate(); msg != "" {
		return req, []model.ImportError{{Row: rowNum, Field: "expense", Message: msg}}
	}
	return req, nil
}

// parseOutboundRow — 출고 행 파싱. FK는 호출 측이 미리 해석:
//   companyID, productID, warehouseID (필수), wattageKW, orderID/targetCompanyID (선택)
// usage_category·group_trade 허용값은 호출 측이 검증.
// D-055: 워크플로우 체크박스 4개(tx_statement_ready/inspection_request_sent/approval_requested/tax_invoice_issued)
// + source_payload(JSONB) 도 함께 흘려보낸다.
func parseOutboundRow(rowNum int, row map[string]interface{}, companyID, productID, warehouseID string, wattageKW float64, orderID, targetCompanyID *string) (model.CreateOutboundRequest, []model.ImportError) {
	qty, qErr := requireInt(rowNum, row, "quantity")
	if qErr != nil {
		return model.CreateOutboundRequest{}, []model.ImportError{*qErr}
	}
	capacityKW := float64(qty) * wattageKW

	req := model.CreateOutboundRequest{
		OutboundDate:          getString(row, "outbound_date"),
		CompanyID:             companyID,
		ProductID:             productID,
		Quantity:              qty,
		CapacityKw:            &capacityKW,
		WarehouseID:           warehouseID,
		UsageCategory:         getString(row, "usage_category"),
		OrderID:               orderID,
		SiteName:              getStringPtr(row, "site_name"),
		SiteAddress:           getStringPtr(row, "site_address"),
		SpareQty:              getIntPtr(row, "spare_qty"),
		GroupTrade:            getBoolPtr(row, "group_trade"),
		TargetCompanyID:       targetCompanyID,
		ErpOutboundNo:         getStringPtr(row, "erp_outbound_no"),
		Status:                "active",
		Memo:                  getStringPtr(row, "memo"),
		TxStatementReady:      getBoolPtr(row, "tx_statement_ready"),
		InspectionRequestSent: getBoolPtr(row, "inspection_request_sent"),
		ApprovalRequested:     getBoolPtr(row, "approval_requested"),
		TaxInvoiceIssued:      getBoolPtr(row, "tax_invoice_issued"),
		SourcePayload:         getJSONObject(row, "source_payload"),
	}
	if msg := req.Validate(); msg != "" {
		return req, []model.ImportError{{Row: rowNum, Field: "outbound", Message: msg}}
	}
	return req, nil
}

// parseOrderRow — 수주 행 파싱. FK는 호출 측이 미리 해석:
//   companyID, customerID, productID, wattageKW
// receipt_method/management_category/fulfillment_source 허용값 + quantity·unit_price_wp 양수 검증 포함.
func parseOrderRow(rowNum int, row map[string]interface{}, companyID, customerID, productID string, wattageKW float64) (model.CreateOrderRequest, []model.ImportError) {
	for _, av := range []struct {
		val, field string
		allowed    map[string]bool
	}{
		{getString(row, "receipt_method"), "receipt_method", allowedReceiptMethods},
		{getString(row, "management_category"), "management_category", allowedManagementCategories},
		{getString(row, "fulfillment_source"), "fulfillment_source", allowedFulfillmentSources},
	} {
		if e := validateAllowedValues(rowNum, av.val, av.field, av.allowed); e != nil {
			return model.CreateOrderRequest{}, []model.ImportError{*e}
		}
	}

	qty, qErr := requireInt(rowNum, row, "quantity")
	if qErr != nil {
		return model.CreateOrderRequest{}, []model.ImportError{*qErr}
	}
	capacityKW := float64(qty) * wattageKW
	unitPriceWp, upErr := requireFloat(rowNum, row, "unit_price_wp")
	if upErr != nil {
		return model.CreateOrderRequest{}, []model.ImportError{*upErr}
	}

	req := model.CreateOrderRequest{
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
	if msg := req.Validate(); msg != "" {
		return req, []model.ImportError{{Row: rowNum, Field: "order", Message: msg}}
	}
	return req, nil
}

// parseSaleRow — 매출 행 파싱. 호출 측이 outbound 조회로 quantity·spec_wp를 미리 추출해 전달.
// EA 단가·VAT·합계 자동 계산. customerID도 호출 측이 FK 해석.
func parseSaleRow(rowNum int, row map[string]interface{}, outboundID, customerID string, outboundQuantity, specWP float64) (model.CreateSaleRequest, []model.ImportError) {
	unitPriceWp, upErr := requireFloat(rowNum, row, "unit_price_wp")
	if upErr != nil {
		return model.CreateSaleRequest{}, []model.ImportError{*upErr}
	}
	if unitPriceWp <= 0 {
		return model.CreateSaleRequest{}, []model.ImportError{{
			Row: rowNum, Field: "unit_price_wp", Message: "unit_price_wp는 양수여야 합니다",
		}}
	}

	// 자동계산: ea = wp × spec_wp, supply = ea × qty, vat = supply × 0.1, total = supply + vat
	unitPriceEa := unitPriceWp * specWP
	supplyAmount := unitPriceEa * outboundQuantity
	vatAmount := supplyAmount * 0.1
	totalAmount := supplyAmount + vatAmount

	invoiceQty := int(outboundQuantity)
	req := model.CreateSaleRequest{
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
	if msg := req.Validate(); msg != "" {
		return req, []model.ImportError{{Row: rowNum, Field: "sale", Message: msg}}
	}
	return req, nil
}

// parseDeclarationRow — 면장 행 파싱. blID·companyID는 호출 측 FK 해석.
func parseDeclarationRow(rowNum int, row map[string]interface{}, blID, companyID string) (model.CreateDeclarationRequest, []model.ImportError) {
	req := model.CreateDeclarationRequest{
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
	if msg := req.Validate(); msg != "" {
		return req, []model.ImportError{{Row: rowNum, Field: "declaration", Message: msg}}
	}
	return req, nil
}

// parseDeclarationCostRow — 면장 원가 행 파싱. declID·productID·wattageKW는 호출 측 미리 해석.
// quantity·exchange_rate·cif_total_krw 검증 + cif_wp_krw 자동 계산.
func parseDeclarationCostRow(rowNum int, row map[string]interface{}, declID, productID string, wattageKW float64) (model.CreateCostDetailRequest, []model.ImportError) {
	qty, qErr := requireInt(rowNum, row, "quantity")
	if qErr != nil {
		return model.CreateCostDetailRequest{}, []model.ImportError{*qErr}
	}
	capacityKW := float64(qty) * wattageKW
	exchangeRate, exErr := requireFloat(rowNum, row, "exchange_rate")
	if exErr != nil {
		return model.CreateCostDetailRequest{}, []model.ImportError{*exErr}
	}
	cifTotalKrw, cifErr := requireFloat(rowNum, row, "cif_total_krw")
	if cifErr != nil {
		return model.CreateCostDetailRequest{}, []model.ImportError{*cifErr}
	}

	// cif_wp_krw 자동: cif_total_krw / (qty * spec_wp * 1000) — capacityKW가 0이면 0
	cifWpKrw := 0.0
	if capacityKW > 0 {
		cifWpKrw = cifTotalKrw / (capacityKW * 1000)
	}

	req := model.CreateCostDetailRequest{
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
	if msg := req.Validate(); msg != "" {
		return req, []model.ImportError{{Row: rowNum, Field: "cost_detail", Message: msg}}
	}
	return req, nil
}

// inboundRowGroup — 입고 Import에서 같은 B/L 번호로 묶인 행 그룹.
// FirstRow의 B/L 기본정보(currency, exchange_rate, eta 등)가 그 그룹 전체에 적용됨.
type inboundRowGroup struct {
	BLNumber  string
	FirstRow  map[string]interface{}
	FirstIdx  int
	LineRows  []map[string]interface{}
	LineIdxes []int
}

// groupInboundRowsByBL — 입고 Import 행을 B/L 번호별로 그룹화하면서 검증 수행.
// 필수 누락·허용값 위반은 errors. 같은 B/L 안에서 기본정보가 다른 라인은 warnings.
// FK 해석·INSERT는 호출 측이 그룹별로 처리.
//
// 반환:
//   - groups: B/L 번호 → 그룹
//   - order: B/L 번호의 등장 순서 (deterministic INSERT 순서 보장)
//   - errors/warnings: 검증 결과
func groupInboundRowsByBL(rows []map[string]interface{}) (
	groups map[string]*inboundRowGroup,
	order []string,
	errors []model.ImportError,
	warnings []model.ImportWarning,
) {
	groups = make(map[string]*inboundRowGroup)

	for i, row := range rows {
		rowNum := i + 2 // 엑셀 1행은 헤더, 데이터는 2행부터
		blNum := getString(row, "bl_number")

		// 필수 검증
		errs := validateRequired(rowNum, row, []string{
			"bl_number", "inbound_type", "company_code", "manufacturer_name",
			"currency", "product_code", "quantity", "item_type", "payment_type", "usage_category",
		})
		if len(errs) > 0 {
			errors = append(errors, errs...)
			continue
		}

		// 허용값 검증
		allowedFailed := false
		for _, av := range []struct {
			val, field string
			allowed    map[string]bool
		}{
			{getString(row, "inbound_type"), "inbound_type", allowedInboundTypes},
			{getString(row, "item_type"), "item_type", allowedItemTypes},
			{getString(row, "payment_type"), "payment_type", allowedPaymentTypes},
			{getString(row, "usage_category"), "usage_category", allowedUsageCategories},
		} {
			if e := validateAllowedValues(rowNum, av.val, av.field, av.allowed); e != nil {
				errors = append(errors, *e)
				allowedFailed = true
			}
		}
		if allowedFailed {
			continue
		}

		// 그룹 등록 또는 기본정보 일관성 경고
		if _, exists := groups[blNum]; !exists {
			groups[blNum] = &inboundRowGroup{BLNumber: blNum, FirstRow: row, FirstIdx: rowNum}
			order = append(order, blNum)
		} else {
			first := groups[blNum].FirstRow
			for _, f := range []string{"etd", "eta", "actual_arrival", "port", "forwarder"} {
				firstVal := getString(first, f)
				curVal := getString(row, f)
				if curVal != "" && firstVal != "" && curVal != firstVal {
					warnings = append(warnings, model.ImportWarning{
						Row: rowNum, Field: f,
						Message: fmt.Sprintf("B/L 기본정보(%s)가 첫 행과 다릅니다 (첫 행 값 사용)", f),
					})
				}
			}
		}

		groups[blNum].LineRows = append(groups[blNum].LineRows, row)
		groups[blNum].LineIdxes = append(groups[blNum].LineIdxes, rowNum)
	}

	return groups, order, errors, warnings
}

// --- 발주(PO)·신용장(LC) Import 파서 ---

// 허용 contract_type — D-086 기준 spot/frame만 신규 등록 허용 (레거시는 차단).
var allowedPOContractTypesForImport = map[string]bool{
	"spot":  true,
	"frame": true,
}

// 한국어 라벨 → 코드 정규화. 프론트가 라벨을 보내도 받아 처리한다.
var poContractTypeAliases = map[string]string{
	"spot":  "spot",
	"frame": "frame",
	"스팟":    "spot",
	"프레임":   "frame",
}

// usance_type 라벨 정규화 — 모델 검증은 buyers/shippers만 허용.
var lcUsanceTypeAliases = map[string]string{
	"buyers":            "buyers",
	"shippers":          "shippers",
	"BANKER'S USANCE":   "buyers",
	"BANKERS USANCE":    "buyers",
	"BANKER":            "buyers",
	"SHIPPER'S USANCE":  "shippers",
	"SHIPPERS USANCE":   "shippers",
	"SHIPPER":           "shippers",
	"AT SIGHT":          "",
	"":                  "",
}

// poImportGroup — 같은 po_number 자연키로 묶인 PO Import 행 그룹.
// FirstRow의 헤더 정보(법인·제조사·계약유형·계약일·인코텀즈·결제조건)가 그룹 전체에 적용.
type poImportGroup struct {
	PONumber  string
	FirstRow  map[string]interface{}
	FirstIdx  int
	LineRows  []map[string]interface{}
	LineIdxes []int
}

// groupPORowsByPONumber — PO Import 행을 발주번호별로 그룹화하면서 검증 수행.
// 각 행에 대해 필수값(po_number, company_code, manufacturer_name, contract_type, contract_date,
// product_code, quantity, unit_price_usd_wp, item_type, payment_type)을 검사하고,
// 같은 po_number 안에서 헤더값이 다르면 경고만 발생시키고 첫 행 값을 채택한다.
func groupPORowsByPONumber(rows []map[string]interface{}) (
	map[string]*poImportGroup, []string, []model.ImportError, []model.ImportWarning,
) {
	groups := map[string]*poImportGroup{}
	order := []string{}
	var errors []model.ImportError
	var warnings []model.ImportWarning

	for i, row := range rows {
		rowNum := i + 2

		errs := validateRequired(rowNum, row, []string{
			"po_number", "company_code", "manufacturer_name",
			"contract_type", "contract_date",
			"product_code", "quantity", "unit_price_usd_wp",
			"item_type", "payment_type",
		})
		if len(errs) > 0 {
			errors = append(errors, errs...)
			continue
		}

		// contract_type 정규화 + 허용값 검증
		ctRaw := getString(row, "contract_type")
		if ct, ok := poContractTypeAliases[ctRaw]; ok {
			row["contract_type"] = ct
		}
		if !allowedPOContractTypesForImport[getString(row, "contract_type")] {
			errors = append(errors, model.ImportError{
				Row: rowNum, Field: "contract_type",
				Message: fmt.Sprintf("%d행: contract_type은 spot/frame 중 하나여야 합니다", rowNum),
			})
			continue
		}

		// item_type / payment_type 허용값
		allowedFailed := false
		for _, av := range []struct {
			val, field string
			allowed    map[string]bool
		}{
			{getString(row, "item_type"), "item_type", allowedItemTypes},
			{getString(row, "payment_type"), "payment_type", allowedPaymentTypes},
		} {
			if e := validateAllowedValues(rowNum, av.val, av.field, av.allowed); e != nil {
				errors = append(errors, *e)
				allowedFailed = true
			}
		}
		if allowedFailed {
			continue
		}

		poNum := getString(row, "po_number")
		if _, exists := groups[poNum]; !exists {
			groups[poNum] = &poImportGroup{PONumber: poNum, FirstRow: row, FirstIdx: rowNum}
			order = append(order, poNum)
		} else {
			first := groups[poNum].FirstRow
			// 같은 PO 안에서 헤더 일관성 — 다르면 경고하고 첫 행 값 채택.
			for _, f := range []string{
				"company_code", "manufacturer_name", "contract_type", "contract_date",
				"incoterms", "payment_terms", "contract_period_start", "contract_period_end",
			} {
				firstVal := getString(first, f)
				curVal := getString(row, f)
				if curVal != "" && firstVal != "" && curVal != firstVal {
					warnings = append(warnings, model.ImportWarning{
						Row: rowNum, Field: f,
						Message: fmt.Sprintf("PO 헤더(%s)가 첫 행과 다릅니다 (첫 행 값 사용)", f),
					})
				}
			}
		}

		groups[poNum].LineRows = append(groups[poNum].LineRows, row)
		groups[poNum].LineIdxes = append(groups[poNum].LineIdxes, rowNum)
	}

	return groups, order, errors, warnings
}

// parsePOLineRow — PO 라인 행을 CreatePOLineRequest로 변환.
// USD/Wp 단가를 받아 USD per panel(unit_price_usd) + total_amount_usd 자동 계산.
// productID·wattageKW는 호출 측이 미리 해석.
func parsePOLineRow(rowNum int, row map[string]interface{}, productID string, wattageKW float64) (model.CreatePOLineRequest, []model.ImportError) {
	qty, qErr := requireInt(rowNum, row, "quantity")
	if qErr != nil {
		return model.CreatePOLineRequest{}, []model.ImportError{*qErr}
	}
	if qty <= 0 {
		return model.CreatePOLineRequest{}, []model.ImportError{{
			Row: rowNum, Field: "quantity", Message: "quantity는 양수여야 합니다",
		}}
	}
	unitPriceWp, upErr := requireFloat(rowNum, row, "unit_price_usd_wp")
	if upErr != nil {
		return model.CreatePOLineRequest{}, []model.ImportError{*upErr}
	}
	if unitPriceWp <= 0 {
		return model.CreatePOLineRequest{}, []model.ImportError{{
			Row: rowNum, Field: "unit_price_usd_wp", Message: "unit_price_usd_wp는 양수여야 합니다",
		}}
	}

	// USD/Wp × Wp/panel = USD/panel. wattage_kw(kW/panel) × 1000 = Wp/panel.
	unitPriceUsd := unitPriceWp * wattageKW * 1000.0
	totalAmountUsd := unitPriceUsd * float64(qty)

	itemType := getString(row, "item_type")
	paymentType := getString(row, "payment_type")
	req := model.CreatePOLineRequest{
		ProductID:      productID,
		Quantity:       qty,
		UnitPriceUSD:   &unitPriceUsd,
		TotalAmountUSD: &totalAmountUsd,
		ItemType:       &itemType,
		PaymentType:    &paymentType,
		Memo:           getStringPtr(row, "line_memo"),
	}
	return req, nil
}

// parseLCRow — LC 행을 CreateLCRequest로 변환. po_id/bank_id/companyID는 호출 측이 해석.
func parseLCRow(rowNum int, row map[string]interface{}, poID, bankID, companyID string) (model.CreateLCRequest, []model.ImportError) {
	amountUsd, aErr := requireFloat(rowNum, row, "amount_usd")
	if aErr != nil {
		return model.CreateLCRequest{}, []model.ImportError{*aErr}
	}
	if amountUsd <= 0 {
		return model.CreateLCRequest{}, []model.ImportError{{
			Row: rowNum, Field: "amount_usd", Message: "amount_usd는 양수여야 합니다",
		}}
	}

	// usance_type — 라벨/코드 양쪽 받기. 빈 값이면 nil 유지.
	var usanceType *string
	if raw := getString(row, "usance_type"); raw != "" {
		key := strings.ToUpper(strings.TrimSpace(raw))
		if alias, ok := lcUsanceTypeAliases[key]; ok {
			if alias != "" {
				usanceType = &alias
			}
		} else if v, ok := lcUsanceTypeAliases[raw]; ok {
			if v != "" {
				usanceType = &v
			}
		} else {
			// 알 수 없는 값은 검증 실패로.
			return model.CreateLCRequest{}, []model.ImportError{{
				Row: rowNum, Field: "usance_type",
				Message: "usance_type은 BANKER'S USANCE / SHIPPER'S USANCE / AT SIGHT 중 하나여야 합니다",
			}}
		}
	}

	req := model.CreateLCRequest{
		POID:         poID,
		LCNumber:     getStringPtr(row, "lc_number"),
		BankID:       bankID,
		CompanyID:    companyID,
		OpenDate:     getStringPtr(row, "open_date"),
		AmountUSD:    amountUsd,
		TargetQty:    getIntPtr(row, "target_qty"),
		UsanceDays:   getIntPtr(row, "usance_days"),
		UsanceType:   usanceType,
		MaturityDate: getStringPtr(row, "maturity_date"),
		Status:       "pending",
		Memo:         getStringPtr(row, "memo"),
	}
	if msg := req.Validate(); msg != "" {
		return req, []model.ImportError{{Row: rowNum, Field: "lc", Message: msg}}
	}
	return req, nil
}
