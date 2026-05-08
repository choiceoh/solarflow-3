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
	"solarflow-backend/internal/tenant"
)

// StudyLearningHandler — study.topworks.ltd 신입 교육 도메인 API.
//
// 비유: 페이지를 만들기 전에 교육 과정의 뼈대(분야, 플랜, 단계)를 먼저 꽂아두는
// 책장 관리자다. 화면은 나중에 붙더라도 DB/API 계약은 여기서 먼저 고정한다.
type StudyLearningHandler struct {
	DB *supa.Client
}

type studyPlanIDRow struct {
	PlanID string `json:"plan_id"`
}

type studyStepLineRow struct {
	LineNo int `json:"line_no"`
}

type studyStatusResponse struct {
	Status string `json:"status"`
}

func NewStudyLearningHandler(db *supa.Client) *StudyLearningHandler {
	return &StudyLearningHandler{DB: db}
}

// ListDomains — GET /api/v1/study/domains?status=active
func (h *StudyLearningHandler) ListDomains(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}

	q := h.DB.From("study_learning_domains").
		Select("*", "exact", false).
		Eq("tenant_scope", scope)
	if status := r.URL.Query().Get("status"); status != "" {
		q = q.Eq("status", status)
	}
	data, _, err := q.
		Order("display_order", &postgrest.OrderOpts{Ascending: true}).
		Order("created_at", &postgrest.OrderOpts{Ascending: true}).
		Limit(500, "").
		Execute()
	if err != nil {
		log.Printf("[study domains 목록 실패] tenant=%s err=%v", scope, err)
		response.RespondError(w, http.StatusInternalServerError, "학습 도메인 목록 조회에 실패했습니다")
		return
	}
	var rows []model.StudyLearningDomain
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[study domains 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// CreateDomain — POST /api/v1/study/domains
func (h *StudyLearningHandler) CreateDomain(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	var req model.CreateStudyLearningDomainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	req.Normalize()
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	createdBy := optionalUserID(r)
	data, _, err := h.DB.From("study_learning_domains").
		Insert(req.Insert(scope, createdBy), false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[study domain 등록 실패] tenant=%s key=%s err=%v", scope, req.DomainKey, err)
		response.RespondError(w, http.StatusInternalServerError, "학습 도메인 등록에 실패했습니다")
		return
	}
	var created []model.StudyLearningDomain
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		log.Printf("[study domain 등록 응답 실패] err=%v", err)
		response.RespondError(w, http.StatusInternalServerError, "학습 도메인 등록 결과를 확인할 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// GetDomain — GET /api/v1/study/domains/{id}
func (h *StudyLearningHandler) GetDomain(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !validUUID(id) {
		response.RespondError(w, http.StatusBadRequest, "학습 도메인 ID가 올바르지 않습니다")
		return
	}
	row, found := h.fetchDomain(w, scope, id)
	if !found {
		return
	}
	response.RespondJSON(w, http.StatusOK, row)
}

// UpdateDomain — PUT/PATCH /api/v1/study/domains/{id}
func (h *StudyLearningHandler) UpdateDomain(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !validUUID(id) {
		response.RespondError(w, http.StatusBadRequest, "학습 도메인 ID가 올바르지 않습니다")
		return
	}
	var req model.UpdateStudyLearningDomainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	req.Normalize()
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	data, _, err := h.DB.From("study_learning_domains").
		Update(req, "", "").
		Eq("tenant_scope", scope).
		Eq("domain_id", id).
		Execute()
	if err != nil {
		log.Printf("[study domain 수정 실패] tenant=%s id=%s err=%v", scope, id, err)
		response.RespondError(w, http.StatusInternalServerError, "학습 도메인 수정에 실패했습니다")
		return
	}
	var updated []model.StudyLearningDomain
	if err := json.Unmarshal(data, &updated); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "학습 도메인을 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// DeleteDomain — DELETE /api/v1/study/domains/{id}
func (h *StudyLearningHandler) DeleteDomain(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !validUUID(id) {
		response.RespondError(w, http.StatusBadRequest, "학습 도메인 ID가 올바르지 않습니다")
		return
	}
	_, _, err := h.DB.From("study_learning_domains").
		Delete("", "").
		Eq("tenant_scope", scope).
		Eq("domain_id", id).
		Execute()
	if err != nil {
		log.Printf("[study domain 삭제 실패] tenant=%s id=%s err=%v", scope, id, err)
		response.RespondError(w, http.StatusInternalServerError, "학습 도메인 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, studyStatusResponse{Status: "deleted"})
}

// ListPlans — GET /api/v1/study/plans?status=active
func (h *StudyLearningHandler) ListPlans(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	q := h.DB.From("study_learning_plans").
		Select("*", "exact", false).
		Eq("tenant_scope", scope)
	if status := r.URL.Query().Get("status"); status != "" {
		q = q.Eq("status", status)
	}
	data, _, err := q.
		Order("created_at", &postgrest.OrderOpts{Ascending: false}).
		Limit(200, "").
		Execute()
	if err != nil {
		log.Printf("[study plans 목록 실패] tenant=%s err=%v", scope, err)
		response.RespondError(w, http.StatusInternalServerError, "학습 플랜 목록 조회에 실패했습니다")
		return
	}
	var rows []model.StudyLearningPlan
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// CreatePlan — POST /api/v1/study/plans
func (h *StudyLearningHandler) CreatePlan(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	var req model.CreateStudyLearningPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	req.Normalize()
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	createdBy := optionalUserID(r)
	data, _, err := h.DB.From("study_learning_plans").
		Insert(req.Insert(scope, createdBy), false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[study plan 등록 실패] tenant=%s key=%s err=%v", scope, req.PlanKey, err)
		response.RespondError(w, http.StatusInternalServerError, "학습 플랜 등록에 실패했습니다")
		return
	}
	var created []model.StudyLearningPlan
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "학습 플랜 등록 결과를 확인할 수 없습니다")
		return
	}
	planID := created[0].PlanID
	if len(req.Steps) > 0 {
		stepRows := make([]model.StudyLearningPlanStepInsert, 0, len(req.Steps))
		for _, step := range req.Steps {
			stepRows = append(stepRows, step.Insert(planID))
		}
		if _, _, stepErr := h.DB.From("study_learning_plan_steps").
			Insert(stepRows, false, "", "", "").
			Execute(); stepErr != nil {
			h.cleanupPlan(planID)
			log.Printf("[study plan 단계 등록 실패] tenant=%s plan=%s err=%v", scope, planID, stepErr)
			response.RespondError(w, http.StatusInternalServerError, "학습 플랜 단계 등록에 실패했습니다")
			return
		}
	}
	combined, found := h.fetchPlanWithSteps(w, scope, planID)
	if !found {
		return
	}
	response.RespondJSON(w, http.StatusCreated, combined)
}

// GetPlan — GET /api/v1/study/plans/{id}
func (h *StudyLearningHandler) GetPlan(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !validUUID(id) {
		response.RespondError(w, http.StatusBadRequest, "학습 플랜 ID가 올바르지 않습니다")
		return
	}
	combined, found := h.fetchPlanWithSteps(w, scope, id)
	if !found {
		return
	}
	response.RespondJSON(w, http.StatusOK, combined)
}

// UpdatePlan — PUT/PATCH /api/v1/study/plans/{id}
func (h *StudyLearningHandler) UpdatePlan(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !validUUID(id) {
		response.RespondError(w, http.StatusBadRequest, "학습 플랜 ID가 올바르지 않습니다")
		return
	}
	var req model.UpdateStudyLearningPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	req.Normalize()
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	data, _, err := h.DB.From("study_learning_plans").
		Update(req, "", "").
		Eq("tenant_scope", scope).
		Eq("plan_id", id).
		Execute()
	if err != nil {
		log.Printf("[study plan 수정 실패] tenant=%s id=%s err=%v", scope, id, err)
		response.RespondError(w, http.StatusInternalServerError, "학습 플랜 수정에 실패했습니다")
		return
	}
	var updated []model.StudyLearningPlan
	if err := json.Unmarshal(data, &updated); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "학습 플랜을 찾을 수 없습니다")
		return
	}
	combined, found := h.fetchPlanWithSteps(w, scope, id)
	if !found {
		return
	}
	response.RespondJSON(w, http.StatusOK, combined)
}

// DeletePlan — DELETE /api/v1/study/plans/{id}
func (h *StudyLearningHandler) DeletePlan(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !validUUID(id) {
		response.RespondError(w, http.StatusBadRequest, "학습 플랜 ID가 올바르지 않습니다")
		return
	}
	_, _, err := h.DB.From("study_learning_plans").
		Delete("", "").
		Eq("tenant_scope", scope).
		Eq("plan_id", id).
		Execute()
	if err != nil {
		log.Printf("[study plan 삭제 실패] tenant=%s id=%s err=%v", scope, id, err)
		response.RespondError(w, http.StatusInternalServerError, "학습 플랜 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, studyStatusResponse{Status: "deleted"})
}

// CreateStep — POST /api/v1/study/plans/{id}/steps
func (h *StudyLearningHandler) CreateStep(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	planID := chi.URLParam(r, "id")
	if !validUUID(planID) {
		response.RespondError(w, http.StatusBadRequest, "학습 플랜 ID가 올바르지 않습니다")
		return
	}
	if !h.planExists(w, scope, planID) {
		return
	}
	var req model.CreateStudyLearningPlanStepRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	req.Normalize()
	if req.LineNo == 0 {
		lineNo, err := h.nextStepLineNo(planID)
		if err != nil {
			response.RespondError(w, http.StatusInternalServerError, "다음 단계 번호 계산에 실패했습니다")
			return
		}
		req.LineNo = lineNo
	}
	if msg := req.Validate("step"); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	data, _, err := h.DB.From("study_learning_plan_steps").
		Insert(req.Insert(planID), false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[study step 등록 실패] plan=%s err=%v", planID, err)
		response.RespondError(w, http.StatusInternalServerError, "학습 단계 등록에 실패했습니다")
		return
	}
	var created []model.StudyLearningPlanStep
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "학습 단계 등록 결과를 확인할 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// UpdateStep — PUT/PATCH /api/v1/study/plans/{id}/steps/{step_id}
func (h *StudyLearningHandler) UpdateStep(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	planID := chi.URLParam(r, "id")
	stepID := chi.URLParam(r, "step_id")
	if !validUUID(planID) || !validUUID(stepID) {
		response.RespondError(w, http.StatusBadRequest, "학습 플랜 또는 단계 ID가 올바르지 않습니다")
		return
	}
	if !h.planExists(w, scope, planID) {
		return
	}
	var req model.UpdateStudyLearningPlanStepRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	req.Normalize()
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	data, _, err := h.DB.From("study_learning_plan_steps").
		Update(req, "", "").
		Eq("plan_id", planID).
		Eq("step_id", stepID).
		Execute()
	if err != nil {
		log.Printf("[study step 수정 실패] plan=%s step=%s err=%v", planID, stepID, err)
		response.RespondError(w, http.StatusInternalServerError, "학습 단계 수정에 실패했습니다")
		return
	}
	var updated []model.StudyLearningPlanStep
	if err := json.Unmarshal(data, &updated); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "학습 단계를 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// DeleteStep — DELETE /api/v1/study/plans/{id}/steps/{step_id}
func (h *StudyLearningHandler) DeleteStep(w http.ResponseWriter, r *http.Request) {
	scope, ok := requireStudyScope(w, r)
	if !ok {
		return
	}
	planID := chi.URLParam(r, "id")
	stepID := chi.URLParam(r, "step_id")
	if !validUUID(planID) || !validUUID(stepID) {
		response.RespondError(w, http.StatusBadRequest, "학습 플랜 또는 단계 ID가 올바르지 않습니다")
		return
	}
	if !h.planExists(w, scope, planID) {
		return
	}
	_, _, err := h.DB.From("study_learning_plan_steps").
		Delete("", "").
		Eq("plan_id", planID).
		Eq("step_id", stepID).
		Execute()
	if err != nil {
		log.Printf("[study step 삭제 실패] plan=%s step=%s err=%v", planID, stepID, err)
		response.RespondError(w, http.StatusInternalServerError, "학습 단계 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, studyStatusResponse{Status: "deleted"})
}

func (h *StudyLearningHandler) fetchDomain(w http.ResponseWriter, scope, id string) (model.StudyLearningDomain, bool) {
	data, _, err := h.DB.From("study_learning_domains").
		Select("*", "exact", false).
		Eq("tenant_scope", scope).
		Eq("domain_id", id).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "학습 도메인 조회에 실패했습니다")
		return model.StudyLearningDomain{}, false
	}
	var rows []model.StudyLearningDomain
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return model.StudyLearningDomain{}, false
	}
	if len(rows) == 0 {
		response.RespondError(w, http.StatusNotFound, "학습 도메인을 찾을 수 없습니다")
		return model.StudyLearningDomain{}, false
	}
	return rows[0], true
}

func (h *StudyLearningHandler) fetchPlanWithSteps(w http.ResponseWriter, scope, id string) (model.StudyLearningPlanWithSteps, bool) {
	data, _, err := h.DB.From("study_learning_plans").
		Select("*", "exact", false).
		Eq("tenant_scope", scope).
		Eq("plan_id", id).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "학습 플랜 조회에 실패했습니다")
		return model.StudyLearningPlanWithSteps{}, false
	}
	var plans []model.StudyLearningPlan
	if err := json.Unmarshal(data, &plans); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return model.StudyLearningPlanWithSteps{}, false
	}
	if len(plans) == 0 {
		response.RespondError(w, http.StatusNotFound, "학습 플랜을 찾을 수 없습니다")
		return model.StudyLearningPlanWithSteps{}, false
	}
	stepData, _, err := h.DB.From("study_learning_plan_steps").
		Select("*", "exact", false).
		Eq("plan_id", id).
		Order("line_no", &postgrest.OrderOpts{Ascending: true}).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "학습 단계 조회에 실패했습니다")
		return model.StudyLearningPlanWithSteps{}, false
	}
	var steps []model.StudyLearningPlanStep
	if err := json.Unmarshal(stepData, &steps); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "학습 단계 응답 처리에 실패했습니다")
		return model.StudyLearningPlanWithSteps{}, false
	}
	if steps == nil {
		steps = []model.StudyLearningPlanStep{}
	}
	return model.StudyLearningPlanWithSteps{StudyLearningPlan: plans[0], Steps: steps}, true
}

