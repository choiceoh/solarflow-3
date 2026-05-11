package model

import (
	"strings"
	"testing"
)

func validCreatePriceBenchmarkRequest() CreatePriceBenchmarkRequest {
	price := 0.093
	return CreatePriceBenchmarkRequest{
		SourceKey:    "opis",
		SourceName:   "OPIS Solar Weekly",
		MetricKey:    "cmm_fob_china_topcon_600w",
		MetricLabel:  "CMM FOB China TOPCon",
		ValueDate:    "2026-05-07",
		MarketRegion: "fob_china",
		Basis:        "spot",
		Currency:     "USD",
		PriceUSDW:    &price,
	}
}

func TestPriceBenchmarkValidate_AllowsChinaAndEuropeRegions(t *testing.T) {
	for _, region := range PriceBenchmarkAllowedMarketRegions() {
		req := validCreatePriceBenchmarkRequest()
		req.MarketRegion = region
		req.Normalize()
		if msg := req.Validate(); msg != "" {
			t.Fatalf("허용 지역 %s 은 통과해야 합니다, got: %s", region, msg)
		}
	}
}

func TestPriceBenchmarkValidate_BlocksUSTarget(t *testing.T) {
	req := validCreatePriceBenchmarkRequest()
	req.MetricKey = "ddp_us"
	req.MetricLabel = "DDP US"
	req.MarketRegion = "ddp_us"
	req.Normalize()
	if msg := req.Validate(); !strings.Contains(msg, "ddp_us") {
		t.Fatalf("미국 DDP 지표 차단 에러 기대, got: %s", msg)
	}
}

func TestPriceBenchmarkValidate_BlocksGlobalRegion(t *testing.T) {
	req := validCreatePriceBenchmarkRequest()
	req.MarketRegion = "global"
	req.Normalize()
	if msg := req.Validate(); !strings.Contains(msg, "market_region") {
		t.Fatalf("global region 차단 에러 기대, got: %s", msg)
	}
}

func TestPriceBenchmarkReviewStatusRequestValidate(t *testing.T) {
	for _, status := range []string{"candidate", "accepted", "rejected", " Accepted "} {
		req := UpdatePriceBenchmarkReviewStatusRequest{ReviewStatus: status}
		req.Normalize()
		if msg := req.Validate(); msg != "" {
			t.Fatalf("허용 상태 %q 는 통과해야 합니다, got: %s", status, msg)
		}
	}

	req := UpdatePriceBenchmarkReviewStatusRequest{ReviewStatus: "archived"}
	req.Normalize()
	if msg := req.Validate(); !strings.Contains(msg, "review_status") {
		t.Fatalf("알 수 없는 review_status 차단 에러 기대, got: %s", msg)
	}
}
