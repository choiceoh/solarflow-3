package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// LCHandler — LC(신용장) 관련 API를 처리하는 핸들러
// 비유: "LC 서류함" — 각 PO에 연결된 LC 개설/결제 서류를 관리
// Rust LC 계산은 /api/v1/calc/lc-fee, /lc-limit-timeline, /lc-maturity-alert 프록시가 담당한다.
// TODO: Phase 확장(D-030) — 은행 실제 청구액 수동 보정 필드/화면 추가.
type LCHandler struct {
	DB *supa.Client
}

// NewLCHandler — LCHandler 생성자
func NewLCHandler(db *supa.Client) *LCHandler {
	return &LCHandler{DB: db}
}

type lcStatusUpdate struct {
	Status string `json:"status"`
}

// List — GET /api/v1/lcs — LC 목록 조회 (은행/법인/PO 정보 포함)
// 비유: LC 서류함에서 전체 개설 현황을 꺼내 보여주는 것
// TODO: maturity_date 범위 필터 추가 (대시보드 "LC 만기 임박" 알림용)
func (h *LCHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("lc_records").
		Select("*, banks(bank_name), companies(company_name, company_code), purchase_orders(po_number)", "exact", false)

	// 비유: ?po_id=xxx — 특정 PO의 LC만 필터
	if poID := r.URL.Query().Get("po_id"); poID != "" {
		query = query.Eq("po_id", poID)
	}

	// 비유: ?bank_id=xxx — 특정 은행의 LC만 필터
	if bankID := r.URL.Query().Get("bank_id"); bankID != "" {
		query = query.Eq("bank_id", bankID)
	}

	// 비유: ?company_id=xxx — 특정 법인의 LC만 필터
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}

	// 비유: ?status=opened — 특정 상태의 LC만 필터
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[LC 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "LC 목록 조회에 실패했습니다")
		return
	}

	var records []model.LCWithRelations
	if err := json.Unmarshal(data, &records); err != nil {
		log.Printf("[LC 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, records)
}

// GetByID — GET /api/v1/lcs/{id} — LC 상세 조회 (은행 한도/수수료율 포함)
// 비유: LC 서류를 펼쳐서 은행 한도, 수수료율까지 모두 보여주는 것
func (h *LCHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("lc_records").
		Select("*, banks(bank_name, lc_limit_usd, opening_fee_rate, acceptance_fee_rate), companies(company_name, company_code), purchase_orders(po_number, manufacturer_id)", "exact", false).
		Eq("lc_id", id).
		Execute()
	if err != nil {
		log.Printf("[LC 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "LC 조회에 실패했습니다")
		return
	}

	var records []model.LCDetail
	if err := json.Unmarshal(data, &records); err != nil {
		log.Printf("[LC 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(records) == 0 {
		response.RespondError(w, http.StatusNotFound, "LC를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, records[0])
}

// ListLines — GET /api/v1/lcs/{id}/lines — LC 라인아이템 조회
// 비유: LC 서류에 붙은 품목 명세표를 꺼내 보여주는 것
func (h *LCHandler) ListLines(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	lines, err := h.fetchLines(id)
	if err != nil {
		log.Printf("[LC 라인아이템 조회 실패] lc_id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "LC 품목 목록 조회에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, lines)
}

func (h *LCHandler) fetchLines(lcID string) ([]model.LCLineWithProduct, error) {
	data, _, err := h.DB.From("lc_line_items").
		Select("*, products(product_code, product_name, spec_wp, module_width_mm, module_height_mm)", "exact", false).
		Eq("lc_id", lcID).
		Execute()
	if err != nil {
		return nil, err
	}

	var lines []model.LCLineWithProduct
	if err := json.Unmarshal(data, &lines); err != nil {
		return nil, err
	}
	return lines, nil
}

func (h *LCHandler) replaceLines(lcID string, lines []model.CreateLCLineRequest) error {
	_, _, err := h.DB.From("lc_line_items").
		Delete("", "").
		Eq("lc_id", lcID).
		Execute()
	if err != nil {
		return err
	}
	if len(lines) == 0 {
		return nil
	}

	inserts := make([]model.LCLineInsert, 0, len(lines))
	for _, line := range lines {
		if line.ItemType == "" {
			line.ItemType = "main"
		}
		if line.PaymentType == "" {
			line.PaymentType = "paid"
		}
		inserts = append(inserts, model.LCLineInsert{
			LCID:           lcID,
			POLineID:       line.POLineID,
			ProductID:      line.ProductID,
			Quantity:       line.Quantity,
			CapacityKW:     line.CapacityKW,
			AmountUSD:      line.AmountUSD,
			UnitPriceUSDWp: line.UnitPriceUSDWp,
			ItemType:       line.ItemType,
			PaymentType:    line.PaymentType,
			Memo:           line.Memo,
		})
	}

	_, _, err = h.DB.From("lc_line_items").
		Insert(inserts, false, "", "", "").
		Execute()
	return err
}

// Create — POST /api/v1/lcs — LC 등록
// 비유: 새 LC 개설 서류를 작성하여 서류함에 보관하는 것
func (h *LCHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateLCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[LC 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 LC 신청서 필수 항목 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("lc_records").
		Insert(model.NewLCRecordInsert(req), false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[LC 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "LC 등록에 실패했습니다")
		return
	}

	var created []model.LCRecord
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[LC 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "LC 등록 결과를 확인할 수 없습니다")
		return
	}

	if err := h.replaceLines(created[0].LCID, req.LineItems); err != nil {
		log.Printf("[LC 라인아이템 등록 실패] lc_id=%s err=%v", created[0].LCID, err)
		if _, _, cleanupErr := h.DB.From("lc_records").Delete("", "").Eq("lc_id", created[0].LCID).Execute(); cleanupErr != nil {
			log.Printf("[LC 라인아이템 실패 후 본문 정리 실패] lc_id=%s err=%v", created[0].LCID, cleanupErr)
		}
		response.RespondError(w, http.StatusInternalServerError, "LC 품목 저장에 실패했습니다")
		return
	}

	writeAuditLog(h.DB, r, "lc_records", created[0].LCID, "create", nil, auditRawFromValue(created[0]), "")

	// LC 개설 시 연결된 PO 상태 contracted → in_progress 자동 전환
	h.autoSetPOInProgress(created[0].POID, r)

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// autoSetPOInProgress — LC 개설 시 PO 상태를 contracted → in_progress로 자동 전환
// 실패해도 본 요청에 영향 없음 (로그만 남김)
func (h *LCHandler) autoSetPOInProgress(poID string, r *http.Request) {
	poData, _, err := h.DB.From("purchase_orders").
		Select("po_id, status", "exact", false).
		Eq("po_id", poID).
		Execute()
	if err != nil {
		log.Printf("[PO in_progress 전환] 조회 실패 po_id=%s err=%v", poID, err)
		return
	}
	var pos []struct {
		POID   string `json:"po_id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(poData, &pos); err != nil || len(pos) == 0 {
		return
	}
	// contracted 상태일 때만 in_progress로 전환
	if pos[0].Status != "contracted" {
		return
	}
	oldSnapshot, _, oldErr := auditSnapshot(h.DB, "purchase_orders", "po_id", poID)
	if oldErr != nil {
		log.Printf("[PO in_progress 전환] 감사 스냅샷 조회 실패 po_id=%s err=%v", poID, oldErr)
	}
	data, _, uerr := h.DB.From("purchase_orders").
		Update(poStatusUpdate{Status: "in_progress"}, "", "").
		Eq("po_id", poID).
		Execute()
	if uerr != nil {
		log.Printf("[PO in_progress 전환] 업데이트 실패 po_id=%s err=%v", poID, uerr)
		return
	}
	var updated []model.PurchaseOrder
	if json.Unmarshal(data, &updated) == nil && len(updated) > 0 {
		writeAuditLog(h.DB, r, "purchase_orders", poID, "update", oldSnapshot, auditRawFromValue(updated[0]), "lc_create_auto_in_progress")
	}
	log.Printf("[PO in_progress 전환] po_id=%s contracted → in_progress", poID)
}

// Update — PUT /api/v1/lcs/{id} — LC 수정
// 비유: 기존 LC 서류의 내용을 수정하는 것
func (h *LCHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateLCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[LC 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	oldSnapshot, _, oldErr := auditSnapshot(h.DB, "lc_records", "lc_id", id)
	if oldErr != nil {
		log.Printf("[LC 수정 전 감사 스냅샷 조회 실패] id=%s err=%v", id, oldErr)
	}

	data, _, err := h.DB.From("lc_records").
		Update(model.NewLCRecordUpdate(req), "", "").
		Eq("lc_id", id).
		Execute()
	if err != nil {
		log.Printf("[LC 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "LC 수정에 실패했습니다")
		return
	}

	var updated []model.LCRecord
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[LC 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 LC를 찾을 수 없습니다")
		return
	}

	if req.LineItems != nil {
		if err := h.replaceLines(id, req.LineItems); err != nil {
			log.Printf("[LC 라인아이템 수정 실패] lc_id=%s err=%v", id, err)
			response.RespondError(w, http.StatusInternalServerError, "LC 품목 저장에 실패했습니다")
			return
		}
	}

	auditEntityByRouteID(h.DB, r, "lc_records", "lc_id", "update", oldSnapshot, auditRawFromValue(updated[0]), "")
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/lcs/{id} — LC 취소 처리
func (h *LCHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	oldSnapshot, _, oldErr := auditSnapshot(h.DB, "lc_records", "lc_id", id)
	if oldErr != nil {
		log.Printf("[LC 취소 전 감사 스냅샷 조회 실패] id=%s err=%v", id, oldErr)
	}

	data, _, err := h.DB.From("lc_records").
		Update(lcStatusUpdate{Status: "cancelled"}, "", "").
		Eq("lc_id", id).
		Execute()
	if err != nil {
		log.Printf("[LC 취소 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "LC 취소에 실패했습니다")
		return
	}

	var updated []model.LCRecord
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[LC 취소 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "취소할 LC를 찾을 수 없습니다")
		return
	}

	auditEntityByRouteID(h.DB, r, "lc_records", "lc_id", "delete", oldSnapshot, auditRawFromValue(updated[0]), "soft_cancel")
	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "cancelled"})
}
