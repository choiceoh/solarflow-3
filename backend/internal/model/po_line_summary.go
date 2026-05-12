package model

// ProductSummaryForPOLine — PO 라인아이템 조회 시 함께 반환되는 품번 요약 정보.
//
// 본래 PO 도메인 (backend/internal/domains/po) 에 속하지만, LC 라인이 같은 type 을
// 임베드해 cycle 발생 (po → model → po). PR-B 의 trade-off 로 model 패키지에 보관.
// PR-C 에서 LC 도 colocation 되면 po 패키지로 옮기고 lc 가 po.ProductSummaryForPOLine
// 으로 단방향 import 가능.
type ProductSummaryForPOLine struct {
	ProductCode    string `json:"product_code"`
	ProductName    string `json:"product_name"`
	SpecWP         int    `json:"spec_wp"`
	ModuleWidthMM  int    `json:"module_width_mm"`
	ModuleHeightMM int    `json:"module_height_mm"`
}
