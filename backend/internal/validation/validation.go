// Package validation — PO/BL/LC 라인 도메인의 공통 valid 값 spec.
//
// PR-D1 에서 분리: 이전엔 bl/model_line.go + lc/model_line.go + po/constants.go +
// handler/io_import.go 안 dup. 본 패키지로 통합.
//
// 도메인별 *고유* spec (예: BL 의 validUsageCategories, io_import 의
// allowedExpenseTypes/ReceiptMethods/...) 은 그대로 자기 위치 유지 — 본 패키지는
// *3+ 곳 dup 였던 spec* 만.
package validation

import (
	"regexp"
	"strings"
)

// FormatAllowedValues — dbschema 가 자동 추출한 CHECK 허용값 슬라이스를 검증 에러 메시지의
// "a", "b", "c" 중 하나여야 합니다 형식으로 직렬화. 메시지가 슬라이스에 자동 동기되어
// DB CHECK 가 갱신되면 사용자 노출 텍스트도 따라간다 (수동 동기화 누락 차단).
//
// 사용:
//   import "solarflow-backend/internal/dbschema"
//   if !slices.Contains(dbschema.BlShipmentsStatusValues, req.Status) {
//       return "status는 " + validation.FormatAllowedValues(dbschema.BlShipmentsStatusValues)
//   }
func FormatAllowedValues(vals []string) string {
	quoted := make([]string, len(vals))
	for i, v := range vals {
		quoted[i] = `"` + v + `"`
	}
	return strings.Join(quoted, ", ") + " 중 하나여야 합니다"
}

// ItemTypes — PO/BL/LC 라인의 item_type 허용 값.
// 종전 별칭: allowedItemTypes (po, handler), validItemTypes (bl, lc).
var ItemTypes = map[string]bool{
	"main":  true,
	"spare": true,
}

// PaymentTypes — PO/BL/LC 라인의 payment_type 허용 값.
// 종전 별칭: allowedPaymentTypes (po, handler), validPaymentTypes (bl, lc).
var PaymentTypes = map[string]bool{
	"paid": true,
	"free": true,
}

// UUIDRe — UUID v4/일반 UUID 형식 검증 (소문자/대문자 허용).
// 종전 위치: bl/model_line.go, lc/model_line.go.
var UUIDRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
