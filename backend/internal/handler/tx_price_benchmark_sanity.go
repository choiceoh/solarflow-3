package handler

// D-064 PR 47 — 가격 벤치마크 정합성 검토 + 진단.
//   1) evidence content hash → 직전 run 과 동일하면 LLM 호출 skip
//   2) ±30% spike alert → warnings 에 경고
//   3) source 별 진단 (homepage/search/LLM 단계별) → diagnostics jsonb
//   4) AI 가격정합성 검토 (역사 가격과 비교, suspect point 식별) → sanity_review jsonb

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"

	"github.com/supabase-community/postgrest-go"

	"solarflow-backend/internal/model"
)

// sourceDiagnostic — source 별 진단 정보. 0건 저장 시 어디서 막혔는지 즉시 식별 용도.
type sourceDiagnostic struct {
	HomepageStatus  string `json:"homepage_status"` // "scrape_ok"|"raw_fallback_ok"|"both_failed"|"no_homepage"
	HomepageBytes   int    `json:"homepage_bytes"`
	SearchResults   int    `json:"search_results"`
	EvidenceCount   int    `json:"evidence_count"`
	EvidenceHash    string `json:"evidence_hash"`
	LLMRawLength    int    `json:"llm_raw_length"`
	LLMParseStatus  string `json:"llm_parse_status"` // "ok"|"json_not_found"|"unmarshal_err"|"skipped_unchanged"|"llm_error"
	PointsExtracted int    `json:"points_extracted"`
	SkipReason      string `json:"skip_reason,omitempty"`
}

// hashEvidence — evidence 의 안정적 해시. URL 정렬 후 content concat → SHA256.
// title 은 자주 동일하므로 url+content 만 (소스 사이트가 같은 article 을 다른 title 로 반환해도 동일 인식).
func hashEvidence(items []benchmarkEvidenceItem) string {
	if len(items) == 0 {
		return ""
	}
	parts := make([]string, len(items))
	for i, it := range items {
		parts[i] = it.URL + "\x1f" + it.Content
	}
	sort.Strings(parts)
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x1e")))
	return hex.EncodeToString(sum[:])
}

// loadLastEvidenceHash — 직전 (status in completed/partial) run 의 source 별 evidence_hashes 로드.
// 새 run 의 evidence hash 와 비교하여 무변동 source 는 LLM skip.
func (h *PriceBenchmarkHandler) loadLastEvidenceHashes(ctx context.Context) map[string]string {
	type row struct {
		EvidenceHashes map[string]string `json:"evidence_hashes"`
	}
	data, _, err := h.DB.From("price_benchmark_runs").
		Select("evidence_hashes", "exact", false).
		In("status", []string{"completed", "partial"}).
		Order("started_at", &postgrest.OrderOpts{Ascending: false}).
		Limit(1, "").
		Execute()
	if err != nil {
		log.Printf("[ai-refresh] 직전 hash 조회 실패 (스킵): %v", err)
		return map[string]string{}
	}
	var rows []row
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return map[string]string{}
	}
	if rows[0].EvidenceHashes == nil {
		return map[string]string{}
	}
	return rows[0].EvidenceHashes
}

