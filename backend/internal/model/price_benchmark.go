package model

import (
	"strings"
	"time"
	"unicode/utf8"
)

const (
	PriceBenchmarkKeyMaxRunes     = 80
	PriceBenchmarkLabelMaxRunes   = 160
	PriceBenchmarkNoteMaxRunes    = 1200
	PriceBenchmarkExcerptMaxRunes = 1200
)

const (
	PriceBenchmarkReviewCandidate = "candidate"
	PriceBenchmarkReviewAccepted  = "accepted"
	PriceBenchmarkReviewRejected  = "rejected"
)

var priceBenchmarkAllowedMarketRegions = []string{
	"fob_china",
	"china_domestic",
	"china_export",
	"cif_europe",
	"ddp_europe",
}

var priceBenchmarkAllowedMarketRegionSet = map[string]bool{
	"fob_china":      true,
	"china_domestic": true,
	"china_export":   true,
	"cif_europe":     true,
	"ddp_europe":     true,
}

var priceBenchmarkBlockedMetricSet = map[string]bool{
	"ddp_us": true,
}

var priceBenchmarkAllowedReviewStatusSet = map[string]bool{
	PriceBenchmarkReviewCandidate: true,
	PriceBenchmarkReviewAccepted:  true,
	PriceBenchmarkReviewRejected:  true,
}

// PriceBenchmarkAllowedMarketRegions — 가격예측 수집 허용 지역 목록.
// 비유: 장부에 찍어도 되는 시장 이름표만 복사해 건넨다.
func PriceBenchmarkAllowedMarketRegions() []string {
	out := make([]string, len(priceBenchmarkAllowedMarketRegions))
	copy(out, priceBenchmarkAllowedMarketRegions)
	return out
}

// IsPriceBenchmarkMarketRegionAllowed — 중국/유럽 가격인지 확인한다.
// 비유: 미국처럼 눈금이 다른 가격표가 섞이지 않게 입구에서 확인한다.
func IsPriceBenchmarkMarketRegionAllowed(region string) bool {
	return priceBenchmarkAllowedMarketRegionSet[normalizeKey(region)]
}

// IsPriceBenchmarkReviewStatusAllowed — 운영자가 고를 수 있는 검토 상태인지 확인한다.
func IsPriceBenchmarkReviewStatusAllowed(status string) bool {
	return priceBenchmarkAllowedReviewStatusSet[normalizeKey(status)]
}

// PriceBenchmark — 외부 태양광 가격 벤치마크의 한 시점 관측값.
// 비유: 여러 시세지를 같은 눈금자의 점 하나로 옮겨 찍은 기록.
type PriceBenchmark struct {
	BenchmarkID    string   `json:"benchmark_id"`
	RunID          *string  `json:"run_id"`
	SourceKey      string   `json:"source_key"`
	SourceName     string   `json:"source_name"`
	MetricKey      string   `json:"metric_key"`
	MetricLabel    string   `json:"metric_label"`
	ValueDate      string   `json:"value_date"`
	PeriodLabel    *string  `json:"period_label"`
	MarketRegion   string   `json:"market_region"`
	Basis          string   `json:"basis"`
	Currency       string   `json:"currency"`
	PriceUSDW      *float64 `json:"price_usd_w"`
	PriceCNYW      *float64 `json:"price_cny_w"`
	PriceKRWW      *float64 `json:"price_krw_w"`
	CargoMinMW     *float64 `json:"cargo_min_mw"`
	CargoMaxMW     *float64 `json:"cargo_max_mw"`
	QuarterLabel   *string  `json:"quarter_label"`
	ProjectSegment *string  `json:"project_segment"`
	Technology     *string  `json:"technology"`
	Confidence     *float64 `json:"confidence"`
	ReviewStatus   string   `json:"review_status"`
	SourceURL      *string  `json:"source_url"`
	RawExcerpt     *string  `json:"raw_excerpt"`
	Notes          *string  `json:"notes"`
	CreatedBy      *string  `json:"created_by"`
	CreatedAt      string   `json:"created_at"`
	UpdatedAt      string   `json:"updated_at"`
}

