package handler

import (
	"errors"
	"strings"
	"testing"

	"solarflow-backend/internal/model"
)

func TestBuildBenchmarkExistingContextMissingFocus(t *testing.T) {
	rows := []model.PriceBenchmark{
		{
			SourceKey:    "opis",
			SourceName:   "OPIS Solar Weekly",
			MetricKey:    "cmm_fob_china_topcon_600w",
			MetricLabel:  "CMM FOB China TOPCon >=600W",
			ValueDate:    "2026-05-01",
			MarketRegion: "fob_china",
			Basis:        "spot",
			Currency:     "USD",
		},
	}
	ctx := buildBenchmarkExistingContext([]benchmarkSource{
		{Key: "opis", Name: "OPIS Solar Weekly"},
		{Key: "infolink", Name: "InfoLink Consulting"},
	}, rows)

	if !ctx.hasObservation("opis", "cmm_fob_china_topcon_600w", "2026-05-01", "fob_china", "spot", "USD") {
		t.Fatalf("기존 관측키가 context에 들어가지 않았습니다")
	}

	for _, item := range ctx.MissingFocus {
		if item.SourceKey == "opis" && item.MetricKey == "cmm_fob_china_topcon_600w" {
			t.Fatalf("이미 있는 OPIS CMM 지표가 missing_focus에 들어갔습니다")
		}
	}

	if hasMissingFocus(ctx.MissingFocus, "opis", "ddp_us") {
		t.Fatalf("중국/유럽 제외 대상인 OPIS DDP US 지표가 missing_focus에 들어갔습니다")
	}
	if !hasMissingFocus(ctx.MissingFocus, "opis", "ddp_europe") {
		t.Fatalf("없는 OPIS DDP Europe 지표가 missing_focus에 없습니다")
	}
	if !hasMissingFocus(ctx.MissingFocus, "infolink", "module_centralized") {
		t.Fatalf("없는 InfoLink module_centralized 지표가 missing_focus에 없습니다")
	}
}

func TestBuildBenchmarkExtractionMessagesDedupPolicy(t *testing.T) {
	ctx := buildBenchmarkExistingContext([]benchmarkSource{{Key: "opis", Name: "OPIS Solar Weekly"}}, []model.PriceBenchmark{
		{
			SourceKey:    "opis",
			SourceName:   "OPIS Solar Weekly",
			MetricKey:    "cmm_fob_china_topcon_600w",
			MetricLabel:  "CMM FOB China TOPCon >=600W",
			ValueDate:    "2026-05-01",
			MarketRegion: "fob_china",
			Basis:        "spot",
			Currency:     "USD",
		},
	})
	system, user := buildBenchmarkExtractionMessages([]benchmarkEvidenceItem{
		{SourceKey: "opis", SourceName: "OPIS Solar Weekly", Title: "sample", URL: "https://example.test", Content: "CMM price sample"},
	}, ctx)

	for _, want := range []string{
		"이미 DB에 있는 관측값은 다시 수집하지 않습니다",
		"source_key|metric_key|value_date|market_region|basis|currency",
		"missing_focus",
	} {
		if !strings.Contains(system, want) {
			t.Fatalf("system prompt에 %q 누락\n%s", want, system)
		}
	}
	if !strings.Contains(user, "opis|cmm_fob_china_topcon_600w|2026-05-01|fob_china|spot|USD") {
		t.Fatalf("user prompt에 기존 관측키가 누락됐습니다\n%s", user)
	}
	if strings.Contains(user, "\"metric_key\": \"ddp_us\"") {
		t.Fatalf("user prompt에 제외 대상 미국 DDP 지표가 들어갔습니다\n%s", user)
	}
	if !strings.Contains(user, "\"metric_key\": \"ddp_europe\"") {
		t.Fatalf("user prompt에 결측 지표가 누락됐습니다\n%s", user)
	}
}

