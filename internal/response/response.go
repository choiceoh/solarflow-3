package response

import (
	"encoding/json"
	"log"
	"net/http"
)

// ErrorResponse — 에러 응답의 표준 구조체
// 비유: 모든 에러 메시지를 같은 양식(봉투)에 담아 보내는 것
type ErrorResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// RespondJSON — 구조화된 JSON 응답을 전송하는 공통 유틸리티
// 비유: 모든 응답을 "JSON 택배 상자"에 포장해서 보내주는 직원
func RespondJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		// 비유: 택배 포장 중 실패 — 로그에 기록
		log.Printf("[응답 인코딩 에러] %v", err)
	}
}

// RespondError — 에러 응답을 표준 형식으로 전송
// 비유: 문제가 생기면 정해진 양식의 "에러 안내서"를 보내는 것
func RespondError(w http.ResponseWriter, status int, message string) {
	RespondJSON(w, status, ErrorResponse{
		Code:    status,
		Message: message,
	})
}