func (h *StudyLearningHandler) planExists(w http.ResponseWriter, scope, planID string) bool {
	data, _, err := h.DB.From("study_learning_plans").
		Select("plan_id", "exact", false).
		Eq("tenant_scope", scope).
		Eq("plan_id", planID).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "학습 플랜 조회에 실패했습니다")
		return false
	}
	var rows []studyPlanIDRow
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return false
	}
	if len(rows) == 0 {
		response.RespondError(w, http.StatusNotFound, "학습 플랜을 찾을 수 없습니다")
		return false
	}
	return true
}

func (h *StudyLearningHandler) nextStepLineNo(planID string) (int, error) {
	data, _, err := h.DB.From("study_learning_plan_steps").
		Select("line_no", "exact", false).
		Eq("plan_id", planID).
		Order("line_no", &postgrest.OrderOpts{Ascending: false}).
		Limit(1, "").
		Execute()
	if err != nil {
		return 0, err
	}
	var rows []studyStepLineRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 1, nil
	}
	return rows[0].LineNo + 1, nil
}

func (h *StudyLearningHandler) cleanupPlan(planID string) {
	if _, _, err := h.DB.From("study_learning_plans").
		Delete("", "").
		Eq("plan_id", planID).
		Execute(); err != nil {
		log.Printf("[study plan cleanup 실패] plan=%s err=%v", planID, err)
	}
}

func requireStudyScope(w http.ResponseWriter, r *http.Request) (string, bool) {
	scope := middleware.GetTenantScope(r.Context())
	if scope != string(tenant.IDStudy) {
		response.RespondError(w, http.StatusForbidden, "학습 도메인은 study 테넌트에서만 사용할 수 있습니다")
		return "", false
	}
	return scope, true
}

func optionalUserID(r *http.Request) *string {
	uid := middleware.GetUserID(r.Context())
	if uid == "" {
		return nil
	}
	return &uid
}
