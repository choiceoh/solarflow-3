package model

import "unicode/utf8"

// Warehouse — 창고/장소 정보를 담는 구조체
// 비유: "물류센터 안내 카드" — 광양항, 부산항, 광주공장 등 장소 정보
type Warehouse struct {
	WarehouseID   string `json:"warehouse_id"`
	WarehouseCode string `json:"warehouse_code"`
	WarehouseName string `json:"warehouse_name"`
	WarehouseType string `json:"warehouse_type"`
	LocationCode  string `json:"location_code"`
	LocationName  string `json:"location_name"`
	IsActive      bool   `json:"is_active"`
}

// CreateWarehouseRequest — 창고 등록 시 클라이언트가 보내는 데이터
// 비유: "창고 등록 신청서" — 코드, 이름, 유형, 위치를 빠짐없이 기재
type CreateWarehouseRequest struct {
	WarehouseCode string `json:"warehouse_code"`
	WarehouseName string `json:"warehouse_name"`
	WarehouseType string `json:"warehouse_type"`
	LocationCode  string `json:"location_code"`
	LocationName  string `json:"location_name"`
}

// Validate — 창고 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 코드 길이, 유형 허용값 확인
func (req *CreateWarehouseRequest) Validate() string {
	if req.WarehouseCode == "" {
		return "warehouse_code는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.WarehouseCode) > 4 {
		return "warehouse_code는 4자를 초과할 수 없습니다"
	}
	if req.WarehouseName == "" {
		return "warehouse_name은 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.WarehouseName) > 50 {
		return "warehouse_name은 50자를 초과할 수 없습니다"
	}
	if req.WarehouseType == "" {
		return "warehouse_type은 필수 항목입니다"
	}
	if req.WarehouseType != "port" && req.WarehouseType != "factory" && req.WarehouseType != "vendor" {
		return "warehouse_type은 \"port\", \"factory\", \"vendor\" 중 하나여야 합니다"
	}
	if req.LocationCode == "" {
		return "location_code는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.LocationCode) > 4 {
		return "location_code는 4자를 초과할 수 없습니다"
	}
	if req.LocationName == "" {
		return "location_name은 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.LocationName) > 50 {
		return "location_name은 50자를 초과할 수 없습니다"
	}
	return ""
}

// UpdateWarehouseRequest — 창고 수정 시 클라이언트가 보내는 데이터
// 비유: "창고 정보 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateWarehouseRequest struct {
	WarehouseCode *string `json:"warehouse_code"`
	WarehouseName *string `json:"warehouse_name"`
	WarehouseType *string `json:"warehouse_type"`
	LocationCode  *string `json:"location_code"`
	LocationName  *string `json:"location_name"`
}

// Validate — 창고 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 동일한 규칙으로 검증
func (req *UpdateWarehouseRequest) Validate() string {
	if req.WarehouseCode != nil {
		if *req.WarehouseCode == "" {
			return "warehouse_code는 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.WarehouseCode) > 4 {
			return "warehouse_code는 4자를 초과할 수 없습니다"
		}
	}
	if req.WarehouseName != nil {
		if *req.WarehouseName == "" {
			return "warehouse_name은 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.WarehouseName) > 50 {
			return "warehouse_name은 50자를 초과할 수 없습니다"
		}
	}
	if req.WarehouseType != nil {
		if *req.WarehouseType != "port" && *req.WarehouseType != "factory" && *req.WarehouseType != "vendor" {
			return "warehouse_type은 \"port\", \"factory\", \"vendor\" 중 하나여야 합니다"
		}
	}
	if req.LocationCode != nil {
		if *req.LocationCode == "" {
			return "location_code는 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.LocationCode) > 4 {
			return "location_code는 4자를 초과할 수 없습니다"
		}
	}
	if req.LocationName != nil {
		if *req.LocationName == "" {
			return "location_name은 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.LocationName) > 50 {
			return "location_name은 50자를 초과할 수 없습니다"
		}
	}
	return ""
}
