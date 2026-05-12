package cost_detail

// CostDetail — 원가 명세(3단계: FOB→CIF→Landed) 구조체
// 비유: "원가 계산서" — 모듈 1장이 FOB에서 CIF, Landed까지 거치며 쌓이는 비용 내역
type CostDetail struct {
	CostID        string   `json:"cost_id"`
	DeclarationID string   `json:"declaration_id"`
	ProductID     string   `json:"product_id"`
	Quantity      int      `json:"quantity"`
	CapacityKw    *float64 `json:"capacity_kw"`

	// FOB 단계
	FobUnitUsd  *float64 `json:"fob_unit_usd"`
	FobTotalUsd *float64 `json:"fob_total_usd"`
	FobWpKrw    *float64 `json:"fob_wp_krw"`

	// CIF 단계
	ExchangeRate float64  `json:"exchange_rate"`
	CifUnitUsd   *float64 `json:"cif_unit_usd"`
	CifTotalUsd  *float64 `json:"cif_total_usd"`
	CifTotalKrw  float64  `json:"cif_total_krw"`
	CifWpKrw     float64  `json:"cif_wp_krw"`

	// 관세 단계
	TariffRate   *float64 `json:"tariff_rate"`
	TariffAmount *float64 `json:"tariff_amount"`
	VatAmount    *float64 `json:"vat_amount"`

	// Landed 단계
	CustomsFee     *float64 `json:"customs_fee"`
	IncidentalCost *float64 `json:"incidental_cost"`
	LandedTotalKrw *float64 `json:"landed_total_krw"`
	LandedWpKrw    *float64 `json:"landed_wp_krw"`

	Memo *string `json:"memo"`
}

// CreateCostDetailRequest — 원가 명세 등록 시 클라이언트가 보내는 데이터
// 비유: "원가 계산서 등록 신청서" — 면장, 품번, 수량, 환율, CIF 필수 기재
type CreateCostDetailRequest struct {
	DeclarationID string   `json:"declaration_id"`
	ProductID     string   `json:"product_id"`
	Quantity      int      `json:"quantity"`
	CapacityKw    *float64 `json:"capacity_kw"`

	FobUnitUsd  *float64 `json:"fob_unit_usd"`
	FobTotalUsd *float64 `json:"fob_total_usd"`
	FobWpKrw    *float64 `json:"fob_wp_krw"`

	ExchangeRate float64  `json:"exchange_rate"`
	CifUnitUsd   *float64 `json:"cif_unit_usd"`
	CifTotalUsd  *float64 `json:"cif_total_usd"`
	CifTotalKrw  float64  `json:"cif_total_krw"`
	CifWpKrw     float64  `json:"cif_wp_krw"`

	TariffRate   *float64 `json:"tariff_rate"`
	TariffAmount *float64 `json:"tariff_amount"`
	VatAmount    *float64 `json:"vat_amount"`

	CustomsFee     *float64 `json:"customs_fee"`
	IncidentalCost *float64 `json:"incidental_cost"`
	LandedTotalKrw *float64 `json:"landed_total_krw"`
	LandedWpKrw    *float64 `json:"landed_wp_krw"`

	Memo *string `json:"memo"`
}

// Validate — 원가 명세 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 원가 계산서 필수 항목 확인
func (req *CreateCostDetailRequest) Validate() string {
	if req.DeclarationID == "" {
		return "declaration_id는 필수 항목입니다"
	}
	if req.ProductID == "" {
		return "product_id는 필수 항목입니다"
	}
	if req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	if req.ExchangeRate <= 0 {
		return "exchange_rate는 양수여야 합니다"
	}
	if req.CifTotalKrw == 0 {
		return "cif_total_krw는 필수 항목입니다"
	}
	if req.CifWpKrw == 0 {
		return "cif_wp_krw는 필수 항목입니다"
	}
	return ""
}

// UpdateCostDetailRequest — 원가 명세 수정 시 클라이언트가 보내는 데이터
// 비유: "원가 계산서 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateCostDetailRequest struct {
	ProductID  *string  `json:"product_id,omitempty"`
	Quantity   *int     `json:"quantity,omitempty"`
	CapacityKw *float64 `json:"capacity_kw,omitempty"`

	FobUnitUsd  *float64 `json:"fob_unit_usd,omitempty"`
	FobTotalUsd *float64 `json:"fob_total_usd,omitempty"`
	FobWpKrw    *float64 `json:"fob_wp_krw,omitempty"`

	ExchangeRate *float64 `json:"exchange_rate,omitempty"`
	CifUnitUsd   *float64 `json:"cif_unit_usd,omitempty"`
	CifTotalUsd  *float64 `json:"cif_total_usd,omitempty"`
	CifTotalKrw  *float64 `json:"cif_total_krw,omitempty"`
	CifWpKrw     *float64 `json:"cif_wp_krw,omitempty"`

	TariffRate   *float64 `json:"tariff_rate,omitempty"`
	TariffAmount *float64 `json:"tariff_amount,omitempty"`
	VatAmount    *float64 `json:"vat_amount,omitempty"`

	CustomsFee     *float64 `json:"customs_fee,omitempty"`
	IncidentalCost *float64 `json:"incidental_cost,omitempty"`
	LandedTotalKrw *float64 `json:"landed_total_krw,omitempty"`
	LandedWpKrw    *float64 `json:"landed_wp_krw,omitempty"`

	Memo *string `json:"memo,omitempty"`
}

// Validate — 원가 명세 수정 요청의 입력값을 검증
func (req *UpdateCostDetailRequest) Validate() string {
	if req.ProductID != nil && *req.ProductID == "" {
		return "product_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.Quantity != nil && *req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	if req.ExchangeRate != nil && *req.ExchangeRate <= 0 {
		return "exchange_rate는 양수여야 합니다"
	}
	return ""
}
