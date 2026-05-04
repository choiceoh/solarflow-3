package handler

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"solarflow-backend/internal/middleware"
)

// wrapToolResult — 빈/null/단일/다건 입력에 대한 회귀 보호.
// 모델이 count 와 hint 만 보고 다음 행동을 결정하므로 형태가 깨지면 안 됨.

func TestWrapToolResult_EmptyArrayProducesHint(t *testing.T) {
	got, err := wrapToolResult([]byte("[]"), "맞춤 안내")
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	var parsed map[string]any
	if e := json.Unmarshal([]byte(got), &parsed); e != nil {
		t.Fatalf("결과가 유효한 JSON이 아님: %v", e)
	}
	if c, _ := parsed["count"].(float64); c != 0 {
		t.Fatalf("count=0 기대, got=%v", parsed["count"])
	}
	if h, _ := parsed["hint"].(string); h != "맞춤 안내" {
		t.Fatalf("hint=맞춤 안내 기대, got=%q", h)
	}
}

func TestWrapToolResult_EmptyArrayUsesDefaultHintWhenBlank(t *testing.T) {
	got, _ := wrapToolResult([]byte("[]"), "")
	if !strings.Contains(got, "조건에 맞는 데이터가 없습니다") {
		t.Fatalf("기본 hint 누락: %s", got)
	}
}

func TestWrapToolResult_NullNormalizedToEmpty(t *testing.T) {
	got, err := wrapToolResult([]byte("null"), "맞춤")
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if !strings.Contains(got, `"rows":[]`) {
		t.Fatalf("null이 []로 정규화되지 않음: %s", got)
	}
	if !strings.Contains(got, `"count":0`) {
		t.Fatalf("count=0이 아님: %s", got)
	}
	if !strings.Contains(got, `"hint":"맞춤"`) {
		t.Fatalf("hint 누락: %s", got)
	}
}

func TestWrapToolResult_NilNormalizedToEmpty(t *testing.T) {
	got, err := wrapToolResult(nil, "")
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if !strings.Contains(got, `"rows":[]`) || !strings.Contains(got, `"count":0`) {
		t.Fatalf("nil이 []로 정규화되지 않음: %s", got)
	}
}

func TestWrapToolResult_PopulatedArrayOmitsHint(t *testing.T) {
	in := []byte(`[{"id":"a"},{"id":"b"}]`)
	got, err := wrapToolResult(in, "사용 안 됨")
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	var parsed map[string]any
	_ = json.Unmarshal([]byte(got), &parsed)
	if c, _ := parsed["count"].(float64); c != 2 {
		t.Fatalf("count=2 기대, got=%v", parsed["count"])
	}
	if _, hasHint := parsed["hint"]; hasHint {
		t.Fatalf("populated 결과에 hint가 있으면 안 됨: %s", got)
	}
}

func TestWrapToolResult_RejectsInvalidJSON(t *testing.T) {
	if _, err := wrapToolResult([]byte("{not json"), ""); err == nil {
		t.Fatalf("invalid JSON에 에러가 안 남")
	}
}

// fiscalContextOf — 분기/월/회계연도 경계 산출 회귀 보호.

func TestFiscalContextOf_QuarterBoundaries(t *testing.T) {
	cases := []struct {
		date    string
		quarter string
	}{
		{"2026-01-15", "2026Q1"},
		{"2026-03-31", "2026Q1"},
		{"2026-04-01", "2026Q2"},
		{"2026-06-30", "2026Q2"},
		{"2026-07-01", "2026Q3"},
		{"2026-09-30", "2026Q3"},
		{"2026-10-01", "2026Q4"},
		{"2026-12-31", "2026Q4"},
	}
	for _, c := range cases {
		ts, _ := time.Parse("2006-01-02", c.date)
		_, _, q, _ := fiscalContextOf(ts)
		if q != c.quarter {
			t.Errorf("%s → %s, 기대=%s", c.date, q, c.quarter)
		}
	}
}

func TestFiscalContextOf_MonthStart(t *testing.T) {
	ts, _ := time.Parse("2006-01-02", "2026-05-15")
	_, monthStart, _, fyStart := fiscalContextOf(ts)
	if monthStart != "2026-05-01" {
		t.Errorf("monthStart=%s, 기대=2026-05-01", monthStart)
	}
	if fyStart != "2026-01-01" {
		t.Errorf("fyStart=%s, 기대=2026-01-01", fyStart)
	}
}

