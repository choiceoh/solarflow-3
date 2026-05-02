package handler

import (
	"testing"

	"solarflow-backend/internal/model"
)

// --- Note 핸들러 테스트 ---

// TestNote_Validate_EmptyContent — content 필수
func TestNote_Validate_EmptyContent(t *testing.T) {
	req := model.CreateNoteRequest{UserID: "user1", Content: ""}
	if msg := req.Validate(); msg == "" {
		t.Error("빈 content에 대해 에러가 발생해야 합니다")
	}
}

// TestNote_Validate_TooLong — content 2000자 초과
func TestNote_Validate_TooLong(t *testing.T) {
	long := ""
	for i := 0; i < 2001; i++ {
		long += "가"
	}
	req := model.CreateNoteRequest{UserID: "user1", Content: long}
	if msg := req.Validate(); msg == "" {
		t.Error("2000자 초과 content에 대해 에러가 발생해야 합니다")
	}
}

// TestNote_Validate_Success — 정상 케이스
func TestNote_Validate_Success(t *testing.T) {
	req := model.CreateNoteRequest{UserID: "user1", Content: "테스트 메모"}
	if msg := req.Validate(); msg != "" {
		t.Errorf("정상 요청에 에러 발생: %s", msg)
	}
}

// TestNote_Validate_InvalidLinkedTable — 허용되지 않는 linked_table
func TestNote_Validate_InvalidLinkedTable(t *testing.T) {
	table := "invalid_table"
	id := "some-id"
	req := model.CreateNoteRequest{
		UserID: "user1", Content: "메모",
		LinkedTable: &table, LinkedID: &id,
	}
	if msg := req.Validate(); msg == "" {
		t.Error("잘못된 linked_table에 대해 에러가 발생해야 합니다")
	}
}

// TestNote_Validate_LinkedTableWithoutID — linked_table만 있고 linked_id 없음
func TestNote_Validate_LinkedTableWithoutID(t *testing.T) {
	table := "purchase_orders"
	req := model.CreateNoteRequest{
		UserID: "user1", Content: "메모",
		LinkedTable: &table,
	}
	if msg := req.Validate(); msg == "" {
		t.Error("linked_table만 있고 linked_id 없으면 에러가 발생해야 합니다")
	}
}

// TestNote_Validate_ValidLinked — 정상 연결 메모
func TestNote_Validate_ValidLinked(t *testing.T) {
	table := "bl_shipments"
	id := "some-uuid"
	req := model.CreateNoteRequest{
		UserID: "user1", Content: "B/L 관련 메모",
		LinkedTable: &table, LinkedID: &id,
	}
	if msg := req.Validate(); msg != "" {
		t.Errorf("정상 연결 메모에 에러 발생: %s", msg)
	}
}

// TestNote_Update_Validate_EmptyContent — 수정 시 빈 content 금지
func TestNote_Update_Validate_EmptyContent(t *testing.T) {
	empty := ""
	req := model.UpdateNoteRequest{Content: &empty}
	if msg := req.Validate(); msg == "" {
		t.Error("빈 content 수정에 에러가 발생해야 합니다")
	}
}

// TestNote_OwnershipError — 소유권 에러 메시지
func TestNote_OwnershipError(t *testing.T) {
	err := &ownershipError{}
	if err.Error() != "본인의 메모가 아닙니다" {
		t.Errorf("기대: '본인의 메모가 아닙니다', 실제: '%s'", err.Error())
	}
}
