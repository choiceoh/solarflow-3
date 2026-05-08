package tenant

import (
	"reflect"
	"sort"
	"testing"
)

// TestDefault_Topsolar — fallback 은 topsolar (D-108 호환).
func TestDefault_Topsolar(t *testing.T) {
	if got := Default(); got != IDTopsolar {
		t.Fatalf("기대 default=topsolar, 실제=%q", got)
	}
}

// TestDetect_HostPatterns — 기존 frontend tenantScope.ts 와 동일한 분기 결과.
func TestDetect_HostPatterns(t *testing.T) {
	cases := map[string]ID{
		"module.topworks.ltd":    IDTopsolar,
		"module-staging.example": IDTopsolar,
		"solarflow3.com":         IDTopsolar,
		"localhost":              IDTopsolar,
		"127.0.0.1":              IDTopsolar,
		"cable.topworks.ltd":     IDCable,
		"cable-dev.example":      IDCable,
		"baro.topworks.ltd":      IDBaro,
		"baro-stage.example":     IDBaro,
		"study.topworks.ltd":     IDStudy,
		"study-stage.example":    IDStudy,
		"unknown.example.com":    IDTopsolar, // 매치 없으면 default
	}
	for host, want := range cases {
		if got := Detect(host); got != want {
			t.Errorf("Detect(%q) = %q, 기대 %q", host, got, want)
		}
	}
}

// TestDetect_CaseInsensitive — 대소문자 무관 매치.
func TestDetect_CaseInsensitive(t *testing.T) {
	if got := Detect("BARO.TopWorks.LTD"); got != IDBaro {
		t.Fatalf("대문자 host 도 baro 매치되어야 함, 실제=%q", got)
	}
}

// TestIDsInGroup_All — ERP 운영 테넌트만 GroupAll 에 속한다.
func TestIDsInGroup_All(t *testing.T) {
	got := IDsInGroup(GroupAll)
	want := []ID{IDBaro, IDCable, IDTopsolar} // 알파벳 정렬
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("기대 %v, 실제 %v", want, got)
	}
}

// TestIDsInGroup_Module — D-119: module 그룹 = topsolar + cable.
func TestIDsInGroup_Module(t *testing.T) {
	got := IDsInGroup(GroupModule)
	want := []ID{IDCable, IDTopsolar}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("기대 %v, 실제 %v", want, got)
	}
}

// TestIDsInGroupAsStrings — string 변환이 정렬을 유지한다.
func TestIDsInGroupAsStrings(t *testing.T) {
	got := IDsInGroupAsStrings(GroupAll)
	want := []string{"baro", "cable", "topsolar"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("기대 %v, 실제 %v", want, got)
	}
}

// TestAllIDs_StableOrder — 정의 순서대로 반환되어 정렬에 의존하지 않음.
func TestAllIDs_StableOrder(t *testing.T) {
	got := AllIDs()
	want := []ID{IDTopsolar, IDCable, IDBaro, IDStudy}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("기대 %v, 실제 %v", want, got)
	}
}

// TestKnown — 등록된 ID 만 Known=true.
func TestKnown(t *testing.T) {
	if !Known("topsolar") {
		t.Errorf("topsolar 는 Known 이어야 함")
	}
	if Known("gx10") {
		t.Errorf("미등록 gx10 은 Known 이면 안 됨")
	}
	if !Known("study") {
		t.Errorf("study 는 Known 이어야 함")
	}
}

// TestIDsInGroup_Study — study 는 ERP 공통 GroupAll 을 상속하지 않는 별도 학습 테넌트.
func TestIDsInGroup_Study(t *testing.T) {
	got := IDsInGroup(GroupStudy)
	want := []ID{IDStudy}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("기대 %v, 실제 %v", want, got)
	}
}

// TestNewRegistry_PoC — PoC 시나리오: 4번째 테넌트 추가가 NewRegistry 한 번에 끝나는지.
func TestNewRegistry_PoC(t *testing.T) {
	r := NewRegistry([]Tenant{
		{
			ID: IDTopsolar, DisplayName: "Top",
			HostPatterns: []string{`^localhost$`},
			Groups:       []Group{GroupAll, GroupModule},
			IsDefault:    true,
		},
		{
			ID: "gx10", DisplayName: "GX10 PoC",
			HostPatterns: []string{`^gx10\.`},
			Groups:       []Group{GroupAll},
		},
	})
	if got := r.Detect("gx10.example"); got != "gx10" {
		t.Errorf("PoC 테넌트 detect 실패: %q", got)
	}
	if got := r.Detect("anything"); got != IDTopsolar {
		t.Errorf("default fallback 실패: %q", got)
	}
	all := r.IDsInGroup(GroupAll)
	sort.Slice(all, func(i, j int) bool { return all[i] < all[j] })
	want := []ID{"gx10", IDTopsolar}
	if !reflect.DeepEqual(all, want) {
		t.Errorf("그룹 멤버 기대 %v, 실제 %v", want, all)
	}
}

// TestNewRegistry_NoDefaultPanics — IsDefault 가 없으면 컴파일 단계에서 panic.
func TestNewRegistry_NoDefaultPanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatalf("default 없이는 panic 해야 함")
		}
	}()
	NewRegistry([]Tenant{
		{ID: "x", DisplayName: "X", Groups: []Group{GroupAll}},
	})
}

// TestNewRegistry_DuplicateDefaultPanics — IsDefault 가 2개 이상이면 panic.
func TestNewRegistry_DuplicateDefaultPanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatalf("default 중복은 panic 해야 함")
		}
	}()
	NewRegistry([]Tenant{
		{ID: "a", DisplayName: "A", IsDefault: true},
		{ID: "b", DisplayName: "B", IsDefault: true},
	})
}
