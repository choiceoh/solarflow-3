package handler

// AI 어시스턴트 — 페이지 컨텍스트 enrichment.
// 클라이언트가 보낸 page_context (path/scope/config_id) 를 기반으로:
//  1) ui_configs override 에서 description/aiHint 를 추출해 metaHints 채움
//  2) backend/ai-context/ md 파일에서 path 매칭 도큐를 로드해 docs 채움
// 두 enrichment 모두 best-effort — 실패해도 어시스턴트는 동작해야 함 (warn log 만).

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	supa "github.com/supabase-community/supabase-go"
)

// enrichPageContext — page_context 의 unexported 필드(metaHints, docs) 를 채운다.
// db 가 nil 이면 metaHints 는 건너뛰고 docs 만 시도. pc 가 nil 이면 no-op.
func enrichPageContext(ctx context.Context, db *supa.Client, pc *assistantPageContext) {
	if pc == nil {
		return
	}
	if db != nil && pc.ConfigID != "" && validScope(pc.Scope) {
		if hints, err := fetchMetaHints(ctx, db, pc.Scope, pc.ConfigID); err != nil {
			log.Printf("[assistant context] metaHints fetch 실패 (scope=%s, id=%s): %v", pc.Scope, pc.ConfigID, err)
		} else {
			pc.metaHints = hints
		}
	}
	if pc.Path != "" {
		pc.docs = lookupDocs(pc.Path)
	}
}

