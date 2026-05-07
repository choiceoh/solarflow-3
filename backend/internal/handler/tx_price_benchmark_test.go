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

func hasMissingFocus(items []benchmarkMissingFocus, sourceKey, metricKey string) bool {
	for _, item := range items {
		if item.SourceKey == sourceKey && item.MetricKey == metricKey {
			return true
		}
	}
	return false
}