// loadLastPointsForSource — source/metric 조합별 최근 가격 1건 로드 (spike 비교용).
// 새 point 의 value_date 미만 중 가장 최근.
func (h *PriceBenchmarkHandler) loadLastPriceForPoint(point model.CreatePriceBenchmarkRequest) (*model.PriceBenchmark, error) {
	data, _, err := h.DB.From("price_benchmarks").
		Select("price_usd_w,price_cny_w,price_krw_w,value_date", "exact", false).
		Eq("source_key", point.SourceKey).
		Eq("metric_key", point.MetricKey).
		Eq("market_region", point.MarketRegion).
		Eq("basis", point.Basis).
		Eq("currency", point.Currency).
		Lt("value_date", point.ValueDate).
		Order("value_date", &postgrest.OrderOpts{Ascending: false}).
		Limit(1, "").
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []model.PriceBenchmark
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

// detectPriceSpikes — 새 point 가 직전 동일 키 가격 대비 ±spikeThreshold 이상 변동 시 경고 메시지 반환.
// 비교 우선순위: USD → CNY → KRW (어느 한 통화라도 직전 값 있으면 그걸 사용).
const spikeThreshold = 0.30 // 30%

func (h *PriceBenchmarkHandler) detectPriceSpikes(points []model.CreatePriceBenchmarkRequest) []string {
	var warnings []string
	for _, p := range points {
		prev, err := h.loadLastPriceForPoint(p)
		if err != nil || prev == nil {
			continue
		}
		newVal, prevVal, currency, ok := pickComparablePrice(p, prev)
		if !ok || prevVal == 0 {
			continue
		}
		change := (newVal - prevVal) / prevVal
		if change > spikeThreshold || change < -spikeThreshold {
			pct := change * 100
			warnings = append(warnings, fmt.Sprintf(
				"⚠ %s/%s spike: %.4f → %.4f %s (%+.1f%%, 직전 %s)",
				p.SourceKey, p.MetricKey, prevVal, newVal, currency, pct, prev.ValueDate,
			))
		}
	}
	return warnings
}

func pickComparablePrice(p model.CreatePriceBenchmarkRequest, prev *model.PriceBenchmark) (float64, float64, string, bool) {
	if p.PriceUSDW != nil && prev.PriceUSDW != nil {
		return *p.PriceUSDW, *prev.PriceUSDW, "USD/W", true
	}
	if p.PriceCNYW != nil && prev.PriceCNYW != nil {
		return *p.PriceCNYW, *prev.PriceCNYW, "CNY/W", true
	}
	if p.PriceKRWW != nil && prev.PriceKRWW != nil {
		return *p.PriceKRWW, *prev.PriceKRWW, "KRW/W", true
	}
	return 0, 0, "", false
}

// loadHistoricalContext — AI 검토용. 각 (source, metric) 키의 최근 5건 가격을 요약.
// 중복 호출 방지 위해 처음 만나는 키 단위로 fetch.
func (h *PriceBenchmarkHandler) loadHistoricalContext(points []model.CreatePriceBenchmarkRequest) map[string][]priceHistoryPoint {
	out := map[string][]priceHistoryPoint{}
	seen := map[string]bool{}
	for _, p := range points {
		key := p.SourceKey + "/" + p.MetricKey + "/" + p.Currency
		if seen[key] {
			continue
		}
		seen[key] = true
		data, _, err := h.DB.From("price_benchmarks").
			Select("value_date,price_usd_w,price_cny_w,price_krw_w,market_region,basis", "exact", false).
			Eq("source_key", p.SourceKey).
			Eq("metric_key", p.MetricKey).
			Eq("currency", p.Currency).
			Order("value_date", &postgrest.OrderOpts{Ascending: false}).
			Limit(5, "").
			Execute()
		if err != nil {
			continue
		}
		var rows []model.PriceBenchmark
		if err := json.Unmarshal(data, &rows); err != nil {
			continue
		}
		hist := make([]priceHistoryPoint, 0, len(rows))
		for _, r := range rows {
			hist = append(hist, priceHistoryPoint{
				ValueDate: r.ValueDate,
				USD:       r.PriceUSDW,
				CNY:       r.PriceCNYW,
				KRW:       r.PriceKRWW,
				Region:    r.MarketRegion,
				Basis:     r.Basis,
			})
		}
		out[key] = hist
	}
	return out
}

type priceHistoryPoint struct {
	ValueDate string   `json:"value_date"`
	USD       *float64 `json:"price_usd_w,omitempty"`
	CNY       *float64 `json:"price_cny_w,omitempty"`
	KRW       *float64 `json:"price_krw_w,omitempty"`
	Region    string   `json:"market_region,omitempty"`
	Basis     string   `json:"basis,omitempty"`
}

// sanityReviewResult — AI 가격정합성 검토 응답.
type sanityReviewResult struct {
	Checked int `json:"checked"`
	Suspect []struct {
		SourceKey string  `json:"source_key"`
		MetricKey string  `json:"metric_key"`
		ValueDate string  `json:"value_date"`
		Reason    string  `json:"reason"`
		Severity  string  `json:"severity,omitempty"` // "low"|"med"|"high"
		PrevPrice float64 `json:"prev_price,omitempty"`
		NewPrice  float64 `json:"new_price,omitempty"`
	} `json:"suspect"`
	Summary string `json:"summary"`
}

// reviewPriceSanity — AI 가 새 points 와 역사 가격을 비교하여 의심 항목 식별.
// 호출은 source 병렬 LLM 호출이 모두 끝난 뒤, 1회 (전체 points 합본).
// 실패해도 run 자체는 계속 진행 — 결과만 sanity_review 컬럼에 NULL 로 남김.
func (h *PriceBenchmarkHandler) reviewPriceSanity(
	ctx context.Context,
	provider, llmModel string,
	maxTokens int,
	points []model.CreatePriceBenchmarkRequest,
) (*sanityReviewResult, error) {
	if len(points) == 0 {
		return nil, nil
	}
	history := h.loadHistoricalContext(points)
	system := `당신은 SolarFlow 가격 데이터 정합성 검토자입니다.
다음 입력을 받아 새로 추출된 price points 가 역사 가격과 일관성이 있는지 검토합니다:
- new_points: 이번 round 에서 AI 가 외부 시세지에서 추출한 가격들
- history: (source_key, metric_key, currency) 별 직전 5건 가격

검토 기준:
1. 단위 실수 (USD 가격이 갑자기 1/100 또는 100배) — 확실히 reject
2. 통화 혼동 (USD/W 자리에 CNY/W 가격이 들어옴 — 보통 7~8배 차이)
3. 부호 오류 (음수, 0, 비정상적으로 큰 값)
4. 30% 이상 변동인데 주변 source 와 정합성 없음
5. 같은 날짜에 같은 source/metric 에서 모순되는 값

검토 결과를 다음 JSON 으로만 반환 (Markdown/설명 금지):
{
  "checked": <검토한 point 수>,
  "suspect": [
    {
      "source_key": "...",
      "metric_key": "...",
      "value_date": "YYYY-MM-DD",
      "reason": "한 줄 한국어 설명",
      "severity": "low|med|high",
      "prev_price": <직전 비교 가격>,
      "new_price": <새 가격>
    }
  ],
  "summary": "한국어 한 줄 종합"
}
의심 없으면 suspect:[] 반환.`

	userPayload := map[string]any{
		"new_points": points,
		"history":    history,
	}
	userJSON, _ := json.Marshal(userPayload)
	user := "검토 입력:\n" + string(userJSON)

	assistant := NewAssistantHandler(h.DB)
	var raw string
	var err error
	switch provider {
	case "anthropic":
		raw, err = assistant.callAnthropicOnce(ctx, llmModel, system, user, maxTokens)
	case "openai":
		raw, err = assistant.callOpenAIOnce(ctx, llmModel, system, user, maxTokens)
	default:
		return nil, fmt.Errorf("지원하지 않는 provider: %s", provider)
	}
	if err != nil {
		return nil, err
	}
	body := strings.TrimSpace(raw)
	if strings.HasPrefix(body, "```") {
		body = strings.TrimPrefix(body, "```json")
		body = strings.TrimPrefix(body, "```")
		body = strings.TrimSuffix(body, "```")
		body = strings.TrimSpace(body)
	}
	start := strings.Index(body, "{")
	end := strings.LastIndex(body, "}")
	if start < 0 || end <= start {
		return nil, fmt.Errorf("sanity review JSON 미발견")
	}
	var result sanityReviewResult
	if err := json.Unmarshal([]byte(body[start:end+1]), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// formatSanityWarnings — sanityReview 의 suspect 를 사람이 읽는 warnings 로 변환.
func formatSanityWarnings(review *sanityReviewResult) []string {
	if review == nil || len(review.Suspect) == 0 {
		return nil
	}
	out := make([]string, 0, len(review.Suspect))
	for _, s := range review.Suspect {
		sev := s.Severity
		if sev == "" {
			sev = "med"
		}
		out = append(out, fmt.Sprintf("🔍 [%s] %s/%s @ %s — %s", sev, s.SourceKey, s.MetricKey, s.ValueDate, s.Reason))
	}
	if review.Summary != "" {
		out = append(out, "정합성 종합: "+review.Summary)
	}
	return out
}
