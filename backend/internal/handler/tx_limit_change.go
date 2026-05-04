package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// LimitChangeHandler — 은행 LC 한도 변경이력 관련 API를 처리하는 핸들러
// 비유: "한도 변경 대장 관리실" — 은행별 LC 한도 변경 기록을 관리
// Rust 한도 복원 타임라인은 /api/v1/calc/lc-limit-timeline 프록시가 담당한다.
// 이력 보존: Update, Delete 없음 — 잘못 입력 시 새 이력으로 정정
type LimitChangeHandler struct {
	DB *supa.Client
}

// NewLimitChangeHandler — LimitChangeHandler 생성자
func NewLimitChangeHandler(db *supa.Client) *LimitChangeHandler {
	return &LimitChangeHandler{DB: db}
}

// List — GET /api/v1/limit-changes — 한도 변경이력 목록 조회
// 비유: 한도 변경 대장에서 특정 은행의 이력을 꺼내 보여주는 것
func (h *LimitChangeHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("limit_changes").
		Select("*", "exact", false)

	// 비유: ?bank_id=xxx — 특정 은행의 한도 변경이력만 필터 (필수 권장)
	if bankID := r.URL.Query().Get("bank_id"); bankID != "" {
		query = query.Eq("bank_id", bankID)
	}

	limit, offset := parseLimitOffset(r, 100, 1000)
	data, count, err := query.Range(offset, offset+limit-1, "").Execute()
	if err != nil {
		log.Printf("[한도 변경이력 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "한도 변경이력 목록 조회에 실패했습니다")
		return
	}

	var changes []model.LimitChange
	if err := json.Unmarshal(data, &changes); err != nil {
		log.Printf("[한도 변경이력 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, changes)
}

// Create — POST /api/v1/limit-changes — 한도 변경이력 등록
// 비유: 새 한도 변경 기록을 대장에 추가하는 것
func (h *LimitChangeHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateLimitChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[한도 변경이력 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("limit_changes").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[한도 변경이력 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "한도 변경이력 등록에 실패했습니다")
		return
	}

	var created []model.LimitChange
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[한도 변경이력 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "한도 변경이력 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}
