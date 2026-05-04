package handler

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// resetDocsCacheToRepoRoot — test 환경에서 cwd 가 backend/internal/handler 라
// 기본 `ai-context` / `backend/ai-context` 모두 못 찾음. 환경변수로 repo root 의
// backend/ai-context 절대경로를 지정한 뒤 sync.Once 를 리셋해 다시 로드.
func resetDocsCacheToRepoRoot(t *testing.T) {
	abs, err := filepath.Abs(filepath.Join("..", "..", "ai-context"))
	if err != nil {
		t.Fatalf("abs path 실패: %v", err)
	}
	t.Setenv("SOLARFLOW_AI_CONTEXT_DIR", abs)
	docsCache = nil
	docsCacheOnce = sync.Once{}
}

// TestExtractMetaHints_FormWithFields — MetaForm 형태 (description/aiHint + sections[].fields[].description/aiHint).
func TestExtractMetaHints_FormWithFields(t *testing.T) {
	raw := json.RawMessage(`{
		"id": "partner_form_v2",
		"title": {"create": "거래처 등록", "edit": "거래처 수정"},
		"description": "거래처 마스터를 등록합니다.",
		"aiHint": "is_active=false 면 신규 PO 선택지에서 자동 제외.",
		"sections": [
			{"cols": 1, "fields": [
				{"key": "partner_name", "label": "거래처명", "description": "사업자등록증 정식 명칭"}
			]},
			{"cols": 2, "fields": [
				{"key": "erp_code", "label": "ERP코드", "aiHint": "회계 매칭 키 — 변경 신중히"},
				{"key": "no_hint", "label": "기타", "type": "text"}
			]}
		]
	}`)
	hints, err := extractMetaHints(raw)
	if err != nil {
		t.Fatalf("extractMetaHints error: %v", err)
	}
	if hints == nil {
		t.Fatal("hints nil — 추출 실패")
	}
	if hints.Title != "거래처 등록" {
		t.Errorf("title=%q, want 거래처 등록", hints.Title)
	}
	if hints.Description == "" {
		t.Errorf("description 누락")
	}
	if hints.AIHint == "" {
		t.Errorf("aiHint 누락")
	}
	if len(hints.Fields) != 2 {
		t.Errorf("fields=%d, want 2 (no_hint 는 제외되어야 함)", len(hints.Fields))
	}
	for _, f := range hints.Fields {
		if f.Key == "no_hint" {
			t.Errorf("no_hint 가 추출됨 — description/aiHint 둘 다 비면 제외해야")
		}
	}
}

// TestExtractMetaHints_DetailWithTabs — MetaDetail 형태 (header.title + sections + tabs[].sections).
func TestExtractMetaHints_DetailWithTabs(t *testing.T) {
	raw := json.RawMessage(`{
		"id": "outbound_detail",
		"description": "출고 단건 상세",
		"header": {"title": "출고 상세"},
		"sections": [
			{"title": "기본", "fields": [
				{"key": "status", "label": "상태", "description": "출고 진행 단계"}
			]}
		],
		"tabs": [
			{"key": "lines", "label": "라인", "sections": [
				{"title": "라인", "fields": [
					{"key": "qty", "label": "수량", "aiHint": "취소 시 0 으로 자동 갱신"}
				]}
			]}
		]
	}`)
	hints, err := extractMetaHints(raw)
	if err != nil {
		t.Fatalf("extractMetaHints error: %v", err)
	}
	if hints == nil {
		t.Fatal("hints nil")
	}
	if hints.Title != "출고 상세" {
		t.Errorf("title=%q, want 출고 상세 (header.title)", hints.Title)
	}
	keys := map[string]bool{}
	for _, f := range hints.Fields {
		keys[f.Key] = true
	}
	if !keys["status"] {
		t.Error("status 필드 누락")
	}
	if !keys["qty"] {
		t.Error("qty 필드 (tabs[].sections[].fields[]) 누락")
	}
}

// TestExtractMetaHints_ListScreenPage — ListScreen/TabbedList 형태 (page.title/description/aiHint).
func TestExtractMetaHints_ListScreenPage(t *testing.T) {
	raw := json.RawMessage(`{
		"id": "outbound_page",
		"page": {
			"eyebrow": "운영",
			"title": "출고/판매",
			"description": "주간 출고와 매출 추세",
			"aiHint": "manager 이상에만 단가 답변. viewer 는 거절."
		}
	}`)
	hints, err := extractMetaHints(raw)
	if err != nil {
		t.Fatalf("extractMetaHints error: %v", err)
	}
	if hints == nil {
		t.Fatal("hints nil")
	}
	if hints.Title != "출고/판매" {
		t.Errorf("title=%q, want 출고/판매", hints.Title)
	}
	if !strings.Contains(hints.AIHint, "manager") {
		t.Errorf("page.aiHint 미추출: %q", hints.AIHint)
	}
}

// TestExtractMetaHints_EmptyConfig — description/aiHint 가 전혀 없으면 nil.
func TestExtractMetaHints_EmptyConfig(t *testing.T) {
	raw := json.RawMessage(`{"id": "x", "sections": [{"fields": [{"key": "a", "label": "A"}]}]}`)
	hints, err := extractMetaHints(raw)
	if err != nil {
		t.Fatalf("extractMetaHints error: %v", err)
	}
	if hints != nil {
		t.Errorf("hints=%+v, want nil (도움말 자료 없음)", hints)
	}
}

