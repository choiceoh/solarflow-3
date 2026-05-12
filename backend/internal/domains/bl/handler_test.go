package bl

import (
	"math"
	"testing"
)

func floatPtr(value float64) *float64 {
	return &value
}

func assertFloatNear(t *testing.T, label string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 0.000001 {
		t.Fatalf("%s = %f, want %f", label, got, want)
	}
}

func TestComputeBLListAggregates(t *testing.T) {
	lines := []BLLineWithProduct{
		{
			BLLineItem: BLLineItem{
				BLID:             "bl-a",
				CapacityKW:       5456,
				InvoiceAmountUSD: floatPtr(632896),
			},
			Products: &ProductSummaryForBLLine{
				ProductCode: "TP-620",
				ProductName: "TopSolar 620W",
				SpecWP:      620,
			},
		},
		{
			BLLineItem: BLLineItem{
				BLID:             "bl-a",
				CapacityKW:       100,
				InvoiceAmountUSD: floatPtr(1000),
			},
		},
		{
			BLLineItem: BLLineItem{
				BLID:       "bl-b",
				CapacityKW: 250,
			},
		},
	}

	aggregates := computeBLListAggregates(lines)

	aggA := aggregates["bl-a"]
	if aggA.LineCount != 2 {
		t.Fatalf("bl-a LineCount = %d, want 2", aggA.LineCount)
	}
	assertFloatNear(t, "bl-a TotalCapacityKW", aggA.TotalCapacityKW, 5556)
	assertFloatNear(t, "bl-a TotalInvoiceUSD", aggA.TotalInvoiceUSD, 633896)
	assertFloatNear(t, "bl-a AvgCentsPerWP", aggA.AvgCentsPerWP, (633896.0/(5556.0*1000.0))*100.0)
	if aggA.FirstProductCode == nil || *aggA.FirstProductCode != "TP-620" {
		t.Fatalf("bl-a FirstProductCode = %v, want TP-620", aggA.FirstProductCode)
	}
	if aggA.FirstProductName == nil || *aggA.FirstProductName != "TopSolar 620W" {
		t.Fatalf("bl-a FirstProductName = %v, want TopSolar 620W", aggA.FirstProductName)
	}
	if aggA.FirstSpecWP == nil || *aggA.FirstSpecWP != 620 {
		t.Fatalf("bl-a FirstSpecWP = %v, want 620", aggA.FirstSpecWP)
	}

	aggB := aggregates["bl-b"]
	if aggB.LineCount != 1 {
		t.Fatalf("bl-b LineCount = %d, want 1", aggB.LineCount)
	}
	assertFloatNear(t, "bl-b TotalCapacityKW", aggB.TotalCapacityKW, 250)
	assertFloatNear(t, "bl-b AvgCentsPerWP", aggB.AvgCentsPerWP, 0)
	if aggB.FirstProductCode != nil || aggB.FirstProductName != nil || aggB.FirstSpecWP != nil {
		t.Fatalf("bl-b first product = %v/%v/%v, want nils", aggB.FirstProductCode, aggB.FirstProductName, aggB.FirstSpecWP)
	}
}

func TestAttachBLListAggregates(t *testing.T) {
	aggregates := map[string]blListAggregate{
		"bl-a": {
			LineCount:        2,
			TotalCapacityKW:  5556,
			AvgCentsPerWP:    11.409935205,
			FirstProductCode: stringPtr("TP-620"),
			FirstProductName: stringPtr("TopSolar 620W"),
			FirstSpecWP:      intPtr(620),
		},
	}
	shipments := []BLShipment{
		{BLID: "bl-a"},
		{BLID: "bl-empty"},
	}

	result := attachBLListAggregates(shipments, aggregates)

	if result[0].LineCount != 2 {
		t.Fatalf("LineCount = %d, want 2", result[0].LineCount)
	}
	assertFloatNear(t, "TotalMW", result[0].TotalMW, 5.556)
	assertFloatNear(t, "AvgCentsPerWP", result[0].AvgCentsPerWP, 11.409935205)
	if result[0].FirstProductCode == nil || *result[0].FirstProductCode != "TP-620" {
		t.Fatalf("FirstProductCode = %v, want TP-620", result[0].FirstProductCode)
	}
	if result[1].LineCount != 0 || result[1].TotalMW != 0 || result[1].FirstProductCode != nil {
		t.Fatalf("empty shipment aggregate = %+v, want zero values", result[1])
	}
}

func stringPtr(value string) *string {
	return &value
}

func intPtr(value int) *int {
	return &value
}