// fetchMetaHints — ui_configs 행에서 description/aiHint 만 평탄화해 추출.
// override 가 없으면 nil 반환 (코드 default 메타는 백엔드가 모름).
func fetchMetaHints(ctx context.Context, db *supa.Client, scope, configID string) (*assistantMetaHints, error) {
	data, _, err := db.From("ui_configs").
		Select("config", "exact", false).
		Eq("scope", scope).
		Eq("config_id", configID).
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []struct {
		Config json.RawMessage `json:"config"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 || len(rows[0].Config) == 0 {
		return nil, nil
	}
	return extractMetaHints(rows[0].Config)
}

// extractMetaHints — config JSON 에서 description/aiHint 와 fields[*].description/aiHint 만 추출.
// 메타 스키마(MetaForm/MetaDetail/ListScreen/TabbedList) 별로 필드 위치가 다르므로 케이스 분기.
// 알 수 없는 형태면 정적 description/aiHint 만 시도하고 fields 는 비움.
func extractMetaHints(raw json.RawMessage) (*assistantMetaHints, error) {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, err
	}
	out := &assistantMetaHints{}

	// 폼/상세는 최상위에 description/aiHint
	stringInto(top["description"], &out.Description)
	stringInto(top["aiHint"], &out.AIHint)

	// list/tabbed 는 page.{title,description,aiHint}
	if pageRaw, ok := top["page"]; ok {
		var page map[string]json.RawMessage
		if err := json.Unmarshal(pageRaw, &page); err == nil {
			stringInto(page["title"], &out.Title)
			if out.Description == "" {
				stringInto(page["description"], &out.Description)
			}
			if out.AIHint == "" {
				stringInto(page["aiHint"], &out.AIHint)
			}
		}
	}
	// 폼은 title.create / title.edit 객체. 상세는 header.title.
	if out.Title == "" {
		if titleRaw, ok := top["title"]; ok {
			var asObj map[string]json.RawMessage
			if err := json.Unmarshal(titleRaw, &asObj); err == nil {
				stringInto(asObj["create"], &out.Title)
			} else {
				stringInto(titleRaw, &out.Title)
			}
		}
	}
	if out.Title == "" {
		if hdrRaw, ok := top["header"]; ok {
			var hdr map[string]json.RawMessage
			if err := json.Unmarshal(hdrRaw, &hdr); err == nil {
				stringInto(hdr["title"], &out.Title)
			}
		}
	}

	// 폼 fields: sections[].fields[]
	if secRaw, ok := top["sections"]; ok {
		var sections []map[string]json.RawMessage
		if err := json.Unmarshal(secRaw, &sections); err == nil {
			for _, sec := range sections {
				appendFieldHints(sec["fields"], &out.Fields)
			}
		}
	}
	// 상세 fields: sections[].fields[] (위와 동일 구조) + tabs[].sections[].fields[]
	if tabsRaw, ok := top["tabs"]; ok {
		var tabs []map[string]json.RawMessage
		if err := json.Unmarshal(tabsRaw, &tabs); err == nil {
			for _, tab := range tabs {
				if subSec, ok := tab["sections"]; ok {
					var sections []map[string]json.RawMessage
					if err := json.Unmarshal(subSec, &sections); err == nil {
						for _, sec := range sections {
							appendFieldHints(sec["fields"], &out.Fields)
						}
					}
				}
			}
		}
	}

	if out.Title == "" && out.Description == "" && out.AIHint == "" && len(out.Fields) == 0 {
		return nil, nil
	}
	return out, nil
}

// appendFieldHints — fields[] 배열에서 description/aiHint 가 채워진 항목만 추출.
func appendFieldHints(raw json.RawMessage, out *[]assistantFieldHint) {
	if len(raw) == 0 {
		return
	}
	var fields []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return
	}
	for _, f := range fields {
		var hint assistantFieldHint
		stringInto(f["key"], &hint.Key)
		stringInto(f["label"], &hint.Label)
		stringInto(f["description"], &hint.Description)
		stringInto(f["aiHint"], &hint.AIHint)
		// 부모 자체는 description/aiHint 가 있어야 추가 (없으면 의미 없음).
		// child_array 처럼 부모는 컨테이너만 역할이라 비어 있어도, 자식 fields 는 별도로 재귀.
		if hint.Key != "" && (hint.Description != "" || hint.AIHint != "") {
			*out = append(*out, hint)
		}
		// childFields 는 부모 추가 여부와 무관하게 재귀 (재귀 깊이 2 — 그 이상은 흔치 않음)
		appendFieldHints(f["childFields"], out)
	}
}

func stringInto(raw json.RawMessage, dst *string) {
	if len(raw) == 0 {
		return
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		*dst = s
	}
}

// formatMetaHintsBlock — system prompt 의 [화면 도움말] 섹션. nil 이면 빈 문자열.
func formatMetaHintsBlock(h *assistantMetaHints) string {
	if h == nil {
		return ""
	}
	if h.Title == "" && h.Description == "" && h.AIHint == "" && len(h.Fields) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("[화면 도움말]\n")
	if h.Title != "" {
		fmt.Fprintf(&b, "- 화면: %s\n", h.Title)
	}
	if h.Description != "" {
		fmt.Fprintf(&b, "- 설명: %s\n", h.Description)
	}
	if h.AIHint != "" {
		fmt.Fprintf(&b, "- 추가 컨텍스트: %s\n", h.AIHint)
	}
	if len(h.Fields) > 0 {
		b.WriteString("- 필드별:\n")
		for _, f := range h.Fields {
			label := f.Label
			if label == "" {
				label = f.Key
			}
			parts := []string{}
			if f.Description != "" {
				parts = append(parts, f.Description)
			}
			if f.AIHint != "" {
				parts = append(parts, "("+f.AIHint+")")
			}
			fmt.Fprintf(&b, "  - %s: %s\n", label, strings.Join(parts, " "))
		}
	}
	b.WriteString("\n")
	return b.String()
}

// ─── 도큐(.md) 로더 ────────────────────────────────────────────────────────────

// pathPrefixToDocFile — pathname prefix → ai-context md 파일. 등록 순서대로 첫 매칭 사용.
// 더 긴 prefix 가 먼저 와야 함 (예: /baro/incoming 이 /baro 보다 위에 있어야 별도 도큐로 갈 수 있음).
// 새 도메인 도큐 추가 시 여기 + backend/ai-context/<file>.md 두 곳만 갱신.
var pathPrefixToDocFile = []struct {
	prefix string
	file   string
}{
	// outbound 영역
	{"/outbound", "outbound.md"},
	{"/orders", "outbound.md"},
	{"/sales-analysis", "outbound.md"},
	{"/inventory", "outbound.md"}, // 재고 = 출고 흐름의 직전 상태
	// inbound 영역
	{"/inbound", "inbound.md"},
	{"/bls", "inbound.md"},
	{"/customs", "inbound.md"},
	// procurement 영역
	{"/procurement", "procurement.md"},
	{"/purchase-history", "procurement.md"},
	{"/lc", "procurement.md"},
	{"/po", "procurement.md"},
	// masters (legacy /data 와 신규 /masters 둘 다)
	{"/masters", "masters.md"},
	{"/data", "masters.md"},
	// banking
	{"/banking", "banking.md"},
	// baro 테넌트 — 더 구체적인 prefix 가 위에 와야 함 (등록 순서대로 첫 매칭)
	{"/baro/price-book", "baro-prices.md"},
	{"/baro/purchase-history", "baro-prices.md"},
	{"/baro/group-purchase", "baro-group-trade.md"},
	{"/baro/incoming", "baro-group-trade.md"},
	{"/baro/dispatch", "baro-ops.md"},
	{"/baro/credit-board", "baro-ops.md"},
	{"/group-trade", "baro-group-trade.md"}, // topsolar 측 baro-inbox 도 그룹내 거래 도큐
	{"/baro", "baro.md"},                    // fallback — /baro/<unmapped> 는 개요로
}

var (
	docsCacheOnce sync.Once
	docsCache     map[string]string // file basename → content
	docsCacheDir  string
)

// initDocsCache — backend/ai-context/ 의 md 파일을 모두 메모리에 로드.
// 디렉토리 없으면 빈 캐시 — 도큐 미작성 상태에서도 어시스턴트는 정상 동작.
func initDocsCache() {
	docsCache = map[string]string{}
	dir := docsDir()
	docsCacheDir = dir
	entries, err := os.ReadDir(dir)
	if err != nil {
		log.Printf("[assistant context] ai-context dir 없음 (%s) — md 도큐 비활성", dir)
		return
	}
	loaded := 0
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		full := filepath.Join(dir, e.Name())
		raw, err := os.ReadFile(full)
		if err != nil {
			log.Printf("[assistant context] %s 읽기 실패: %v", full, err)
			continue
		}
		docsCache[e.Name()] = string(raw)
		loaded++
	}
	log.Printf("[assistant context] ai-context %d개 도큐 로드 (%s)", loaded, dir)
}

// docsDir — 환경변수 SOLARFLOW_AI_CONTEXT_DIR 또는 backend/ai-context (cwd 기준 fallback).
// production 배포 시엔 envvar 로 절대경로 지정.
func docsDir() string {
	if v := strings.TrimSpace(os.Getenv("SOLARFLOW_AI_CONTEXT_DIR")); v != "" {
		return v
	}
	// backend/ 에서 실행하면 ./ai-context, repo root 에서 실행하면 backend/ai-context
	for _, cand := range []string{"ai-context", "backend/ai-context"} {
		if info, err := os.Stat(cand); err == nil && info.IsDir() {
			return cand
		}
	}
	return "ai-context"
}

// lookupDocs — pathname 에 매칭되는 md 파일 내용 반환. 매칭 실패 시 빈 문자열.
func lookupDocs(path string) string {
	docsCacheOnce.Do(initDocsCache)
	if len(docsCache) == 0 {
		return ""
	}
	// 가장 긴 prefix 우선 — 등록 순서대로 첫 매칭 사용 (현재 목록은 충돌 없음).
	for _, m := range pathPrefixToDocFile {
		if strings.HasPrefix(path, m.prefix) {
			if content, ok := docsCache[m.file]; ok {
				return content
			}
		}
	}
	return ""
}
