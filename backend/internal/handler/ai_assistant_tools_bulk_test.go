package handler

// bulk_update_* 도구의 propose 단계 검증 회귀 보호.
// DB I/O 까지는 가지 않는 케이스만 — 잘못된 입력이 propose 시점에서 잘리는지 확인.
// 정상 케이스는 globalProposalStore 에 들어가는 부수효과가 있어 통합 테스트에서 다룸.

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"solarflow-backend/internal/middleware"
)

func adminCtx() context.Context {
	return middleware.SetUserContext(context.Background(),
		"test-admin", "admin", "admin@example.com", middleware.TenantScopeTopsolar, nil)
}

func TestBulkUpdateOutbound_RejectsEmptyUpdates(t *testing.T) {
	tool := toolBulkUpdateOutbound()
	_, err := tool.execute(adminCtx(), nil, json.RawMessage(`{"updates":[],"summary":"테스트"}`))
	if err == nil {
		t.Fatalf("빈 updates 거절 기대, nil 반환")
	}
	if !strings.Contains(err.Error(), "최소 1건") {
		t.Errorf("'최소 1건' 메시지 기대, got=%v", err)
	}
}

func TestBulkUpdateOutbound_RejectsTooManyRows(t *testing.T) {
	tool := toolBulkUpdateOutbound()
	// maxItems 200 이지만 도구 코드의 ToManyRows 분기는 입력 파싱 후 직접 검사.
	// 스키마 단계에선 LLM SDK 가 컷하지만 도구 자체도 가드해야 함 — 그 가드 검증.
	rows := make([]map[string]any, 0, bulkUpdateMaxRows+1)
	for i := 0; i <= bulkUpdateMaxRows; i++ {
		rows = append(rows, map[string]any{"outbound_id": "id-" + string(rune('A'+i%26))})
	}
	body, _ := json.Marshal(map[string]any{"updates": rows, "summary": "테스트"})
	_, err := tool.execute(adminCtx(), nil, body)
	if err == nil {
		t.Fatalf("초과 행수 거절 기대")
	}
	if !strings.Contains(err.Error(), "최대") {
		t.Errorf("'최대' 메시지 기대, got=%v", err)
	}
}

func TestBulkUpdateOutbound_RejectsRowWithoutID(t *testing.T) {
	tool := toolBulkUpdateOutbound()
	body := []byte(`{"updates":[{"outbound_id":"ok-1"},{"outbound_id":""}],"summary":"테스트"}`)
	_, err := tool.execute(adminCtx(), nil, body)
	if err == nil {
		t.Fatalf("빈 outbound_id 거절 기대")
	}
	if !strings.Contains(err.Error(), "outbound_id") {
		t.Errorf("'outbound_id' 메시지 기대, got=%v", err)
	}
}

func TestBulkUpdateOutbound_RejectsEmptySummary(t *testing.T) {
	tool := toolBulkUpdateOutbound()
	body := []byte(`{"updates":[{"outbound_id":"ok-1"}],"summary":"  "}`)
	_, err := tool.execute(adminCtx(), nil, body)
	if err == nil {
		t.Fatalf("빈 summary 거절 기대")
	}
	if !strings.Contains(err.Error(), "summary") {
		t.Errorf("'summary' 메시지 기대, got=%v", err)
	}
}

func TestBulkUpdateOrder_RejectsEmptyUpdates(t *testing.T) {
	tool := toolBulkUpdateOrder()
	_, err := tool.execute(adminCtx(), nil, json.RawMessage(`{"updates":[],"summary":"테스트"}`))
	if err == nil {
		t.Fatalf("빈 updates 거절 기대, nil 반환")
	}
	if !strings.Contains(err.Error(), "최소 1건") {
		t.Errorf("'최소 1건' 메시지 기대, got=%v", err)
	}
}

func TestBulkUpdateOrder_RejectsRowWithoutID(t *testing.T) {
	tool := toolBulkUpdateOrder()
	body := []byte(`{"updates":[{"order_id":"ok-1"},{"order_id":""}],"summary":"테스트"}`)
	_, err := tool.execute(adminCtx(), nil, body)
	if err == nil {
		t.Fatalf("빈 order_id 거절 기대")
	}
	if !strings.Contains(err.Error(), "order_id") {
		t.Errorf("'order_id' 메시지 기대, got=%v", err)
	}
}

// 상수 변경 시 회귀 — 단일 update_outbound 도구가 outboundUpdateProps 를 그대로 채택하는지.
// 둘이 어긋나면 LLM 이 단일에는 있는 필드를 bulk 에는 못 넣게 되어 (또는 반대) 사용성 깨짐.
func TestUpdateOutbound_SchemaUsesSharedProps(t *testing.T) {
	tool := toolUpdateOutbound()
	if !strings.Contains(string(tool.inputSchema), `"outbound_date":{"type":"string"}`) {
		t.Errorf("update_outbound 가 공유 props 미반영 — outboundUpdateProps 와 동기화 깨짐")
	}
}

func TestBulkUpdateOutbound_SchemaUsesSharedProps(t *testing.T) {
	tool := toolBulkUpdateOutbound()
	if !strings.Contains(string(tool.inputSchema), `"outbound_date":{"type":"string"}`) {
		t.Errorf("bulk_update_outbound items 가 공유 props 미반영")
	}
}
