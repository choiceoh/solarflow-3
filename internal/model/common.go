package model

// ToggleStatusRequest — 활성/비활성 토글 요청의 공통 구조체
// 비유: "활동중/휴면" 도장 — 법인, 제조사 등 여러 곳에서 같은 도장을 사용
type ToggleStatusRequest struct {
	IsActive *bool `json:"is_active"`
}

// Validate — 토글 요청의 입력값을 검증
// 비유: 도장을 찍기 전에 "활동중인지 휴면인지" 선택했는지 확인
func (req *ToggleStatusRequest) Validate() string {
	if req.IsActive == nil {
		return "is_active는 필수 항목입니다"
	}
	return ""
}
