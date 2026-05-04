package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// ModuleDemandForecastHandler — 운영 forecast 수요 계획 API
// 비유: 수주 전 단계의 "앞으로 현장에서 쓸 모듈" 예정표를 관리합니다.
type ModuleDemandForecastHandler struct {
	DB *supa.Client
}

func NewModuleDemandForecastHandler(db *supa.Client) *ModuleDemandForecastHandler {
	return &ModuleDemandForecastHandler{DB: db}
}

// List — GET /api/v1/module-demand-forecasts
func (h *ModuleDemandForecastHandler) List(w http.ResponseWriter, r *http.Request) {
	q := h.DB.From("module_demand_forecasts").Select("*", "exact", false)

	if cid := r.URL.Query().Get("company_id"); cid != "" && cid != "all" {
		q = q.Eq("company_id", cid)
	}
	if status := r.URL.Query().Get("status"); status != "" {
		q = q.Eq("status", status)
	}
	if from := r.URL.Query().Get("from"); from != "" {
		q = q.Gte("demand_month", from)
	}
	if to := r.URL.Query().Get("to"); to != "" {
		q = q.Lte("demand_month", to)
	}

	limit, offset := parseLimitOffset(r, 100, 1000)
	data, count, err := q.Range(offset, offset+limit-1, "").Execute()
	if err != nil {
		log.Printf("[모듈 수요 forecast 목록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "모듈 수요 forecast 조회에 실패했습니다")
		return
	}

	var items []model.ModuleDemandForecast
	if err := json.Unmarshal(data, &items); err != nil {
		log.Printf("[모듈 수요 forecast 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, items)
}

// Create — POST /api/v1/module-demand-forecasts
func (h *ModuleDemandForecastHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateModuleDemandForecastRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("module_demand_forecasts").
		Insert(req, false, "", "representation", "").
		Execute()
	if err != nil {
		log.Printf("[모듈 수요 forecast 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "모듈 수요 forecast 등록에 실패했습니다")
		return
	}

	var created []model.ModuleDemandForecast
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		response.RespondJSON(w, http.StatusCreated, struct{ Status string `json:"status"` }{Status: "created"})
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/module-demand-forecasts/{id}
func (h *ModuleDemandForecastHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateModuleDemandForecastRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("module_demand_forecasts").
		Update(req, "", "").
		Eq("forecast_id", id).
		Execute()
	if err != nil {
		log.Printf("[모듈 수요 forecast 수정 실패] id=%s, %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "모듈 수요 forecast 수정에 실패했습니다")
		return
	}

	var updated []model.ModuleDemandForecast
	if err := json.Unmarshal(data, &updated); err != nil || len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 모듈 수요 forecast를 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/module-demand-forecasts/{id}
func (h *ModuleDemandForecastHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("module_demand_forecasts").
		Delete("", "").
		Eq("forecast_id", id).
		Execute()
	if err != nil {
		log.Printf("[모듈 수요 forecast 삭제 실패] id=%s, %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "모듈 수요 forecast 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct{ Status string `json:"status"` }{Status: "deleted"})
}
