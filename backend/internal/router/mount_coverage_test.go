package router_test

import (
	"sort"
	"strings"
	"testing"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/mount"
)

// D-20260512-090000 후속: mount.Spec ↔ feature.Catalog 메타데이터 정합 가드.
//
// 기존 TestFeatureCoverage / TestCatalogPathsAreReal 가 *라우트 path* 의 양방향 정합을
// 보장하지만, mount.Spec.ID 자체 (Spec 의 self-introduction) 가 catalog 에 실제 존재하는지는
// 검증하지 않는다. 본 테스트는 Spec.ID 메타데이터 정합을 추가로 강제한다.
//
// (역방향 "catalog entry 가 모두 Spec.ID 로 owned" 는 multi-feature Spec 패턴 — CalcProxy 가
// per-route g.Feature(IDCalcXxx) 로 여러 feature 를 한 Spec 안에서 마운트하거나, ExportHandler
// 가 IDIOExportAmaranth Spec 안에서 IDIOExportAll 라우트를 함께 등록 — 때문에 단순 검증
// 불가. 그쪽은 TestCatalogPathsAreReal 가 routes-side 에서 잡는다.)
//
// 의도한 회귀 시나리오:
//   - 핸들러 init() 의 Spec.ID 를 오타 (예: feature.IDTxPO → "tx.poo" hardcoded) → 본 테스트 실패
//   - 카탈로그에서 feature 를 삭제했는데 Spec 은 그대로 → 본 테스트 실패

// TestMountSpecsHaveCatalogEntry — 등록된 Spec.ID 가 모두 카탈로그에 존재.
//
// Spec.ID="" 는 무가드 Spec — catalog 에 단일 ID 로 묶일 수 없는 형태 (예: /health, CalcProxy
// 의 per-route gate 묶음). path-level 정합은 기존 TestFeatureCoverage / TestCatalogPathsAreReal
// 가 검증.
func TestMountSpecsHaveCatalogEntry(t *testing.T) {
	var orphans []string
	for _, s := range mount.All() {
		if s.ID == "" {
			continue
		}
		if _, ok := feature.Catalog[s.ID]; !ok {
			orphans = append(orphans, string(s.ID))
		}
	}
	if len(orphans) > 0 {
		sort.Strings(orphans)
		t.Errorf("카탈로그에 없는 Spec.ID %d개:\n  %s\n→ feature/catalog.go 에 entry 추가 또는 init() 의 Spec.ID 수정",
			len(orphans), strings.Join(orphans, "\n  "))
	}
}
