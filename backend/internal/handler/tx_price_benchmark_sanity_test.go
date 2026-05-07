package handler

import (
	"testing"

	"solarflow-backend/internal/model"
)

func TestHashEvidence(t *testing.T) {
	a := []benchmarkEvidenceItem{{URL: "https://x", Content: "AAA"}, {URL: "https://y", Content: "BBB"}}
	b := []benchmarkEvidenceItem{{URL: "https://y", Content: "BBB"}, {URL: "https://x", Content: "AAA"}}
	c := []benchmarkEvidenceItem{{URL: "https://x", Content: "AAA"}, {URL: "https://y", Content: "CCC"}}

	if hashEvidence(a) != hashEvidence(b) {
		t.Errorf("순서가 달라도 같은 hash 여야 함")
	}
	if hashEvidence(a) == hashEvidence(c) {
		t.Errorf("내용이 다르면 hash 가 달라야 함")
	}
	if hashEvidence(nil) != "" {
		t.Errorf("빈 evidence 는 빈 hash")
	}
}

func TestPickComparablePrice(t *testing.T) {
	usdNew := 0.10
	usdPrev := 0.07
	cnyNew := 0.85
	p := model.CreatePriceBenchmarkRequest{PriceUSDW: &usdNew, PriceCNYW: &cnyNew}
	prev := &model.PriceBenchmark{PriceUSDW: &usdPrev}
	newVal, prevVal, ccy, ok := pickComparablePrice(p, prev)
	if !ok || newVal != 0.10 || prevVal != 0.07 || ccy != "USD/W" {
		t.Errorf("USD 우선 비교 실패: ok=%v new=%v prev=%v ccy=%s", ok, newVal, prevVal, ccy)
	}

	// USD 가 없고 CNY 만 있을 때
	p2 := model.CreatePriceBenchmarkRequest{PriceCNYW: &cnyNew}
	cnyPrev := 0.60
	prev2 := &model.PriceBenchmark{PriceCNYW: &cnyPrev}
	_, _, ccy2, ok2 := pickComparablePrice(p2, prev2)
	if !ok2 || ccy2 != "CNY/W" {
		t.Errorf("CNY fallback 실패: ok=%v ccy=%s", ok2, ccy2)
	}

	// 비교 불가
	prev3 := &model.PriceBenchmark{}
	_, _, _, ok3 := pickComparablePrice(p, prev3)
	if ok3 {
		t.Errorf("비교 가능 가격 없음 → ok=false 여야 함")
	}
}

func TestFormatSanityWarnings_Empty(t *testing.T) {
	if got := formatSanityWarnings(nil); got != nil {
		t.Errorf("nil → nil 기대, got=%v", got)
	}
	r := &sanityReviewResult{}
	if got := formatSanityWarnings(r); got != nil {
		t.Errorf("빈 suspect → nil 기대")
	}
}
