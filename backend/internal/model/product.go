package model

import "unicode/utf8"

// Product — 품번(모듈 규격) 정보를 담는 구조체
// 비유: "모듈 규격 카탈로그 카드" — JKM635, TSM-720 같은 모듈의 상세 사양
// D-056: DB 컬럼은 NULL 허용으로 완화됐지만 Go 모델은 호환성 유지를 위해 값 타입 유지.
//        NULL 행은 JSON unmarshal 시 0/"" 으로 들어옴(자동 등록 행은 변환기가 추론값을 채워 INSERT 함).
type Product struct {
	ProductID      string   `json:"product_id"`
	ProductCode    string   `json:"product_code"`
	ProductName    string   `json:"product_name"`
	ManufacturerID string   `json:"manufacturer_id"`
	SpecWP         int      `json:"spec_wp"`
	WattageKW      float64  `json:"wattage_kw"`
	ModuleWidthMM  int      `json:"module_width_mm"`
	ModuleHeightMM int      `json:"module_height_mm"`
	ModuleDepthMM  *int     `json:"module_depth_mm"`
	WeightKG       *float64 `json:"weight_kg"`
	WaferPlatform  *string  `json:"wafer_platform"`
	CellConfig     *string  `json:"cell_config"`
	SeriesName     *string  `json:"series_name"`
	IsActive       bool     `json:"is_active"`
	Memo           *string  `json:"memo"`
}

// ProductWithManufacturer — 제조사 정보를 포함한 품번 조회 결과
// 비유: 카탈로그 카드에 제조사 명함이 함께 붙어 나오는 것
type ProductWithManufacturer struct {
	Product
	Manufacturers *ManufacturerSummary `json:"manufacturers"`
}

// ManufacturerSummary — 품번 조회 시 함께 반환되는 제조사 요약 정보
type ManufacturerSummary struct {
	NameKR          string  `json:"name_kr"`
	NameEN          string  `json:"name_en"`
	ShortName       *string `json:"short_name"` // 약칭 — 화면 표시용
	DomesticForeign string  `json:"domestic_foreign"`
}

// CreateProductRequest — 품번 등록 시 클라이언트가 보내는 데이터
// 비유: "모듈 규격 등록 신청서" — 필수 사양을 빠짐없이 기재해야 접수
type CreateProductRequest struct {
	ProductCode    string   `json:"product_code"`
	ProductName    string   `json:"product_name"`
	ManufacturerID string   `json:"manufacturer_id"`
	SpecWP         int      `json:"spec_wp"`
	WattageKW      float64  `json:"wattage_kw"`
	ModuleWidthMM  int      `json:"module_width_mm"`
	ModuleHeightMM int      `json:"module_height_mm"`
	ModuleDepthMM  *int     `json:"module_depth_mm"`
	WeightKG       *float64 `json:"weight_kg"`
	WaferPlatform  *string  `json:"wafer_platform"`
	CellConfig     *string  `json:"cell_config"`
	SeriesName     *string  `json:"series_name"`
	Memo           *string  `json:"memo"`
}

// Validate — 품번 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 필수 사양 빈 칸, 글자 수, 양수 여부 확인
func (req *CreateProductRequest) Validate() string {
	if req.ProductCode == "" {
		return "product_code는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.ProductCode) > 30 {
		return "product_code는 30자를 초과할 수 없습니다"
	}
	if req.ProductName == "" {
		return "product_name은 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.ProductName) > 100 {
		return "product_name은 100자를 초과할 수 없습니다"
	}
	if req.ManufacturerID == "" {
		return "manufacturer_id는 필수 항목입니다"
	}
	if req.SpecWP <= 0 {
		return "spec_wp는 양수여야 합니다"
	}
	if req.WattageKW <= 0 {
		return "wattage_kw는 양수여야 합니다"
	}
	if req.ModuleWidthMM <= 0 {
		return "module_width_mm는 양수여야 합니다"
	}
	if req.ModuleHeightMM <= 0 {
		return "module_height_mm는 양수여야 합니다"
	}
	return ""
}

// UpdateProductRequest — 품번 수정 시 클라이언트가 보내는 데이터
// 비유: "모듈 규격 변경 신청서" — 바꾸고 싶은 사양만 적어서 제출
type UpdateProductRequest struct {
	ProductCode    *string  `json:"product_code,omitempty"`
	ProductName    *string  `json:"product_name,omitempty"`
	ManufacturerID *string  `json:"manufacturer_id,omitempty"`
	SpecWP         *int     `json:"spec_wp,omitempty"`
	WattageKW      *float64 `json:"wattage_kw,omitempty"`
	ModuleWidthMM  *int     `json:"module_width_mm,omitempty"`
	ModuleHeightMM *int     `json:"module_height_mm,omitempty"`
	ModuleDepthMM  *int     `json:"module_depth_mm,omitempty"`
	WeightKG       *float64 `json:"weight_kg,omitempty"`
	WaferPlatform  *string  `json:"wafer_platform,omitempty"`
	CellConfig     *string  `json:"cell_config,omitempty"`
	SeriesName     *string  `json:"series_name,omitempty"`
	Memo           *string  `json:"memo,omitempty"`
}

// Validate — 품번 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 동일한 규칙으로 검증
func (req *UpdateProductRequest) Validate() string {
	if req.ProductCode != nil {
		if *req.ProductCode == "" {
			return "product_code는 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.ProductCode) > 30 {
			return "product_code는 30자를 초과할 수 없습니다"
		}
	}
	if req.ProductName != nil {
		if *req.ProductName == "" {
			return "product_name은 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.ProductName) > 100 {
			return "product_name은 100자를 초과할 수 없습니다"
		}
	}
	if req.ManufacturerID != nil && *req.ManufacturerID == "" {
		return "manufacturer_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.SpecWP != nil && *req.SpecWP <= 0 {
		return "spec_wp는 양수여야 합니다"
	}
	if req.WattageKW != nil && *req.WattageKW <= 0 {
		return "wattage_kw는 양수여야 합니다"
	}
	if req.ModuleWidthMM != nil && *req.ModuleWidthMM <= 0 {
		return "module_width_mm는 양수여야 합니다"
	}
	if req.ModuleHeightMM != nil && *req.ModuleHeightMM <= 0 {
		return "module_height_mm는 양수여야 합니다"
	}
	return ""
}
