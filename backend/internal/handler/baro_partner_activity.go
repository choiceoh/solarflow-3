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

// PartnerActivityHandler — 거래처 활동 로그(통화/방문/메일/메모) API
// 비유: 영업의 "고객 접촉 일지" 보관함 + "내 미처리 문의" 트레이
type PartnerActivityHandler struct {
	DB *supa.Client
}

func NewPartnerActivityHandler(db *supa.Client) *PartnerActivityHandler {
	return &PartnerActivityHandler{DB: db}
}

// ListByPartner — GET /api/v1/partners/{id}/activities
// 거래처 상세 타임라인 (최신순)
func (h *PartnerActivityHandler) ListByPartner(w http.ResponseWriter, r *http.Request) {
	partnerID := chi.URLParam(r, "id")
	data, _, err := h.DB.From("partner_activities").
		Select("*", "exact", false).
		Eq("partner_id", partnerID).
		Order("created_at", &postgrest.OrderOpts{Ascending: false}).
		Execute()
	if err != nil {
		log.Printf("[활동 목록 조회 실패] partner=%s, err=%v", partnerID, err)
		response.RespondError(w, http.StatusInternalServerError, "활동 목록 조회에 실패했습니다")
		return
	}
	var rows []model.PartnerActivity
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[활동 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// Create — POST /api/v1/partner-activities
// 활동 등록 (작성자 = 현재 인증된 사용자)
func (h *PartnerActivityHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreatePartnerActivityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	insert := map[string]any{
		"partner_id":         req.PartnerID,
		"author_user_id":     userID,
		"kind":               req.Kind,
		"body":               req.Body,
		"follow_up_required": req.FollowUpRequired,
		"follow_up_done":     false,
	}
	if req.FollowUpRequired && req.FollowUpDue != nil {
		insert["follow_up_due"] = *req.FollowUpDue
	}

	data, _, err := h.DB.From("partner_activities").
		Insert(insert, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[활동 등록 실패] partner=%s, err=%v", req.PartnerID, err)
		response.RespondError(w, http.StatusInternalServerError, "활동 등록에 실패했습니다")
		return
	}
	var created []model.PartnerActivity
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		log.Printf("[활동 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// ToggleFollowup — PATCH /api/v1/partner-activities/{id}/followup
// 후속 완료 토글 (done=true → 완료 처리, done=false → 다시 미처리로)
func (h *PartnerActivityHandler) ToggleFollowup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.CompleteFollowupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	userID := middleware.GetUserID(r.Context())
	update := map[string]any{
		"follow_up_done": req.Done,
	}
	if req.Done {
		update["follow_up_done_at"] = time.Now().UTC().Format(time.RFC3339)
		update["follow_up_done_by"] = userID
	} else {
		update["follow_up_done_at"] = nil
		update["follow_up_done_by"] = nil
	}
	_, _, err := h.DB.From("partner_activities").
		Update(update, "", "").Eq("activity_id", id).Execute()
	if err != nil {
		log.Printf("[후속 토글 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "후속 상태 변경에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// MyOpenFollowups — GET /api/v1/me/open-followups
// 내가 작성한 후속 중 아직 완료되지 않은 항목 (마감일 빠른 순, 마감일 없는 건 뒤로)
func (h *PartnerActivityHandler) MyOpenFollowups(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}
	data, _, err := h.DB.From("partner_activities").
		Select("*,partner:partners(partner_id,partner_name)", "exact", false).
		Eq("author_user_id", userID).
		Eq("follow_up_required", "true").
		Eq("follow_up_done", "false").
		Order("follow_up_due", &postgrest.OrderOpts{Ascending: true, NullsFirst: false}).
		Execute()
	if err != nil {
		log.Printf("[내 미처리 조회 실패] user=%s, err=%v", userID, err)
		response.RespondError(w, http.StatusInternalServerError, "미처리 문의 조회에 실패했습니다")
		return
	}
	// PostgREST 임베드 결과는 Go 모델로 굳이 변환하지 않고 그대로 패스스루
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