// PriceBenchmarkRun — 버튼 1회 실행 단위의 수집 로그.
// PR 47: EvidenceHashes / Diagnostics / SanityReview 추가 (정합성 검토용).
type PriceBenchmarkRun struct {
	RunID          string  `json:"run_id"`
	Status         string  `json:"status"`
	Provider       *string `json:"provider"`
	Model          *string `json:"model"`
	SourceKeys     any     `json:"source_keys"`
	RequestedBy    *string `json:"requested_by"`
	StartedAt      string  `json:"started_at"`
	FinishedAt     *string `json:"finished_at"`
	InsertedCount  int     `json:"inserted_count"`
	SkippedCount   int     `json:"skipped_count"`
	ErrorMessage   *string `json:"error_message"`
	Warnings       any     `json:"warnings"`
	Evidence       any     `json:"evidence"`
	RawResponse    *string `json:"raw_response"`
	EvidenceHashes any     `json:"evidence_hashes,omitempty"` // PR 47
	Diagnostics    any     `json:"diagnostics,omitempty"`     // PR 47
	SanityReview   any     `json:"sanity_review,omitempty"`   // PR 47
}

// CreatePriceBenchmarkRequest — 수동 또는 AI 수집 후 저장할 벤치마크 입력.
type CreatePriceBenchmarkRequest struct {
	RunID          *string  `json:"run_id,omitempty"`
	SourceKey      string   `json:"source_key"`
	SourceName     string   `json:"source_name"`
	MetricKey      string   `json:"metric_key"`
	MetricLabel    string   `json:"metric_label"`
	ValueDate      string   `json:"value_date"`
	PeriodLabel    *string  `json:"period_label,omitempty"`
	MarketRegion   string   `json:"market_region"`
	Basis          string   `json:"basis"`
	Currency       string   `json:"currency"`
	PriceUSDW      *float64 `json:"price_usd_w,omitempty"`
	PriceCNYW      *float64 `json:"price_cny_w,omitempty"`
	PriceKRWW      *float64 `json:"price_krw_w,omitempty"`
	CargoMinMW     *float64 `json:"cargo_min_mw,omitempty"`
	CargoMaxMW     *float64 `json:"cargo_max_mw,omitempty"`
	QuarterLabel   *string  `json:"quarter_label,omitempty"`
	ProjectSegment *string  `json:"project_segment,omitempty"`
	Technology     *string  `json:"technology,omitempty"`
	Confidence     *float64 `json:"confidence,omitempty"`
	SourceURL      *string  `json:"source_url,omitempty"`
	RawExcerpt     *string  `json:"raw_excerpt,omitempty"`
	Notes          *string  `json:"notes,omitempty"`
	CreatedBy      *string  `json:"created_by,omitempty"`
}

func (req *CreatePriceBenchmarkRequest) Normalize() {
	req.SourceKey = normalizeKey(req.SourceKey)
	req.SourceName = strings.TrimSpace(req.SourceName)
	req.MetricKey = normalizeKey(req.MetricKey)
	req.MetricLabel = strings.TrimSpace(req.MetricLabel)
	req.ValueDate = strings.TrimSpace(req.ValueDate)
	req.MarketRegion = normalizeKey(req.MarketRegion)
	req.Basis = normalizeKey(req.Basis)
	req.Currency = strings.ToUpper(strings.TrimSpace(req.Currency))
	trimStringPtr(&req.PeriodLabel)
	trimStringPtr(&req.QuarterLabel)
	trimStringPtr(&req.ProjectSegment)
	trimStringPtr(&req.Technology)
	trimStringPtr(&req.SourceURL)
	trimStringPtr(&req.RawExcerpt)
	trimStringPtr(&req.Notes)
	if req.Currency == "" {
		req.Currency = "USD"
	}
}