func TestBenchmarkSourceHomepageURLs(t *testing.T) {
	src := benchmarkSource{
		Homepage:          "https://www.opisnet.com/product/solar-weekly/",
		HomepageFallbacks: []string{"", "https://www.opisnet.com/", "  "},
	}
	urls := src.homepageURLs()
	if len(urls) != 2 {
		t.Fatalf("빈 fallback 은 제거돼야 합니다, got=%v", urls)
	}
	if urls[0] != "https://www.opisnet.com/product/solar-weekly/" {
		t.Fatalf("primary URL 이 첫 자리에 와야 합니다, got=%s", urls[0])
	}
	if urls[1] != "https://www.opisnet.com/" {
		t.Fatalf("fallback URL 순서가 맞지 않습니다, got=%s", urls[1])
	}

	empty := benchmarkSource{Homepage: "  "}
	if got := empty.homepageURLs(); got != nil {
		t.Fatalf("Homepage 비면 nil 이어야 합니다, got=%v", got)
	}
}

func TestSummarizeHomepageFailureSameStatus(t *testing.T) {
	attempts := []homepageAttempt{
		{url: "https://a.test/", method: "scrape", err: errors.New("HTTP 404: not found")},
		{url: "https://a.test/", method: "raw", err: errors.New("HTTP 404")},
		{url: "https://a.test/fallback", method: "scrape", err: errors.New("HTTP 404")},
		{url: "https://a.test/fallback", method: "raw", err: errors.New("HTTP 404")},
	}
	out := summarizeHomepageFailure("OPIS Solar Weekly", attempts, true)
	for _, want := range []string{"OPIS Solar Weekly", "URL 2개", "HTTP 404×4", "웹 검색으로 대체"} {
		if !strings.Contains(out, want) {
			t.Fatalf("warning 에 %q 누락: %q", want, out)
		}
	}
	if strings.Count(out, "HTTP 404") != 1 {
		t.Fatalf("동일 status 는 한 번만 등장해야 합니다: %q", out)
	}
}

func TestSummarizeHomepageFailureMixedStatus(t *testing.T) {
	attempts := []homepageAttempt{
		{url: "https://a.test/", method: "scrape", err: errors.New("HTTP 404")},
		{url: "https://a.test/", method: "raw", err: errors.New("dial tcp: i/o timeout")},
	}
	out := summarizeHomepageFailure("InfoLink Consulting", attempts, false)
	if !strings.Contains(out, "HTTP 404") || !strings.Contains(out, "dial tcp") {
		t.Fatalf("서로 다른 error 가 모두 노출돼야 합니다: %q", out)
	}
	if strings.Contains(out, "웹 검색으로 대체") {
		t.Fatalf("searchFallback=false 면 안내 문구가 없어야 합니다: %q", out)
	}
}

func TestBuildBenchmarkSearchPlansExpandsMissingAndVariants(t *testing.T) {
	src := benchmarkSource{
		Key:           "opis",
		Name:          "OPIS Solar Weekly",
		Query:         "base query",
		QueryVariants: []string{"variant query", "base query"},
		Endpoint:      "search",
		TimeWindow:    "week",
	}
	ctx := benchmarkExistingContext{
		latestBySource: map[string]string{"opis": "2026-05-01"},
		missingBySource: map[string][]benchmarkMissingFocus{
			"opis": {
				{SearchHint: "DDP Europe module price"},
				{SearchHint: "Forward Q+1 module price"},
			},
		},
	}

	plans := buildBenchmarkSearchPlans(src, ctx)
	if len(plans) < 4 {
		t.Fatalf("기본+결측+대체 검색 플랜이 필요합니다, got=%d %#v", len(plans), plans)
	}
	if !containsPlanQuery(plans, "missing metrics focus") {
		t.Fatalf("결측 지표를 붙인 기본 검색어가 없습니다: %#v", plans)
	}
	if !containsPlanQuery(plans, "DDP Europe module price") {
		t.Fatalf("결측 지표별 검색어가 없습니다: %#v", plans)
	}
	if !containsPlanQuery(plans, "variant query latest updated after 2026-05-01") {
		t.Fatalf("대체 검색어가 최신 기준과 함께 들어가야 합니다: %#v", plans)
	}
	if !containsPlanWindow(plans, "month") {
		t.Fatalf("주간 검색 실패에 대비한 월간 fallback 이 필요합니다: %#v", plans)
	}
	if len(plans) > benchmarkMaxSearchQueriesPerSource {
		t.Fatalf("검색 플랜 상한 초과: got=%d max=%d", len(plans), benchmarkMaxSearchQueriesPerSource)
	}
}

