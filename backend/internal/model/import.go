package model

// ImportResponse — 엑셀 Import API의 공통 응답 구조체
// 비유: "일괄 등록 결과 보고서" — 성공/에러/경고 건수와 상세 내역
// D-057: ImportedIDs — 외부 양식 변환 후 후속 매출 자동 등록을 위해 출고 import 가
//        등록된 outbound_id 목록을 응답에 포함. 다른 import 종류는 빈 배열.
type ImportResponse struct {
	Success       bool            `json:"success"`
	ImportedCount int             `json:"imported_count"`
	ErrorCount    int             `json:"error_count"`
	WarningCount  int             `json:"warning_count"`
	Errors        []ImportError   `json:"errors"`
	Warnings      []ImportWarning `json:"warnings"`
	ImportedIDs   []string        `json:"imported_ids,omitempty"`
}

// ImportError — Import 시 개별 행의 에러 정보
// 비유: "에러 스티커" — 몇 행, 어떤 필드에, 무슨 문제가 있는지 기록
type ImportError struct {
	Row     int    `json:"row"`
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ImportWarning — Import 시 개별 행의 경고 정보
// 비유: "경고 메모" — 에러는 아니지만 주의가 필요한 사항
type ImportWarning struct {
	Row     int    `json:"row"`
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ImportRowsRequest — 일반 Import 요청 (행 배열)
// 비유: "일괄 등록 신청서" — 여러 행을 한 번에 등록
type ImportRowsRequest struct {
	Rows []map[string]interface{} `json:"rows"`
}

// DeclarationImportRequest — 면장+원가 통합 Import 요청 (지적 2 반영)
// 비유: "면장+원가 일괄 등록 신청서" — 면장과 원가를 한 번에 전송
type DeclarationImportRequest struct {
	Declarations []map[string]interface{} `json:"declarations"`
	Costs        []map[string]interface{} `json:"costs"`
}
