package declaration

import (
	"strings"
	"testing"
)

// TestDeclarationValidate_EmptyNumber — 면장번호가 빈 값일 때 에러 반환 확인
func TestDeclarationValidate_EmptyNumber(t *testing.T) {
	req := CreateDeclarationRequest{
		DeclarationNumber: "",
		BLID:              "550e8400-e29b-41d4-a716-446655440000",
		CompanyID:         "550e8400-e29b-41d4-a716-446655440001",
		DeclarationDate:   "2025-03-15",
	}
	msg := req.Validate()
	if msg == "" {
		t.Fatal("빈 DeclarationNumber에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "declaration_number") {
		t.Fatalf("에러 메시지에 'declaration_number'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestDeclarationValidate_EmptyBLID — B/L ID가 빈 값일 때 에러 반환 확인
func TestDeclarationValidate_EmptyBLID(t *testing.T) {
	req := CreateDeclarationRequest{
		DeclarationNumber: "12345-25-1234567",
		BLID:              "",
		CompanyID:         "550e8400-e29b-41d4-a716-446655440001",
		DeclarationDate:   "2025-03-15",
	}
	msg := req.Validate()
	if msg == "" {
		t.Fatal("빈 BLID에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "bl_id") {
		t.Fatalf("에러 메시지에 'bl_id'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestDeclarationValidate_Success — 정상 데이터일 때 빈 문자열 반환 확인
func TestDeclarationValidate_Success(t *testing.T) {
	req := CreateDeclarationRequest{
		DeclarationNumber: "12345-25-1234567",
		BLID:              "550e8400-e29b-41d4-a716-446655440000",
		CompanyID:         "550e8400-e29b-41d4-a716-446655440001",
		DeclarationDate:   "2025-03-15",
	}
	msg := req.Validate()
	if msg != "" {
		t.Fatalf("정상 데이터에서 에러가 반환되면 안 됩니다, got: %s", msg)
	}
}
