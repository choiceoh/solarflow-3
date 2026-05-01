package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// IntercompanyRequestHandler — BARO Phase 2: 그룹내 매입 요청 핸들러
// 비유: "발주 메모 보관함" — 바로(주)가 적어 보낸 매입 요청을 탑솔라에서 처리
type IntercompanyRequestHandler struct {
	DB *supa.Client
}

func NewIntercompanyRequestHandler(db *supa.Client) *IntercompanyRequestHandler {
	return &IntercompanyRequestHandler{DB: db}
}

// Mine — GET /api/v1/intercompany-requests/mine — BARO 사용자: 내 요청 목록
// 비유: 바로(주) 입장에서 "내가 적어 보낸 요청들"을 한 보관함에서 보는 것
func (h *IntercompanyRequestHandler) Mine(w http.ResponseWriter, r *http.Request) {
	requesterID := r.URL.Query().Get("requester_company_id")
	if requesterID == "" {
		response.RespondError(w, http.StatusBadRequest, "requester_company_id는 필수 항목입니다")
		return
	}
	q := h.DB.From("intercompany_requests").
		Select("*", "exact", false).
		Eq("requester_company_id", requesterID)
	if status := r.URL.Query().Get("status"); status != "" {
		q = q.Eq("status", status)
	}
	data, _, err := q.Order("created_at", &postgrest.OrderOpts{Ascending: false}).Execute()
	if err != nil {
		log.Printf("[BARO 매입요청 내 목록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "매입 요청 조회에 실패했습니다")
		return
	}
	var rows []model.IntercompanyRequest
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	h.enrich(rows)
	response.RespondJSON(w, http.StatusOK, rows)
}

// Inbox — GET /api/v1/intercompany-requests/inbox — 탑솔라 사용자: 받은 요청 목록
// 비유: 탑솔라 입장에서 "바로가 보낸 매입 요청 메모함"을 보는 것
func (h *IntercompanyRequestHandler) Inbox(w http.ResponseWriter, r *http.Request) {
	targetID := r.URL.Query().Get("target_company_id")
	if targetID == "" {
		response.RespondError(w, http.StatusBadRequest, "target_company_id는 필수 항목입니다")
		return
	}
	q := h.DB.From("intercompany_requests").
		Select("*", "exact", false).
		Eq("target_company_id", targetID)
	if status := r.URL.Query().Get("status"); status != "" {
		q = q.Eq("status", status)
	}
	data, _, err := q.Order("created_at", &postgrest.OrderOpts{Ascending: false}).Execute()
	if err != nil {
		log.Printf("[BARO 매입요청 inbox 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "매입 요청 inbox 조회에 실패했습니다")
		return
	}
	var rows []model.IntercompanyRequest
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	h.enrich(rows)
	response.RespondJSON(w, http.StatusOK, rows)
}

// Create — POST /api/v1/intercompany-requests — BARO 사용자: 매입 요청 등록
func (h *IntercompanyRequestHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateIntercompanyRequestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	uid := middleware.GetUserID(r.Context())
	email := middleware.GetUserEmail(r.Context())
	insertBody := map[string]interface{}{
		"requester_company_id": req.RequesterCompanyID,
		"target_company_id":    req.TargetCompanyID,
		"product_id":           req.ProductID,
		"quantity":             req.Quantity,
		"desired_arrival_date": req.DesiredArrivalDate,
		"note":                 req.Note,
		"status":               "pending",
	}
	if uid != "" {
		insertBody["requested_by"] = uid
	}
	if email != "" {
		insertBody["requested_by_email"] = email
	}

	data, _, err := h.DB.From("intercompany_requests").
		Insert(insertBody, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[BARO 매입요청 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "매입 요청 등록에 실패했습니다")
		return
	}
	var created []model.IntercompanyRequest
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "매입 요청 등록 결과를 확인할 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Cancel — PATCH /api/v1/intercompany-requests/{id}/cancel — BARO: 본인 요청 취소
// pending 상태에서만 가능.
func (h *IntercompanyRequestHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.statusGuard(w, r, id, "pending") {
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	updateBody := map[string]interface{}{
		"status":        "cancelled",
		"cancelled_at":  now,
	}
	_, _, err := h.DB.From("intercompany_requests").
		Update(updateBody, "", "").
		Eq("request_id", id).
		Execute()
	if err != nil {
		log.Printf("[BARO 매입요청 취소 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "매입 요청 취소에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

// Reject — PATCH /api/v1/intercompany-requests/{id}/reject — 탑솔라: 요청 거부
// pending 상태에서만 가능.
func (h *IntercompanyRequestHandler) Reject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.statusGuard(w, r, id, "pending") {
		return
	}
	uid := middleware.GetUserID(r.Context())
	email := middleware.GetUserEmail(r.Context())
	now := time.Now().UTC().Format(time.RFC3339)
	updateBody := map[string]interface{}{
		"status":             "rejected",
		"responded_at":       now,
		"responded_by":       uid,
		"responded_by_email": email,
	}
	_, _, err := h.DB.From("intercompany_requests").
		Update(updateBody, "", "").
		Eq("request_id", id).
		Execute()
	if err != nil {
		log.Printf("[BARO 매입요청 거부 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "매입 요청 거부에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}

// Fulfill — PATCH /api/v1/intercompany-requests/{id}/fulfill — 탑솔라: 출고와 연결
// body: { outbound_id }
// pending 상태에서만 가능. status='shipped'로 전환.
func (h *IntercompanyRequestHandler) Fulfill(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body model.FulfillIntercompanyRequestRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if body.OutboundID == "" {
		response.RespondError(w, http.StatusBadRequest, "outbound_id는 필수 항목입니다")
		return
	}
	if !h.statusGuard(w, r, id, "pending") {
		return
	}
	uid := middleware.GetUserID(r.Context())
	email := middleware.GetUserEmail(r.Context())
	now := time.Now().UTC().Format(time.RFC3339)
	updateBody := map[string]interface{}{
		"status":             "shipped",
		"outbound_id":        body.OutboundID,
		"responded_at":       now,
		"responded_by":       uid,
		"responded_by_email": email,
	}
	_, _, err := h.DB.From("intercompany_requests").
		Update(updateBody, "", "").
		Eq("request_id", id).
		Execute()
	if err != nil {
		log.Printf("[BARO 매입요청 출고연결 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "매입 요청 출고 연결에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "shipped"})
}

// Receive — PATCH /api/v1/intercompany-requests/{id}/receive — BARO: 입고 확인
// shipped 상태에서만 가능.
func (h *IntercompanyRequestHandler) Receive(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.statusGuard(w, r, id, "shipped") {
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	updateBody := map[string]interface{}{
		"status":      "received",
		"received_at": now,
	}
	_, _, err := h.DB.From("intercompany_requests").
		Update(updateBody, "", "").
		Eq("request_id", id).
		Execute()
	if err != nil {
		log.Printf("[BARO 매입요청 입고확인 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "입고 확인에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "received"})
}

// statusGuard — 현재 status가 expected인지 사전 확인. 다르면 409 반환 후 false.
func (h *IntercompanyRequestHandler) statusGuard(w http.ResponseWriter, _ *http.Request, id, expected string) bool {
	data, _, err := h.DB.From("intercompany_requests").
		Select("status", "exact", false).
		Eq("request_id", id).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "매입 요청 상태 확인에 실패했습니다")
		return false
	}
	var rows []struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		response.RespondError(w, http.StatusNotFound, "매입 요청을 찾을 수 없습니다")
		return false
	}
	if rows[0].Status != expected {
		response.RespondError(w, http.StatusConflict, "현재 상태에서는 처리할 수 없습니다 (status="+rows[0].Status+")")
		return false
	}
	return true
}

// enrich — 응답에 product/company 표시명을 보강
func (h *IntercompanyRequestHandler) enrich(rows []model.IntercompanyRequest) {
	if len(rows) == 0 {
		return
	}
	productIDs := make(map[string]struct{})
	companyIDs := make(map[string]struct{})
	for _, r := range rows {
		productIDs[r.ProductID] = struct{}{}
		companyIDs[r.RequesterCompanyID] = struct{}{}
		companyIDs[r.TargetCompanyID] = struct{}{}
	}

	productMap := make(map[string]struct {
		Code string
		Name string
	})
	if len(productIDs) > 0 {
		ids := make([]string, 0, len(productIDs))
		for id := range productIDs {
			ids = append(ids, id)
		}
		data, _, err := h.DB.From("products").
			Select("product_id,product_code,product_name", "exact", false).
			In("product_id", ids).
			Execute()
		if err == nil {
			var prods []struct {
				ProductID   string `json:"product_id"`
				ProductCode string `json:"product_code"`
				ProductName string `json:"product_name"`
			}
			if json.Unmarshal(data, &prods) == nil {
				for _, p := range prods {
					productMap[p.ProductID] = struct {
						Code string
						Name string
					}{p.ProductCode, p.ProductName}
				}
			}
		}
	}

	companyMap := make(map[string]string)
	if len(companyIDs) > 0 {
		ids := make([]string, 0, len(companyIDs))
		for id := range companyIDs {
			ids = append(ids, id)
		}
		data, _, err := h.DB.From("companies").
			Select("company_id,company_name", "exact", false).
			In("company_id", ids).
			Execute()
		if err == nil {
			var comps []struct {
				CompanyID   string `json:"company_id"`
				CompanyName string `json:"company_name"`
			}
			if json.Unmarshal(data, &comps) == nil {
				for _, c := range comps {
					companyMap[c.CompanyID] = c.CompanyName
				}
			}
		}
	}

	for i := range rows {
		if p, ok := productMap[rows[i].ProductID]; ok {
			rows[i].ProductCode = &p.Code
			rows[i].ProductName = &p.Name
		}
		if name, ok := companyMap[rows[i].RequesterCompanyID]; ok {
			rows[i].RequesterName = &name
		}
		if name, ok := companyMap[rows[i].TargetCompanyID]; ok {
			rows[i].TargetName = &name
		}
	}
}
