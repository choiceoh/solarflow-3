package model

// MarginAnalysisResponse — 마진 분석 응답
type MarginAnalysisResponse struct {
	Items        []MarginItemResp  `json:"items"`
	Summary      MarginSummaryResp `json:"summary"`
	CalculatedAt string            `json:"calculated_at"`
}

// MarginItemResp — 마진 분석 라인아이템
type MarginItemResp struct {
	ManufacturerName      string   `json:"manufacturer_name"`
	ProductCode           string   `json:"product_code"`
	ProductName           string   `json:"product_name"`
	SpecWP                int      `json:"spec_wp"`
	TotalSoldQty          int64    `json:"total_sold_qty"`
	TotalSoldKW           float64  `json:"total_sold_kw"`
	AvgSalePriceWP        float64  `json:"avg_sale_price_wp"`
	AvgCostWP             *float64 `json:"avg_cost_wp"`
	MarginWP              *float64 `json:"margin_wp"`
	MarginRate            *float64 `json:"margin_rate"`
	TotalRevenueKRW       float64  `json:"total_revenue_krw"`
	TotalCostKRW          *float64 `json:"total_cost_krw"`
	TotalMarginKRW        *float64 `json:"total_margin_krw"`
	CostCoveredRevenueKRW float64  `json:"cost_covered_revenue_krw"`
	CostMissingRevenueKRW float64  `json:"cost_missing_revenue_krw"`
	CostBasis             string   `json:"cost_basis"`
	SaleCount             int64    `json:"sale_count"`
}

// MarginSummaryResp — 마진 합계
type MarginSummaryResp struct {
	TotalSoldKW           float64 `json:"total_sold_kw"`
	TotalRevenueKRW       float64 `json:"total_revenue_krw"`
	TotalCostKRW          float64 `json:"total_cost_krw"`
	TotalMarginKRW        float64 `json:"total_margin_krw"`
	OverallMarginRate     float64 `json:"overall_margin_rate"`
	CostCoveredRevenueKRW float64 `json:"cost_covered_revenue_krw"`
	CostMissingRevenueKRW float64 `json:"cost_missing_revenue_krw"`
	CostCoverageRate      float64 `json:"cost_coverage_rate"`
	CostBasis             string  `json:"cost_basis"`
}

// CustomerAnalysisResponse — 거래처 분석 응답
type CustomerAnalysisResponse struct {
	Items        []CustomerItemResp  `json:"items"`
	Summary      CustomerSummaryResp `json:"summary"`
	CalculatedAt string              `json:"calculated_at"`
}

// CustomerItemResp — 거래처 분석 라인아이템
type CustomerItemResp struct {
	CustomerID            string   `json:"customer_id"`
	CustomerName          string   `json:"customer_name"`
	TotalSalesKRW         float64  `json:"total_sales_krw"`
	TotalCollectedKRW     float64  `json:"total_collected_krw"`
	OutstandingKRW        float64  `json:"outstanding_krw"`
	OutstandingCount      int64    `json:"outstanding_count"`
	OldestOutstandingDays int64    `json:"oldest_outstanding_days"`
	AvgMarginRate         *float64 `json:"avg_margin_rate"`
	AvgDepositRate        *float64 `json:"avg_deposit_rate"`
	Status                string   `json:"status"`
}

// CustomerSummaryResp — 거래처 합계
type CustomerSummaryResp struct {
	TotalSalesKRW       float64 `json:"total_sales_krw"`
	TotalCollectedKRW   float64 `json:"total_collected_krw"`
	TotalOutstandingKRW float64 `json:"total_outstanding_krw"`
}

// PriceTrendResponse — 단가 추이 응답
type PriceTrendResponse struct {
	Trends       []TrendProductResp `json:"trends"`
	CalculatedAt string             `json:"calculated_at"`
}

// TrendProductResp — 품번별 추이
type TrendProductResp struct {
	ManufacturerName string               `json:"manufacturer_name"`
	ProductName      string               `json:"product_name"`
	SpecWP           int                  `json:"spec_wp"`
	DataPoints       []TrendDataPointResp `json:"data_points"`
}

// TrendDataPointResp — 기간별 데이터 포인트
type TrendDataPointResp struct {
	Period                string   `json:"period"`
	AvgPurchasePriceUSDWP *float64 `json:"avg_purchase_price_usd_wp"`
	AvgPurchasePriceKRWWP *float64 `json:"avg_purchase_price_krw_wp"`
	AvgSalePriceKRWWP     *float64 `json:"avg_sale_price_krw_wp"`
	ExchangeRate          *float64 `json:"exchange_rate"`
	VolumeKW              *float64 `json:"volume_kw"`
}