// formatToolsBlock — nil/빈 입력은 빈 문자열, 도구 description 첫 줄만 노출.

func TestFormatToolsBlock_EmptyReturnsBlank(t *testing.T) {
	if s := formatToolsBlock(nil); s != "" {
		t.Errorf("nil → 빈 문자열 기대, got=%q", s)
	}
	if s := formatToolsBlock([]assistantTool{}); s != "" {
		t.Errorf("빈 슬라이스 → 빈 문자열 기대, got=%q", s)
	}
}

func TestFormatToolsBlock_TruncatesDescription(t *testing.T) {
	long := strings.Repeat("가", 200)
	tools := []assistantTool{{name: "x", description: long}}
	got := formatToolsBlock(tools)
	if !strings.Contains(got, "x — ") {
		t.Errorf("도구 이름·구분자 누락: %s", got)
	}
	if !strings.Contains(got, "…") {
		t.Errorf("긴 description이 truncate 안 됨")
	}
}

func TestFormatToolsBlock_StripsAfterFirstNewline(t *testing.T) {
	tools := []assistantTool{{name: "x", description: "한 줄 설명\n둘째 줄은 잘려야 함"}}
	got := formatToolsBlock(tools)
	if strings.Contains(got, "둘째 줄") {
		t.Errorf("description 두 번째 줄이 노출됨: %s", got)
	}
}

// buildSystemPrompt — 역할/테넌트별 실제 렌더링 검증.
// 누설 위험(권한 외 정보 노출, 다른 역할의 가이드 혼입)과 누락(필수 섹션) 둘 다 본다.

func ctxFor(role, tenant string) context.Context {
	return middleware.SetUserContext(context.Background(), "u-test", role, "test@solarflow.local", tenant, nil)
}

func TestBuildSystemPrompt_AdminTopsolarRendersAllSections(t *testing.T) {
	ctx := ctxFor("admin", middleware.TenantScopeTopsolar)
	prompt := buildSystemPrompt(ctx, nil, assistantToolCatalog())

	for _, must := range []string{
		"SolarFlow ERP 업무 도우미",
		"[사용자]",
		"역할: 시스템관리자 (admin)",
		"테넌트: 탑솔라",
		"이번 달 시작일:",
		"분기:",
		"회계연도 시작일:",
		"[테넌트 가이드]",
		"수입 단가/마진/LC 만기",
		"[도메인",
		"P/O 발주 → L/C 개설",
		"[역할별 가이드 — 시스템관리자]",
		"허용: 모든 정보",
		"[현재 사용 가능 도구]",
		"search_partners",
		"search_lc",
		"[응답 규칙]",
		"count=0",
		"와일드카드",
	} {
		if !strings.Contains(prompt, must) {
			t.Errorf("프롬프트에 %q 누락\n--- 프롬프트 ---\n%s", must, prompt)
		}
	}
}

func TestBuildSystemPrompt_ManagerHasNoSensitiveTools(t *testing.T) {
	ctx := ctxFor("manager", middleware.TenantScopeTopsolar)
	tools := availableAssistantTools(ctx)
	prompt := buildSystemPrompt(ctx, nil, tools)

	if !strings.Contains(prompt, "역할: 본부장") {
		t.Errorf("manager 역할 라벨 누락")
	}
	// manager 가이드: 금액·이익 단어 등장하면 즉시 거절.
	if !strings.Contains(prompt, "금액·이익 단어가 등장하면") {
		t.Errorf("manager 톤 가이드 누락")
	}
	// 노출되면 안 되는 도구
	for _, banned := range []string{"search_purchase_orders", "search_orders", "search_outbound", "search_receipts", "search_lc", "search_bl", "search_declarations"} {
		needle := "- " + banned + " "
		if strings.Contains(prompt, needle) {
			t.Errorf("manager 에게 노출되면 안 되는 도구 %q 가 프롬프트에 포함됨", banned)
		}
	}
}

func TestBuildSystemPrompt_BaroDoesNotExposeLCOrDeclarations(t *testing.T) {
	ctx := ctxFor("operator", middleware.TenantScopeBaro)
	tools := availableAssistantTools(ctx)
	prompt := buildSystemPrompt(ctx, nil, tools)

	if !strings.Contains(prompt, "테넌트: 바로(주)") {
		t.Errorf("baro 테넌트 라벨 누락")
	}
	if !strings.Contains(prompt, "L/C·면장 도구는 노출되지 않음") {
		t.Errorf("baro 테넌트 가이드 누락")
	}
	// 수입 흐름 도구는 module 계열(topsolar/cable) 전용 — baro 에 노출되면 안 됨.
	for _, banned := range []string{"- search_lc ", "- search_declarations ", "- search_bl ", "- search_purchase_orders "} {
		if strings.Contains(prompt, banned) {
			t.Errorf("baro 에 노출되면 안 되는 도구 %q 가 포함됨", banned)
		}
	}
}

