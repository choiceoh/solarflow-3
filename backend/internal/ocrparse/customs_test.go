package ocrparse

import (
	"testing"

	"solarflow-backend/internal/model"
)

func TestParseCustomsDeclaration(t *testing.T) {
	lines := []model.OCRLine{
		{Text: "수입신고번호 81500-26-0150024", Score: 0.98},
		{Text: "신고일자 2026.04.16", Score: 0.97},
		{Text: "입항일 2026/04/15 광양항", Score: 0.94},
		{Text: "적용환율 USD 1,422.60", Score: 0.95},
		{Text: "CIF 과세가격(원화) 648,731,250", Score: 0.93},
		{Text: "HS CODE 8541.43-0000 광양세관", Score: 0.92},
		{Text: "LONGI SOLAR TECHNOLOGY CO LTD (CN)", Score: 0.91},
		{Text: "(NO. 01)", Score: 0.95},
		{Text: "MONO SOLAR MODULE LR8-66HYD-655M", Score: 0.99},
		{Text: "9,811PCS(6,426,205WP)", Score: 0.98},
		{Text: "0.117", Score: 0.99},
		{Text: "751,865.99", Score: 0.99},
	}

	got := ParseCustomsDeclaration("sample.pdf", lines)
	if got == nil {
		t.Fatal("ParseCustomsDeclaration() = nil")
	}
	assertCandidate(t, got.DeclarationNumber, "81500-26-0150024")
	assertCandidate(t, got.DeclarationDate, "2026-04-16")
	assertCandidate(t, got.ArrivalDate, "2026-04-15")
	assertCandidate(t, got.ExchangeRate, "1422.60")
	assertCandidate(t, got.CIFAmountKRW, "648731250")
	assertCandidate(t, got.HSCode, "8541430000")
	assertCandidate(t, got.CustomsOffice, "광양세관")
	assertCandidate(t, got.Port, "광양항")
	assertCandidate(t, got.TradePartner, "LONGI SOLAR TECHNOLOGY CO LTD")
	if len(got.LineItems) != 1 {
		t.Fatalf("len(LineItems) = %d, want 1", len(got.LineItems))
	}
	assertCandidate(t, got.LineItems[0].Quantity, "9811")
	assertCandidate(t, got.LineItems[0].UnitPriceUSD, "0.117")
	assertCandidate(t, got.LineItems[0].AmountUSD, "751865.99")
}

func TestParseCustomsDeclarationUsesFilenameFallback(t *testing.T) {
	got := ParseCustomsDeclaration("DFS815002444 탑솔라 수입필증 2026.04.16.pdf", nil)
	if got == nil {
		t.Fatal("ParseCustomsDeclaration() = nil")
	}
	assertCandidate(t, got.DeclarationNumber, "DFS815002444")
	assertCandidate(t, got.DeclarationDate, "2026-04-16")
}

func TestParseCustomsDeclarationHandlesScannedNumericLayout(t *testing.T) {
	lines := []model.OCRLine{
		{Text: "43052-26-041010M", Score: 0.99, Box: model.OCRBox{X0: 203, Y0: 273, X1: 391, Y1: 300}},
		{Text: "2026/04/15", Score: 0.99, Box: model.OCRBox{X0: 515, Y0: 273, X1: 626, Y1: 301}},
		{Text: "2026/04/16", Score: 0.99, Box: model.OCRBox{X0: 1005, Y0: 273, X1: 1119, Y1: 301}},
		{Text: "B/L(AWB)京", Score: 0.92, Box: model.OCRBox{X0: 176, Y0: 308, X1: 341, Y1: 342}},
		{Text: "DFS815002444", Score: 0.99, Box: model.OCRBox{X0: 284, Y0: 339, X1: 430, Y1: 366}},
		{Text: "KRKAN", Score: 0.99, Box: model.OCRBox{X0: 1215, Y0: 514, X1: 1292, Y1: 539}},
		{Text: "8541.43-0000金否", Score: 0.94, Box: model.OCRBox{X0: 387, Y0: 1053, X1: 621, Y1: 1086}},
		{Text: "CIF-USD-797,549-LU", Score: 0.99, Box: model.OCRBox{X0: 822, Y0: 1521, X1: 1025, Y1: 1548}},
		{Text: "1,495.7600", Score: 0.99, Box: model.OCRBox{X0: 1346, Y0: 1524, X1: 1450, Y1: 1548}},
		{Text: "1,192,941,353", Score: 0.98, Box: model.OCRBox{X0: 1364, Y0: 1593, X1: 1494, Y1: 1617}},
		{Text: "(NO. 02)", Score: 0.97, Box: model.OCRBox{X0: 159, Y0: 2921, X1: 229, Y1: 2946}},
		{Text: "MONO SOLAR MODULE LR8-66HYD-655M", Score: 0.99, Box: model.OCRBox{X0: 160, Y0: 2944, X1: 488, Y1: 2964}},
		{Text: "9,811PCS(6,426,205WP)", Score: 0.98, Box: model.OCRBox{X0: 160, Y0: 2964, X1: 328, Y1: 2984}},
		{Text: "0.117", Score: 0.99, Box: model.OCRBox{X0: 1225, Y0: 2939, X1: 1284, Y1: 2965}},
		{Text: "751,865.99", Score: 0.99, Box: model.OCRBox{X0: 1389, Y0: 2940, X1: 1495, Y1: 2965}},
	}

	got := ParseCustomsDeclaration("DFS815002444 탑솔라 수입필증 2026.04.16.pdf", lines)
	if got == nil {
		t.Fatal("ParseCustomsDeclaration() = nil")
	}
	assertCandidate(t, got.DeclarationNumber, "43052-26-041010M")
	assertCandidate(t, got.BLNumber, "DFS815002444")
	assertCandidate(t, got.ArrivalDate, "2026-04-15")
	assertCandidate(t, got.DeclarationDate, "2026-04-16")
	assertCandidate(t, got.ExchangeRate, "1495.7600")
	assertCandidate(t, got.CIFAmountKRW, "1192941353")
	assertCandidate(t, got.HSCode, "8541430000")
	assertCandidate(t, got.Port, "광양항")
	if len(got.LineItems) != 1 {
		t.Fatalf("len(LineItems) = %d, want 1", len(got.LineItems))
	}
	assertCandidate(t, got.LineItems[0].Quantity, "9811")
	assertCandidate(t, got.LineItems[0].UnitPriceUSD, "0.117")
	assertCandidate(t, got.LineItems[0].AmountUSD, "751865.99")
}

func assertCandidate(t *testing.T, got *model.OCRFieldCandidate, want string) {
	t.Helper()
	if got == nil {
		t.Fatalf("candidate = nil, want %q", want)
	}
	if got.Value != want {
		t.Fatalf("candidate.Value = %q, want %q", got.Value, want)
	}
}
