package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
)

func TestEnsurePickingListForOutboundRepairsHeaderWithoutItems(t *testing.T) {
	insertedItems := 0
	insertedHeaders := 0
	var insertedRows []map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/picking_lists":
			w.Header().Set("Content-Range", "0-0/1")
			_, _ = w.Write([]byte(`[{"picking_list_id":"pick-1"}]`))
		case (r.Method == http.MethodGet || r.Method == http.MethodHead) && r.URL.Path == "/rest/v1/picking_list_items":
			w.Header().Set("Content-Range", "*/0")
			if r.Method == http.MethodGet {
				_, _ = w.Write([]byte(`[]`))
			}
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/products":
			_, _ = w.Write([]byte(`[{"product_id":"prod-1","product_code":"TSM-580","product_name":"Vertex N","spec_wp":580}]`))
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/warehouse_locations":
			_, _ = w.Write([]byte(`[]`))
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/inventory_movements":
			_, _ = w.Write([]byte(`[]`))
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/inventory_allocations":
			_, _ = w.Write([]byte(`[]`))
		case r.Method == http.MethodPost && r.URL.Path == "/rest/v1/picking_list_items":
			insertedItems++
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("라인 insert body 읽기 실패: %v", err)
			}
			if err := json.Unmarshal(body, &insertedRows); err != nil {
				t.Fatalf("라인 insert JSON 파싱 실패: %v body=%s", err, string(body))
			}
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`[]`))
		case r.Method == http.MethodPost && r.URL.Path == "/rest/v1/picking_lists":
			insertedHeaders++
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`[{"picking_list_id":"unexpected"}]`))
		default:
			t.Fatalf("예상하지 못한 PostgREST 요청: %s %s?%s", r.Method, r.URL.Path, r.URL.RawQuery)
		}
	}))
	defer server.Close()

	db, err := supa.NewClient(server.URL, "test-key", &supa.ClientOptions{})
	if err != nil {
		t.Fatalf("supa client 생성 실패: %v", err)
	}

	h := NewOutboundHandler(db)
	err = h.ensurePickingListForOutbound(model.Outbound{
		OutboundID:  "out-1",
		Status:      "active",
		WarehouseID: "wh-1",
		ProductID:   "prod-1",
		Quantity:    7,
	})
	if err != nil {
		t.Fatalf("header-only 피킹 명세 복구 실패: %v", err)
	}
	if insertedHeaders != 0 {
		t.Fatalf("기존 header가 있는데 새 header를 생성했습니다: %d", insertedHeaders)
	}
	if insertedItems != 1 {
		t.Fatalf("누락 라인 insert 횟수 기대=1 실제=%d", insertedItems)
	}
	if len(insertedRows) != 1 {
		t.Fatalf("누락 라인 1건 insert 기대, 실제=%d rows=%v", len(insertedRows), insertedRows)
	}
	if got := insertedRows[0]["picking_list_id"]; got != "pick-1" {
		t.Fatalf("기존 picking_list_id로 라인을 복구해야 합니다: got=%v", got)
	}
	if got := insertedRows[0]["quantity_planned"]; got != float64(7) {
		t.Fatalf("fallback 라인 수량 불일치: got=%v", got)
	}
}
