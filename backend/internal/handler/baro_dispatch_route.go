package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// DispatchRouteHandler — BARO Phase 4: 출고 배차/일정 보드 핸들러
// 비유: "배송 일정 보관함" — 일자×차량 단위 묶음을 관리하고 그 묶음에 출고를 붙인다
type DispatchRouteHandler struct {
	DB *supa.Client
}

func NewDispatchRouteHandler(db *supa.Client) *DispatchRouteHandler {
	return &DispatchRouteHandler{DB: db}
}

// List — GET /api/v1/baro/dispatch-routes?from=YYYY-MM-DD&to=YYYY-MM-DD&status=...
func (h *DispatchRouteHandler) List(w http.ResponseWriter, r *http.Request) {
	q := h.DB.From("dispatch_routes").Select("*", "exact", false)
	if from := r.URL.Query().Get("from"); from != "" {
		q = q.Gte("route_date", from)
	}
	if to := r.URL.Query().Get("to"); to != "" {
		q = q.Lte("route_date", to)
	}
	if status := r.URL.Query().Get("status"); status != "" {
		q = q.Eq("status", status)
	}
	data, _, err := q.
		Order("route_date", &postgrest.OrderOpts{Ascending: false}).
		Order("created_at", &postgrest.OrderOpts{Ascending: false}).
		Execute()
	if err != nil {
		log.Printf("[BARO 배차 목록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "배차 목록 조회에 실패했습니다")
		return
	}
	var rows []model.DispatchRoute
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// GetByID — GET /api/v1/baro/dispatch-routes/{id}
func (h *DispatchRouteHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	data, _, err := h.DB.From("dispatch_routes").
		Select("*", "exact", false).
		Eq("route_id", id).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "배차 조회에 실패했습니다")
		return
	}
	var rows []model.DispatchRoute
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		response.RespondError(w, http.StatusNotFound, "배차를 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows[0])
}

// Create — POST /api/v1/baro/dispatch-routes
func (h *DispatchRouteHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateDispatchRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	uid := middleware.GetUserID(r.Context())
	insertBody := map[string]interface{}{
		"route_date":    req.RouteDate,
		"vehicle_type":  req.VehicleType,
		"vehicle_plate": req.VehiclePlate,
		"driver_name":   req.DriverName,
		"driver_phone":  req.DriverPhone,
		"memo":          req.Memo,
		"status":        "planned",
	}
	if uid != "" {
		insertBody["created_by"] = uid
	}
	data, _, err := h.DB.From("dispatch_routes").
		Insert(insertBody, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[BARO 배차 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "배차 등록에 실패했습니다")
		return
	}
	var created []model.DispatchRoute
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "배차 등록 결과를 확인할 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/baro/dispatch-routes/{id}
func (h *DispatchRouteHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.UpdateDispatchRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	data, _, err := h.DB.From("dispatch_routes").
		Update(req, "", "").
		Eq("route_id", id).
		Execute()
	if err != nil {
		log.Printf("[BARO 배차 수정 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "배차 수정에 실패했습니다")
		return
	}
	var updated []model.DispatchRoute
	if err := json.Unmarshal(data, &updated); err != nil || len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 배차를 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/baro/dispatch-routes/{id}
// 출고는 ON DELETE SET NULL로 dispatch_route_id가 비워진다.
func (h *DispatchRouteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, _, err := h.DB.From("dispatch_routes").
		Delete("", "").
		Eq("route_id", id).
		Execute()
	if err != nil {
		log.Printf("[BARO 배차 삭제 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "배차 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}

// AssignOutbound — POST /api/v1/baro/dispatch-routes/{id}/assign
// body: { outbound_id } — outbounds.dispatch_route_id 갱신
func (h *DispatchRouteHandler) AssignOutbound(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body model.AssignOutboundRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if body.OutboundID == "" {
		response.RespondError(w, http.StatusBadRequest, "outbound_id는 필수 항목입니다")
		return
	}
	_, _, err := h.DB.From("outbounds").
		Update(map[string]interface{}{"dispatch_route_id": id}, "", "").
		Eq("outbound_id", body.OutboundID).
		Execute()
	if err != nil {
		log.Printf("[BARO 배차 출고할당 실패] route=%s outbound=%s err=%v", id, body.OutboundID, err)
		response.RespondError(w, http.StatusInternalServerError, "출고 할당에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "assigned"})
}

// Unassign — POST /api/v1/baro/dispatch-routes/{id}/unassign
// body: { outbound_id } — 같은 라우트의 출고를 떼낸다 (NULL로)
func (h *DispatchRouteHandler) UnassignOutbound(w http.ResponseWriter, r *http.Request) {
	var body model.AssignOutboundRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if body.OutboundID == "" {
		response.RespondError(w, http.StatusBadRequest, "outbound_id는 필수 항목입니다")
		return
	}
	_, _, err := h.DB.From("outbounds").
		Update(map[string]interface{}{"dispatch_route_id": nil}, "", "").
		Eq("outbound_id", body.OutboundID).
		Execute()
	if err != nil {
		log.Printf("[BARO 배차 출고해제 실패] outbound=%s err=%v", body.OutboundID, err)
		response.RespondError(w, http.StatusInternalServerError, "출고 해제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "unassigned"})
}

// Outbounds — GET /api/v1/baro/dispatch-routes/{id}/outbounds — 라우트에 묶인 출고 목록
func (h *DispatchRouteHandler) Outbounds(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	data, _, err := h.DB.From("outbounds").
		Select("*", "exact", false).
		Eq("dispatch_route_id", id).
		Order("outbound_date", &postgrest.OrderOpts{Ascending: true}).
		Execute()
	if err != nil {
		log.Printf("[BARO 배차-출고 목록 실패] route=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "배차의 출고 목록 조회에 실패했습니다")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(data)
}
