package lc

// LcFeeResponse — LC 수수료 계산 응답
type LcFeeResponse struct {
	Items        []LcFeeItem  `json:"items"`
	Summary      LcFeeSummary `json:"summary"`
	FeeNote      string       `json:"fee_note"`
	CalculatedAt string       `json:"calculated_at"`
}

// LcFeeItem — LC 수수료 라인아이템
type LcFeeItem struct {
	LCID           string                `json:"lc_id"`
	LCNumber       *string               `json:"lc_number"`
	PONumber       *string               `json:"po_number"`
	BankName       string                `json:"bank_name"`
	CompanyName    string                `json:"company_name"`
	AmountUSD      float64               `json:"amount_usd"`
	OpenDate       *string               `json:"open_date"`
	UsanceDays     int                   `json:"usance_days"`
	MaturityDate   *string               `json:"maturity_date"`
	DaysToMaturity int64                 `json:"days_to_maturity"`
	Status         string                `json:"status"`
	ExchangeRate   float64               `json:"exchange_rate"`
	OpeningFee     LcFeeDetail           `json:"opening_fee"`
	AcceptanceFee  LcAcceptanceFeeDetail `json:"acceptance_fee"`
	TotalFeeKRW    float64               `json:"total_fee_krw"`
}

// LcFeeDetail — 수수료 상세
type LcFeeDetail struct {
	Rate      float64 `json:"rate"`
	AmountKRW float64 `json:"amount_krw"`
}

// LcAcceptanceFeeDetail — 인수수수료 상세
type LcAcceptanceFeeDetail struct {
	Rate      float64 `json:"rate"`
	Days      int     `json:"days"`
	AmountKRW float64 `json:"amount_krw"`
	Formula   string  `json:"formula"`
}

// LcFeeSummary — 수수료 합계
type LcFeeSummary struct {
	TotalLCAmountUSD      float64 `json:"total_lc_amount_usd"`
	TotalOpeningFeeKRW    float64 `json:"total_opening_fee_krw"`
	TotalAcceptanceFeeKRW float64 `json:"total_acceptance_fee_krw"`
	TotalFeeKRW           float64 `json:"total_fee_krw"`
}

// LcLimitTimelineResponse — 한도 복원 타임라인 응답
type LcLimitTimelineResponse struct {
	Banks        []BankTimeline  `json:"banks"`
	TotalSummary TimelineSummary `json:"total_summary"`
	CalculatedAt string          `json:"calculated_at"`
}

// BankTimeline — 은행별 한도 타임라인
type BankTimeline struct {
	BankID              string             `json:"bank_id"`
	BankName            string             `json:"bank_name"`
	CompanyName         string             `json:"company_name"`
	LCLimitUSD          float64            `json:"lc_limit_usd"`
	CurrentUsedUSD      float64            `json:"current_used_usd"`
	CurrentAvailableUSD float64            `json:"current_available_usd"`
	UsageRate           float64            `json:"usage_rate"`
	RestorationEvents   []RestorationEvent `json:"restoration_events"`
}

// RestorationEvent — 한도 복원 이벤트
type RestorationEvent struct {
	Date                   string  `json:"date"`
	LCNumber               *string `json:"lc_number"`
	AmountUSD              float64 `json:"amount_usd"`
	CumulativeAvailableUSD float64 `json:"cumulative_available_usd"`
	PONumber               *string `json:"po_number"`
}

// TimelineSummary — 전체 합계
type TimelineSummary struct {
	TotalLimitUSD      float64              `json:"total_limit_usd"`
	TotalUsedUSD       float64              `json:"total_used_usd"`
	TotalAvailableUSD  float64              `json:"total_available_usd"`
	TotalUsageRate     float64              `json:"total_usage_rate"`
	ProjectedAvailable []ProjectedAvailable `json:"projected_available"`
}

// ProjectedAvailable — 월별 예상 가용 한도
type ProjectedAvailable struct {
	Month        string  `json:"month"`
	AvailableUSD float64 `json:"available_usd"`
}

// LcMaturityAlertResponse — 만기 알림 응답
type LcMaturityAlertResponse struct {
	Alerts       []MaturityAlert `json:"alerts"`
	Count        int             `json:"count"`
	CalculatedAt string          `json:"calculated_at"`
}

// MaturityAlert — 만기 알림 항목
type MaturityAlert struct {
	LCID          string  `json:"lc_id"`
	LCNumber      *string `json:"lc_number"`
	BankName      string  `json:"bank_name"`
	CompanyName   string  `json:"company_name"`
	AmountUSD     float64 `json:"amount_usd"`
	MaturityDate  string  `json:"maturity_date"`
	DaysRemaining int64   `json:"days_remaining"`
	PONumber      *string `json:"po_number"`
	Severity      string  `json:"severity"`
}