func TestSearchResultDedupeKey(t *testing.T) {
	withURL := webSearchResultItem{URL: "https://example.test/a", Title: "A", Content: "first"}
	if got := searchResultDedupeKey(withURL); got != "https://example.test/a" {
		t.Fatalf("URL 이 있으면 URL 기준 dedupe 여야 합니다, got=%q", got)
	}
	noURL := webSearchResultItem{Title: "Same", Content: "Snippet"}
	if got := searchResultDedupeKey(noURL); got != "same|snippet" {
		t.Fatalf("URL 이 없으면 title/content 기준 dedupe 여야 합니다, got=%q", got)
	}
}

func TestValidateBenchmarkCatalogPolicy(t *testing.T) {
	base := model.CreatePriceBenchmarkRequest{
		SourceKey:    "opis",
		MetricKey:    "cmm_fob_china_topcon_600w",
		MarketRegion: "fob_china",
		Basis:        "spot",
		Currency:     "USD",
	}
	if msg := validateBenchmarkCatalogPolicy(base); msg != "" {
		t.Fatalf("valid benchmark rejected: %s", msg)
	}

	unknownMetric := base
	unknownMetric.MetricKey = "made_up_metric"
	if msg := validateBenchmarkCatalogPolicy(unknownMetric); msg == "" {
		t.Fatal("unknown metric should be rejected")
	}

	tier1ASP := base
	tier1ASP.SourceKey = "tier1_asp"
	tier1ASP.MetricKey = "manufacturer_asp"
	tier1ASP.MarketRegion = "manufacturer"
	tier1ASP.Basis = "asp"
	if msg := validateBenchmarkCatalogPolicy(tier1ASP); msg == "" {
		t.Fatal("Tier-1 ASP should be rejected")
	}

	infolinkCell := base
	infolinkCell.SourceKey = "infolink"
	infolinkCell.MetricKey = "cell"
	if msg := validateBenchmarkCatalogPolicy(infolinkCell); msg == "" {
		t.Fatal("InfoLink cell metric should be rejected")
	}

	usDDP := base
	usDDP.MetricKey = "ddp_us"
	usDDP.MarketRegion = "ddp_us"
	usDDP.Basis = "ddp"
	if msg := validateBenchmarkCatalogPolicy(usDDP); msg == "" {
		t.Fatal("US DDP should be rejected")
	}

	quote := base
	quote.SourceKey = "our_quote"
	quote.MetricKey = "supplier_quote"
	quote.Basis = "quote"
	if msg := validateBenchmarkCatalogPolicy(quote); msg != "" {
		t.Fatalf("our quote should be accepted: %s", msg)
	}

	badQuoteMetric := quote
	badQuoteMetric.MetricKey = "cmm_fob_china_topcon_600w"
	if msg := validateBenchmarkCatalogPolicy(badQuoteMetric); msg == "" {
		t.Fatal("our quote with external metric should be rejected")
	}
}

func hasMissingFocus(items []benchmarkMissingFocus, sourceKey, metricKey string) bool {
	for _, item := range items {
		if item.SourceKey == sourceKey && item.MetricKey == metricKey {
			return true
		}
	}
	return false
}

func containsPlanQuery(plans []benchmarkSource, want string) bool {
	for _, plan := range plans {
		if strings.Contains(plan.Query, want) {
			return true
		}
	}
	return false
}

func containsPlanWindow(plans []benchmarkSource, want string) bool {
	for _, plan := range plans {
		if plan.TimeWindow == want {
			return true
		}
	}
	return false
}