// TestAvailableAssistantTools_BaroExcludesImportTools — catalog 단위 검증.
// availableAssistantTools 가 scope 게이트로 LC/BL/면장/PO 를 baro 에서 빼는지.
func TestAvailableAssistantTools_BaroExcludesImportTools(t *testing.T) {
	ctx := ctxFor("operator", middleware.TenantScopeBaro)
	tools := availableAssistantTools(ctx)
	names := map[string]bool{}
	for _, t := range tools {
		names[t.name] = true
	}
	for _, banned := range []string{"search_lc", "search_bl", "search_declarations", "search_purchase_orders"} {
		if names[banned] {
			t.Errorf("baro operator 에게 %q 가 catalog 에 노출됨 (allowScopes 게이트 누락)", banned)
		}
	}
	// 공용 도구는 여전히 노출되어야 함.
	for _, must := range []string{"search_partners", "search_products", "search_manufacturers"} {
		if !names[must] {
			t.Errorf("baro operator 에게 공용 도구 %q 가 사라짐 (allowScopes 과대 적용)", must)
		}
	}
}

// TestAvailableAssistantTools_TopsolarHasImportTools — 반대 방향 회귀 보호.
func TestAvailableAssistantTools_TopsolarHasImportTools(t *testing.T) {
	ctx := ctxFor("operator", middleware.TenantScopeTopsolar)
	tools := availableAssistantTools(ctx)
	names := map[string]bool{}
	for _, t := range tools {
		names[t.name] = true
	}
	for _, must := range []string{"search_lc", "search_bl", "search_declarations", "search_purchase_orders"} {
		if !names[must] {
			t.Errorf("topsolar operator 에게 수입 흐름 도구 %q 가 사라짐", must)
		}
	}
}

// TestAvailableAssistantTools_CableSharesImportToolsWithTopsolar — cable 도 module 계열.
func TestAvailableAssistantTools_CableSharesImportToolsWithTopsolar(t *testing.T) {
	ctx := ctxFor("operator", middleware.TenantScopeCable)
	tools := availableAssistantTools(ctx)
	names := map[string]bool{}
	for _, t := range tools {
		names[t.name] = true
	}
	for _, must := range []string{"search_lc", "search_bl", "search_declarations", "search_purchase_orders"} {
		if !names[must] {
			t.Errorf("cable operator 에게 수입 흐름 도구 %q 가 사라짐 (cable 도 module 계열이어야)", must)
		}
	}
}

// TestBuildSystemPrompt_BaroUsesBaroDomainBlock — baro 사용자는 baro 도메인 정본을 받아야.
// module 의 P/O→L/C 흐름이 baro 프롬프트에 박히면 모델이 헛소리.
func TestBuildSystemPrompt_BaroUsesBaroDomainBlock(t *testing.T) {
	ctx := ctxFor("operator", middleware.TenantScopeBaro)
	prompt := buildSystemPrompt(ctx, nil, nil)

	// baro 흐름 마커
	for _, must := range []string{
		"바로(주) 국내 도매 ERP",
		"단가표 등록 →",
		"그룹사 매입요청",
		"인커밍 보드",
		"배차",
		"채권 보드",
	} {
		if !strings.Contains(prompt, must) {
			t.Errorf("baro 도메인 블록에 %q 누락", must)
		}
	}
	// module 의 정본 흐름 라벨이 박히면 안 됨 — baro 에 부적절.
	if strings.Contains(prompt, "P/O 발주 → L/C 개설") {
		t.Errorf("baro 프롬프트에 module 흐름(P/O→L/C) 이 누설됨")
	}
}