// TestExtractMetaHints_ChildArrayRecursion — childFields 도 한 단계 재귀로 추출.
func TestExtractMetaHints_ChildArrayRecursion(t *testing.T) {
	raw := json.RawMessage(`{
		"id": "po_form",
		"sections": [
			{"fields": [
				{"key": "lines", "type": "child_array", "childFields": [
					{"key": "qty", "label": "수량", "description": "라인 수량"},
					{"key": "unit_price", "label": "단가", "aiHint": "원가 노출 — manager 이하 차단"}
				]}
			]}
		]
	}`)
	hints, err := extractMetaHints(raw)
	if err != nil {
		t.Fatalf("extractMetaHints error: %v", err)
	}
	if hints == nil {
		t.Fatal("hints nil")
	}
	keys := map[string]bool{}
	for _, f := range hints.Fields {
		keys[f.Key] = true
	}
	if !keys["qty"] || !keys["unit_price"] {
		t.Errorf("childFields 추출 실패: keys=%v", keys)
	}
}

// TestFormatMetaHintsBlock_Renders — 모든 섹션이 렌더링되는지.
func TestFormatMetaHintsBlock_Renders(t *testing.T) {
	h := &assistantMetaHints{
		Title:       "거래처 등록",
		Description: "마스터 등록",
		AIHint:      "비활성은 자동 제외",
		Fields: []assistantFieldHint{
			{Key: "partner_name", Label: "거래처명", Description: "사업자명"},
			{Key: "erp_code", Label: "ERP코드", AIHint: "회계 키"},
		},
	}
	out := formatMetaHintsBlock(h)
	if !strings.Contains(out, "[화면 도움말]") {
		t.Error("헤더 누락")
	}
	if !strings.Contains(out, "거래처 등록") || !strings.Contains(out, "마스터 등록") {
		t.Error("title/description 누락")
	}
	if !strings.Contains(out, "비활성은 자동 제외") {
		t.Error("aiHint 누락")
	}
	if !strings.Contains(out, "거래처명") || !strings.Contains(out, "사업자명") {
		t.Error("필드 description 누락")
	}
	if !strings.Contains(out, "ERP코드") || !strings.Contains(out, "(회절") && !strings.Contains(out, "(회계 키)") {
		t.Error("필드 aiHint 누락")
	}
}

// TestFormatMetaHintsBlock_NilOrEmpty — nil/빈 hints 는 빈 문자열.
func TestFormatMetaHintsBlock_NilOrEmpty(t *testing.T) {
	if formatMetaHintsBlock(nil) != "" {
		t.Error("nil 인데 출력 있음")
	}
	if formatMetaHintsBlock(&assistantMetaHints{}) != "" {
		t.Error("빈 hints 인데 출력 있음")
	}
}

// TestLookupDocs_PathMatching — 실제 라우트가 의도한 도큐로 매칭되는지.
// docs 캐시는 backend/ai-context/ 의 실제 md 파일에서 로드됨 (이 테스트는 그 파일들이 있는 git 체크아웃에서 실행 전제).
func TestLookupDocs_PathMatching(t *testing.T) {
	resetDocsCacheToRepoRoot(t)
	cases := []struct {
		path    string
		want    string // 부분 문자열 (해당 도큐의 H1 등) — 매칭 시 출력에 포함되어야 함
		wantErr bool   // true 면 빈 문자열 기대
	}{
		{"/outbound", "출고", false},
		{"/orders/123", "출고", false},          // /orders prefix
		{"/inventory", "출고", false},           // 재고 → outbound.md
		{"/sales-analysis", "출고", false},      // → outbound.md
		{"/inbound", "B/L 입고", false},
		{"/bls/AAA", "B/L 입고", false},
		{"/customs", "B/L 입고", false},
		{"/procurement", "P/O 발주", false},
		{"/purchase-history", "P/O 발주", false},
		{"/lc", "P/O 발주", false},
		{"/banking", "은행", false},
		{"/baro/price-book", "바로", false},
		{"/baro/incoming", "바로", false},
		{"/group-trade/baro-inbox", "바로", false},
		{"/masters/partners-v2", "마스터", false},
		{"/data/manufacturers/new", "마스터", false},
		{"/some/unknown/path", "", true}, // 매칭 없음 → 빈 문자열
		{"/login", "", true},
	}
	for _, c := range cases {
		got := lookupDocs(c.path)
		if c.wantErr {
			if got != "" {
				t.Errorf("lookupDocs(%q) = %q chars, want empty", c.path, got[:min(60, len(got))])
			}
			continue
		}
		if got == "" {
			t.Errorf("lookupDocs(%q) returned empty, want doc containing %q", c.path, c.want)
			continue
		}
		if !strings.Contains(got, c.want) {
			t.Errorf("lookupDocs(%q) doesn't contain %q (first 80 chars: %q)", c.path, c.want, got[:min(80, len(got))])
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// TestBuildSystemPrompt_PageContextIncludesMetaHintsAndDocs — 백엔드 enrich 결과가 시스템 프롬프트에 들어가는지.
func TestBuildSystemPrompt_PageContextIncludesMetaHintsAndDocs(t *testing.T) {
	ctx := ctxFor("admin", "topsolar")
	pc := &assistantPageContext{
		Path:     "/masters/partners-v2",
		Scope:    "form",
		ConfigID: "partner_form_v2",
		metaHints: &assistantMetaHints{
			Title:       "거래처 등록",
			Description: "마스터 등록",
		},
		docs: "거래처는 회계 매칭 키. 삭제 대신 비활성 사용.",
	}
	prompt := buildSystemPrompt(ctx, pc, nil)
	if !strings.Contains(prompt, "[화면 도움말]") {
		t.Error("metaHints 섹션 누락")
	}
	if !strings.Contains(prompt, "거래처 등록") {
		t.Error("metaHints title 미렌더링")
	}
	if !strings.Contains(prompt, "[참고 문서") {
		t.Error("docs 섹션 누락")
	}
	if !strings.Contains(prompt, "삭제 대신 비활성") {
		t.Error("docs 본문 미렌더링")
	}
}
