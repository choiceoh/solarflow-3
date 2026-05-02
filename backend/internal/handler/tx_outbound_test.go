package handler

import (
	"strings"
	"testing"
)

// TestComputeOutboundCapacityKW — pure 함수 단위테스트.
// explicit capacity_kw 우선, 없으면 quantity × productWattage. 양쪽 다 무효면 에러.
func TestComputeOutboundCapacityKW(t *testing.T) {
	ptr := func(f float64) *float64 { return &f }

	cases := []struct {
		name             string
		quantity         int
		explicitKW       *float64
		productWattageKW *float64
		want             float64
		wantErrContains  string
	}{
		{"explicit 양수", 100, ptr(5.5), nil, 5.5, ""},
		{"explicit이 wattage 무시", 100, ptr(5.5), ptr(0.5), 5.5, ""},
		{"explicit 0 → 에러", 100, ptr(0), nil, 0, "capacity_kw는 양수"},
		{"explicit 음수 → 에러", 100, ptr(-1), nil, 0, "capacity_kw는 양수"},
		{"explicit nil + wattage 양수 → 곱셈", 10, nil, ptr(0.5), 5.0, ""},
		{"explicit nil + wattage nil → 에러", 10, nil, nil, 0, "wattage_kw를 확인할 수 없"},
		{"explicit nil + wattage 0 → 에러", 10, nil, ptr(0), 0, "wattage_kw를 확인할 수 없"},
		{"explicit nil + wattage 음수 → 에러", 10, nil, ptr(-0.1), 0, "wattage_kw를 확인할 수 없"},
		{"수량 0 + wattage 양수 → 0kW (양수 wattage는 통과)", 0, nil, ptr(0.5), 0, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := computeOutboundCapacityKW(c.quantity, c.explicitKW, c.productWattageKW)
			if c.wantErrContains == "" {
				if err != nil {
					t.Errorf("에러 없어야 함, 실제: %v", err)
				}
				if got != c.want {
					t.Errorf("값 기대: %v, 실제: %v", c.want, got)
				}
			} else {
				if err == nil {
					t.Errorf("에러 기대(%q), 실제: nil", c.wantErrContains)
				} else if !strings.Contains(err.Error(), c.wantErrContains) {
					t.Errorf("에러 메시지에 %q 포함 기대, 실제: %v", c.wantErrContains, err)
				}
			}
		})
	}
}