// TestBuildSystemPrompt_CableUsesModuleDomainBlock — cable 도 module 정본을 받아야 (분기 동일).
func TestBuildSystemPrompt_CableUsesModuleDomainBlock(t *testing.T) {
	ctx := ctxFor("operator", middleware.TenantScopeCable)
	prompt := buildSystemPrompt(ctx, nil, nil)
	if !strings.Contains(prompt, "P/O 발주 → L/C 개설") {
		t.Errorf("cable 프롬프트에 module 흐름(P/O→L/C) 누락")
	}
	if strings.Contains(prompt, "단가표 등록 →") {
		t.Errorf("cable 프롬프트에 baro 흐름이 누설됨")
	}
}

// TestBuildSystemPrompt_UnknownScopeFallsBackToModule — 새 테넌트가 추가됐으나 매핑 누락 시 안전한 fallback.
func TestBuildSystemPrompt_UnknownScopeFallsBackToModule(t *testing.T) {
	ctx := ctxFor("operator", "future-tenant")
	prompt := buildSystemPrompt(ctx, nil, nil)
	if !strings.Contains(prompt, "P/O 발주 → L/C 개설") {
		t.Errorf("매핑 안 된 scope 는 module 블록을 받아야 함 (보수적 fallback)")
	}
}

func TestBuildSystemPrompt_OnlyOneRoleGuidePerRender(t *testing.T) {
	ctx := ctxFor("viewer", middleware.TenantScopeTopsolar)
	prompt := buildSystemPrompt(ctx, nil, assistantToolCatalog())
	// viewer 의 가이드만 박혀야지 admin/operator 의 "허용: 모든 정보" 같은 게 들어가면 누설.
	if strings.Contains(prompt, "허용: 모든 정보") {
		t.Errorf("viewer 프롬프트에 admin 가이드가 누설됨")
	}
	if !strings.Contains(prompt, "[역할별 가이드 — 조회]") {
		t.Errorf("viewer 가이드 헤더 누락")
	}
}

func TestBuildSystemPrompt_NilToolsOmitsToolsBlock(t *testing.T) {
	ctx := ctxFor("admin", middleware.TenantScopeTopsolar)
	prompt := buildSystemPrompt(ctx, nil, nil)
	if strings.Contains(prompt, "[현재 사용 가능 도구]") {
		t.Errorf("nil tools 인데 도구 섹션이 들어감")
	}
}

func TestBuildSystemPrompt_PageContextRendersWhenPathSet(t *testing.T) {
	ctx := ctxFor("admin", middleware.TenantScopeTopsolar)
	pc := &assistantPageContext{Path: "/orders/123", Scope: "screen", ConfigID: "orders"}
	prompt := buildSystemPrompt(ctx, pc, nil)
	if !strings.Contains(prompt, "경로: /orders/123") {
		t.Errorf("page path 미렌더링")
	}
	if !strings.Contains(prompt, "config_id=orders") {
		t.Errorf("config_id 미렌더링")
	}
}

// assistantToolCatalog — 모든 도구의 inputSchema 가 유효한 JSON Schema 형태이고
// 필수 필드를 갖췄는지 검증. raw string 으로 박혀있어 컴파일러는 못 잡음.
func TestAssistantToolCatalog_AllSchemasValid(t *testing.T) {
	cat := assistantToolCatalog()
	if len(cat) == 0 {
		t.Fatal("도구 catalog 비어있음")
	}
	seen := map[string]bool{}
	for _, tool := range cat {
		if tool.name == "" {
			t.Errorf("이름 없는 도구")
			continue
		}
		if seen[tool.name] {
			t.Errorf("중복 도구 이름: %s", tool.name)
		}
		seen[tool.name] = true
		if tool.description == "" {
			t.Errorf("%s: description 비어있음", tool.name)
		}
		if tool.allow == nil {
			t.Errorf("%s: allow 콜백 nil", tool.name)
		}
		if tool.execute == nil {
			t.Errorf("%s: execute 콜백 nil", tool.name)
		}

		var schema map[string]any
		if err := json.Unmarshal(tool.inputSchema, &schema); err != nil {
			t.Errorf("%s: inputSchema JSON 파싱 실패: %v", tool.name, err)
			continue
		}
		if schema["type"] != "object" {
			t.Errorf("%s: schema.type=object 기대, got=%v", tool.name, schema["type"])
		}
		if _, ok := schema["properties"]; !ok {
			t.Errorf("%s: schema.properties 누락", tool.name)
		}
		// 모든 도구는 추측한 키 호출을 막기 위해 additionalProperties:false 강제.
		if v, ok := schema["additionalProperties"]; !ok || v != false {
			t.Errorf("%s: additionalProperties:false 누락 (got=%v)", tool.name, v)
		}
	}
}
