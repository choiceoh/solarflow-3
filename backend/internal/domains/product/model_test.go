package product

import (
	"strings"
	"testing"
)

// TestProductValidate_EmptyCode — 품번코드가 빈 값일 때 에러 반환 확인
func TestProductValidate_EmptyCode(t *testing.T) {
	req := validProductRequest()
	req.ProductCode = ""
	msg := req.Validate()
	if msg == "" {
		t.Fatal("빈 ProductCode에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "product_code") {
		t.Fatalf("에러 메시지에 'product_code'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestProductValidate_EmptyName — 품번명이 빈 값일 때 에러 반환 확인
func TestProductValidate_EmptyName(t *testing.T) {
	req := validProductRequest()
	req.ProductName = ""
	msg := req.Validate()
	if msg == "" {
		t.Fatal("빈 ProductName에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "product_name") {
		t.Fatalf("에러 메시지에 'product_name'이 포함되어야 합니다, got: %s", msg)
	}
}

// TestProductValidate_EmptyManufacturerID — 제조사ID가 빈 값일 때 에러 반환 확인
func TestProductValidate_EmptyManufacturerID(t *testing.T) {
	req := validProductRequest()
	req.ManufacturerID = ""
	msg := req.Validate()
	if msg == "" {
		t.Fatal("빈 ManufacturerID에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "manufacturer_id") {
		t.Fatalf("에러 메시지에 'manufacturer_id'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestProductValidate_ZeroSpecWp — SpecWP가 0일 때 에러 반환 확인
func TestProductValidate_ZeroSpecWp(t *testing.T) {
	req := validProductRequest()
	req.SpecWP = 0
	msg := req.Validate()
	if msg == "" {
		t.Fatal("SpecWP=0에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "spec_wp") {
		t.Fatalf("에러 메시지에 'spec_wp'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestProductValidate_NegativeSpecWp — SpecWP가 음수일 때 에러 반환 확인
func TestProductValidate_NegativeSpecWp(t *testing.T) {
	req := validProductRequest()
	req.SpecWP = -1
	msg := req.Validate()
	if msg == "" {
		t.Fatal("SpecWP=-1에 대해 에러가 반환되어야 합니다")
	}
}

// TestProductValidate_ZeroWidth — ModuleWidthMM이 0일 때 에러 반환 확인
func TestProductValidate_ZeroWidth(t *testing.T) {
	req := validProductRequest()
	req.ModuleWidthMM = 0
	msg := req.Validate()
	if msg == "" {
		t.Fatal("ModuleWidthMM=0에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "module_width_mm") {
		t.Fatalf("에러 메시지에 'module_width_mm'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestProductValidate_ZeroHeight — ModuleHeightMM이 0일 때 에러 반환 확인
func TestProductValidate_ZeroHeight(t *testing.T) {
	req := validProductRequest()
	req.ModuleHeightMM = 0
	msg := req.Validate()
	if msg == "" {
		t.Fatal("ModuleHeightMM=0에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "module_height_mm") {
		t.Fatalf("에러 메시지에 'module_height_mm'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestProductValidate_NegativeWidth — ModuleWidthMM이 음수일 때 에러 반환 확인
func TestProductValidate_NegativeWidth(t *testing.T) {
	req := validProductRequest()
	req.ModuleWidthMM = -1
	msg := req.Validate()
	if msg == "" {
		t.Fatal("ModuleWidthMM=-1에 대해 에러가 반환되어야 합니다")
	}
}

// TestProductValidate_Success — 정상 데이터일 때 빈 문자열 반환 확인
func TestProductValidate_Success(t *testing.T) {
	req := validProductRequest()
	msg := req.Validate()
	if msg != "" {
		t.Fatalf("정상 데이터에서 에러가 반환되면 안 됩니다, got: %s", msg)
	}
}

// TestProductValidate_ProductFamilyFields — 제품군/변종 분류 필드의 정상 입력 확인
func TestProductValidate_ProductFamilyFields(t *testing.T) {
	req := validProductRequest()
	req.ProductFamilyCode = testStringPtr("JKM-N-78HL4-BDV-S")
	req.ProductVariantKind = testStringPtr("output_bin")
	req.BomRevision = testStringPtr("BOM-A")
	req.SubstitutionGroupCode = testStringPtr("JKM-78HL4-BDV")

	msg := req.Validate()
	if msg != "" {
		t.Fatalf("제품군 분류 정상 데이터에서 에러가 반환되면 안 됩니다, got: %s", msg)
	}
}

// TestProductValidate_InvalidVariantKind — 허용되지 않은 품번 분리 사유 차단 확인
func TestProductValidate_InvalidVariantKind(t *testing.T) {
	req := validProductRequest()
	req.ProductVariantKind = testStringPtr("random")

	msg := req.Validate()
	if msg == "" {
		t.Fatal("허용되지 않은 ProductVariantKind에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "product_variant_kind") {
		t.Fatalf("에러 메시지에 'product_variant_kind'가 포함되어야 합니다, got: %s", msg)
	}
}

// validProductRequest — 테스트용 정상 데이터 생성 헬퍼
// D-160: WattageKW 필드 제거 — DB trigger 가 spec_wp 기반 자동 채움.
func validProductRequest() CreateProductRequest {
	return CreateProductRequest{
		ProductCode:    "JKM635N-7RL4-V",
		ProductName:    "Tiger Neo N-type 635W",
		ManufacturerID: "550e8400-e29b-41d4-a716-446655440000",
		SpecWP:         635,
		ModuleWidthMM:  1134,
		ModuleHeightMM: 2465,
	}
}

func testStringPtr(v string) *string {
	return &v
}
