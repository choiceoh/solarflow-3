package handler

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestColumnIndexCaseAndSpaceInsensitive(t *testing.T) {
	headers := []string{"코드", "수량 ", " 단가"}
	if got := columnIndex(headers, "코드"); got != 0 {
		t.Errorf("코드 = %d, want 0", got)
	}
	if got := columnIndex(headers, "수량"); got != 1 {
		t.Errorf("수량 = %d, want 1", got)
	}
	if got := columnIndex(headers, "단가"); got != 2 {
		t.Errorf("단가 = %d, want 2", got)
	}
	if got := columnIndex(headers, "없는컬럼"); got != -1 {
		t.Errorf("없는컬럼 = %d, want -1", got)
	}
}

func TestMarshalToolPayloadShape(t *testing.T) {
	out := marshalToolPayload(map[string]any{
		"sheet_id":   "abc",
		"shown_count": 3,
		"hint":       "",
	})
	var got map[string]any
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got["sheet_id"] != "abc" {
		t.Fatalf("payload missing sheet_id: %v", got)
	}
}

func TestFormatAggregateValuePrimitives(t *testing.T) {
	if v := formatAggregateValue(nil); v != nil {
		t.Errorf("nil → %v", v)
	}
	if v := formatAggregateValue([]byte("123.45")); v != "123.45" {
		t.Errorf("[]byte numeric → %v", v)
	}
	if v := formatAggregateValue(float64(42)); v != int64(42) {
		t.Errorf("integer-float → %v", v)
	}
	if v := formatAggregateValue(float64(3.5)); v != 3.5 {
		t.Errorf("non-integer float → %v", v)
	}
}

func TestToolQueryAttachedSheetSchemaValid(t *testing.T) {
	tool := toolQueryAttachedSheet()
	if tool.name != "query_attached_sheet" {
		t.Fatalf("tool name = %q", tool.name)
	}
	var schema map[string]any
	if err := json.Unmarshal(tool.inputSchema, &schema); err != nil {
		t.Fatalf("schema not valid JSON: %v", err)
	}
	props, ok := schema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("schema.properties not object")
	}
	for _, key := range []string{"sheet_id", "mode", "conditions", "column", "op", "q"} {
		if _, exists := props[key]; !exists {
			t.Errorf("schema missing property %q", key)
		}
	}
	desc := tool.description
	for _, term := range []string{"preview", "range", "filter", "aggregate", "search"} {
		if !strings.Contains(desc, term) {
			t.Errorf("description missing mode %q", term)
		}
	}
}
