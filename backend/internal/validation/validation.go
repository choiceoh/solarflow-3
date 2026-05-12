// Package validation — PO/BL/LC 라인 도메인의 공통 valid 값 spec.
//
// PR-D1 에서 분리: 이전엔 bl/model_line.go + lc/model_line.go + po/constants.go +
// handler/io_import.go 안 dup. 본 패키지로 통합.
//
// 도메인별 *고유* spec (예: BL 의 validUsageCategories, io_import 의
// allowedExpenseTypes/ReceiptMethods/...) 은 그대로 자기 위치 유지 — 본 패키지는
// *3+ 곳 dup 였던 spec* 만.
package validation

import "regexp"

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
