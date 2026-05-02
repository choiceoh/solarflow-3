package handler

// io_import_parsers — Excel 행을 INSERT 페이로드로 변환하는 pure 함수 모음.
// 핸들러(io_import.go)는 FK 해석·INSERT만 담당하고, 검증·필드 추출·INSERT 페이로드 빌드는 본 파일에서.
//
// FK 해석은 호출 측에서 미리 수행해 ID를 인자로 넘긴다 (DB 의존 없이 단위테스트 가능).
// 단위테스트는 io_import_parsers_test.go.
//
// 현재 추출 완료: parseReceiptRow, groupInboundRowsByBL.
// 미추출 (동일 패턴으로 추가 가능): Outbound, Sales, Declarations, Expenses, Orders.

import (
	"fmt"

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