func (req *CreatePriceBenchmarkRequest) Validate() string {
	if req.SourceKey == "" {
		return "source_key는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.SourceKey) > PriceBenchmarkKeyMaxRunes {
		return "source_key는 80자를 초과할 수 없습니다"
	}
	if req.SourceName == "" {
		return "source_name은 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.SourceName) > PriceBenchmarkLabelMaxRunes {
		return "source_name은 160자를 초과할 수 없습니다"
	}
	if req.MetricKey == "" {
		return "metric_key는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.MetricKey) > PriceBenchmarkKeyMaxRunes {
		return "metric_key는 80자를 초과할 수 없습니다"
	}
	if priceBenchmarkBlockedMetricSet[req.MetricKey] {
		return "metric_key ddp_us는 가격예측 수집 대상에서 제외됩니다"
	}
	if req.MetricLabel == "" {
		return "metric_label은 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.MetricLabel) > PriceBenchmarkLabelMaxRunes {
		return "metric_label은 160자를 초과할 수 없습니다"
	}
	if _, err := time.Parse("2006-01-02", req.ValueDate); err != nil {
		return "value_date는 YYYY-MM-DD 형식이어야 합니다"
	}
	if req.MarketRegion == "" {
		return "market_region은 필수 항목입니다"
	}
	if !IsPriceBenchmarkMarketRegionAllowed(req.MarketRegion) {
		return "market_region은 중국/유럽 가격(fob_china, china_domestic, china_export, cif_europe, ddp_europe)만 허용됩니다"
	}
	if req.Basis == "" {
		return "basis는 필수 항목입니다"
	}
	if req.Currency == "" {
		return "currency는 필수 항목입니다"
	}
	if req.PriceUSDW == nil && req.PriceCNYW == nil && req.PriceKRWW == nil {
		return "가격은 price_usd_w, price_cny_w, price_krw_w 중 하나 이상 필요합니다"
	}
	for label, value := range map[string]*float64{
		"price_usd_w":  req.PriceUSDW,
		"price_cny_w":  req.PriceCNYW,
		"price_krw_w":  req.PriceKRWW,
		"cargo_min_mw": req.CargoMinMW,
		"cargo_max_mw": req.CargoMaxMW,
	} {
		if value != nil && *value <= 0 {
			return label + "는 양수여야 합니다"
		}
	}
	if req.CargoMinMW != nil && req.CargoMaxMW != nil && *req.CargoMinMW > *req.CargoMaxMW {
		return "cargo_min_mw는 cargo_max_mw보다 클 수 없습니다"
	}
	if req.Confidence != nil && (*req.Confidence < 0 || *req.Confidence > 1) {
		return "confidence는 0 이상 1 이하이어야 합니다"
	}
	if req.Notes != nil && utf8.RuneCountInString(*req.Notes) > PriceBenchmarkNoteMaxRunes {
		return "notes는 1200자를 초과할 수 없습니다"
	}
	if req.RawExcerpt != nil && utf8.RuneCountInString(*req.RawExcerpt) > PriceBenchmarkExcerptMaxRunes {
		return "raw_excerpt는 1200자를 초과할 수 없습니다"
	}
	return ""
}

// PriceBenchmarkAIRefreshRequest — 가격예측 화면의 "AI 지표 갱신" 요청.
type PriceBenchmarkAIRefreshRequest struct {
	SourceKeys []string `json:"source_keys,omitempty"`
}

// UpdatePriceBenchmarkReviewStatusRequest — 관측값을 구매 판단 기준선으로 채택/제외한다.
type UpdatePriceBenchmarkReviewStatusRequest struct {
	ReviewStatus string `json:"review_status"`
}

func (req *UpdatePriceBenchmarkReviewStatusRequest) Normalize() {
	req.ReviewStatus = normalizeKey(req.ReviewStatus)
}

func (req *UpdatePriceBenchmarkReviewStatusRequest) Validate() string {
	if req.ReviewStatus == "" {
		return "review_status는 필수 항목입니다"
	}
	if !IsPriceBenchmarkReviewStatusAllowed(req.ReviewStatus) {
		return "review_status는 candidate, accepted, rejected 중 하나여야 합니다"
	}
	return ""
}

func normalizeKey(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	v = strings.ReplaceAll(v, " ", "_")
	v = strings.ReplaceAll(v, "-", "_")
	return v
}

func trimStringPtr(target **string) {
	if target == nil || *target == nil {
		return
	}
	v := strings.TrimSpace(**target)
	if v == "" {
		*target = nil
		return
	}
	*target = &v
}
