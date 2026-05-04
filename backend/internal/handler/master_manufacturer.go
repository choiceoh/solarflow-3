package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/dbrpc"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// ManufacturerHandler — 제조사(manufacturers) 관련 API를 처리하는 핸들러
// 비유: "제조사 관리실" — 셀 제조사 정보를 관리하는 방
type ManufacturerHandler struct {
	DB *supa.Client
}

// NewManufacturerHandler — ManufacturerHandler 생성자
func NewManufacturerHandler(db *supa.Client) *ManufacturerHandler {
	return &ManufacturerHandler{DB: db}
}

// List — GET /api/v1/manufacturers — 제조사 목록 조회
// 비유: 제조사 관리실에서 전체 명부를 꺼내 보여주는 것
func (h *ManufacturerHandler) List(w http.ResponseWriter, r *http.Request) {
	data, _, err := h.DB.From("manufacturers").
		Select("*", "exact", false).
		Order("priority_rank", &postgrest.OrderOpts{Ascending: true}).
		Order("name_kr", &postgrest.OrderOpts{Ascending: true}).
		Execute()
	if err != nil {
		log.Printf("[제조사 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "제조사 목록 조회에 실패했습니다")
		return
	}

	var manufacturers []model.Manufacturer
	if err := json.Unmarshal(data, &manufacturers); err != nil {
		log.Printf("[제조사 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, manufacturers)
}

// GetByID — GET /api/v1/manufacturers/{id} — 제조사 상세 조회
// 비유: 명부에서 특정 제조사 카드를 찾아 보여주는 것
func (h *ManufacturerHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("manufacturers").
		Select("*", "exact", false).
		Eq("manufacturer_id", id).
		Execute()
	if err != nil {
		log.Printf("[제조사 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "제조사 조회에 실패했습니다")
		return
	}

	var manufacturers []model.Manufacturer
	if err := json.Unmarshal(data, &manufacturers); err != nil {
		log.Printf("[제조사 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(manufacturers) == 0 {
		response.RespondError(w, http.StatusNotFound, "제조사를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, manufacturers[0])
}

// Create — POST /api/v1/manufacturers — 제조사 등록
// 비유: 새 제조사 카드를 만들어 명부에 추가하는 것
func (h *ManufacturerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateManufacturerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[제조사 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("manufacturers").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[제조사 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "제조사 등록에 실패했습니다")
		return
	}

	var created []model.Manufacturer
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[제조사 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "제조사 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/manufacturers/{id} — 제조사 수정
// 비유: 기존 제조사 카드의 정보를 수정하는 것
func (h *ManufacturerHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateManufacturerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[제조사 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("manufacturers").
		Update(req, "", "").
		Eq("manufacturer_id", id).
		Execute()
	if err != nil {
		log.Printf("[제조사 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "제조사 수정에 실패했습니다")
		return
	}

	var updated []model.Manufacturer
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[제조사 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 제조사를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/manufacturers/{id} — 제조사 삭제
// 비유: 명부에서 제조사 카드를 완전히 제거하는 것
func (h *ManufacturerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, _, err := h.DB.From("manufacturers").
		Delete("", "").
		Eq("manufacturer_id", id).
		Execute()
	if err != nil {
		log.Printf("[제조사 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "제조사 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct{ Status string `json:"status"` }{Status: "deleted"})
}

// ToggleStatus — PATCH /api/v1/manufacturers/{id}/status — 제조사 활성/비활성
// 비유: 제조사 카드에 활동중/휴면 도장
func (h *ManufacturerHandler) ToggleStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.ToggleStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	_, _, err := h.DB.From("manufacturers").Update(req, "", "").Eq("manufacturer_id", id).Execute()
	if err != nil {
		log.Printf("[제조사 상태 변경 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "제조사 상태 변경에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct{ Status string `json:"status"` }{Status: "ok"})
}

// UsageCounts — GET /api/v1/manufacturers/usage-counts — 제조사별 참조 건수 집계
// 비유: 명함첩 옆에 "이 제조사 — 품번 N개 · 매입 N건" 도장을 자동으로 찍어 돌려주는 것
func (h *ManufacturerHandler) UsageCounts(w http.ResponseWriter, r *http.Request) {
	body, err := dbrpc.Call(r.Context(), "sf_manufacturer_usage_counts", map[string]interface{}{})
	if err != nil {
		log.Printf("[제조사 참조 건수 조회 실패] %v", err)
		response.RespondError(w, dbrpc.StatusCode(err, http.StatusInternalServerError),
			"제조사 참조 건수 조회에 실패했습니다")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
}
