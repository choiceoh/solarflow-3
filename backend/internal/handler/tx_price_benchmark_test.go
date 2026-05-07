package handler

import (
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

	if !hasMissingFocus(ctx.MissingFocus, "opis", "ddp_us") {
		t.Fatalf("없는 OPIS DDP US 지표가 missing_focus에 없습니다")
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
	if !strings.Contains(user, "\"metric_key\": \"ddp_us\"") {
		t.Fatalf("user prompt에 결측 지표가 누락됐습니다\n%s", user)
	}
}

func TestValidateBenchmarkCatalogPolicy(t *testing.T) {
	base := model.CreatePriceBenchmarkRequest{
		SourceKey:    "opis",
		MetricKey:    "cmm_fob_china_topcon_600w",
		MarketRegion: "fob_china",
		Basis:        "fob",
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
}

func hasMissingFocus(items []benchmarkMissingFocus, sourceKey, metricKey string) bool {
	for _, item := range items {
		if item.SourceKey == sourceKey && item.MetricKey == metricKey {
			return true
		}
	}
	return false
}
