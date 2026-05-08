package model

import (
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	StudyKeyMaxRunes            = 60
	StudyTitleMaxRunes          = 140
	StudySummaryMaxRunes        = 1000
	StudyObjectiveMaxRunes      = 1600
	StudyDescriptionMaxRunes    = 2400
	StudyAudienceMaxRunes       = 120
	StudyOwnerRoleMaxRunes      = 80
	StudyResourceURLMaxRunes    = 500
	StudyPlanMaxDurationDays    = 365
	StudyStepMaxExpectedMinutes = 1440
)

var (
	validStudyDomainStatuses = map[string]bool{
		"draft": true, "active": true, "archived": true,
	}
	validStudyPlanStatuses = map[string]bool{
		"draft": true, "active": true, "retired": true,
	}
	validStudyAssessmentKinds = map[string]bool{
		"none": true, "quiz": true, "checklist": true, "submission": true, "manager_review": true,
	}
)

// StudyLearningDomain — 신입 교육을 나누는 큰 학습 분야.
//
// 비유: 커리큘럼 책장의 칸. "회사 기본", "SolarFlow 운영", "수입/통관", "영업"처럼
// 플랜 step 이 어느 분야에 속하는지 묶어 준다.
type StudyLearningDomain struct {
	DomainID     string     `json:"domain_id"`
	TenantScope  string     `json:"tenant_scope"`
	DomainKey    string     `json:"domain_key"`
	Title        string     `json:"title"`
	Summary      string     `json:"summary"`
	OwnerRole    string     `json:"owner_role"`
	DisplayOrder int        `json:"display_order"`
	Status       string     `json:"status"`
	CreatedBy    *string    `json:"created_by,omitempty"`
	CreatedAt    *time.Time `json:"created_at,omitempty"`
	UpdatedAt    *time.Time `json:"updated_at,omitempty"`
}

type CreateStudyLearningDomainRequest struct {
	DomainKey    string `json:"domain_key"`
	Title        string `json:"title"`
	Summary      string `json:"summary"`
	OwnerRole    string `json:"owner_role"`
	DisplayOrder int    `json:"display_order"`
	Status       string `json:"status"`
}

type UpdateStudyLearningDomainRequest struct {
	DomainKey    *string `json:"domain_key,omitempty"`
	Title        *string `json:"title,omitempty"`
	Summary      *string `json:"summary,omitempty"`
	OwnerRole    *string `json:"owner_role,omitempty"`
	DisplayOrder *int    `json:"display_order,omitempty"`
	Status       *string `json:"status,omitempty"`
}

type StudyLearningDomainInsert struct {
	TenantScope  string  `json:"tenant_scope"`
	DomainKey    string  `json:"domain_key"`
	Title        string  `json:"title"`
	Summary      string  `json:"summary"`
	OwnerRole    string  `json:"owner_role"`
	DisplayOrder int     `json:"display_order"`
	Status       string  `json:"status"`
	CreatedBy    *string `json:"created_by,omitempty"`
}

func (req *CreateStudyLearningDomainRequest) Normalize() {
	req.DomainKey = normalizeStudyKey(req.DomainKey)
	req.Title = strings.TrimSpace(req.Title)
	req.Summary = strings.TrimSpace(req.Summary)
	req.OwnerRole = strings.TrimSpace(req.OwnerRole)
	req.Status = strings.TrimSpace(req.Status)
	if req.OwnerRole == "" {
		req.OwnerRole = "교육담당"
	}
	if req.Status == "" {
		req.Status = "draft"
	}
}

func (req *CreateStudyLearningDomainRequest) Validate() string {
	if msg := validateStudyKey("domain_key", req.DomainKey); msg != "" {
		return msg
	}
	if msg := validateRequiredText("title", req.Title, StudyTitleMaxRunes); msg != "" {
		return msg
	}
	if utf8.RuneCountInString(req.Summary) > StudySummaryMaxRunes {
		return "summary는 1000자를 초과할 수 없습니다"
	}
	if msg := validateRequiredText("owner_role", req.OwnerRole, StudyOwnerRoleMaxRunes); msg != "" {
		return msg
	}
	if req.DisplayOrder < 0 {
		return "display_order는 0 이상이어야 합니다"
	}
	if !validStudyDomainStatuses[req.Status] {
		return "status는 draft/active/archived 중 하나여야 합니다"
	}
	return ""
}

func (req CreateStudyLearningDomainRequest) Insert(tenantScope string, createdBy *string) StudyLearningDomainInsert {
	return StudyLearningDomainInsert{
		TenantScope:  tenantScope,
		DomainKey:    req.DomainKey,
		Title:        req.Title,
		Summary:      req.Summary,
		OwnerRole:    req.OwnerRole,
		DisplayOrder: req.DisplayOrder,
		Status:       req.Status,
		CreatedBy:    createdBy,
	}
}

func (req *UpdateStudyLearningDomainRequest) Normalize() {
	normalizeStringPtr(req.DomainKey, normalizeStudyKey)
	normalizeStringPtr(req.Title, strings.TrimSpace)
	normalizeStringPtr(req.Summary, strings.TrimSpace)
	normalizeStringPtr(req.OwnerRole, strings.TrimSpace)
	normalizeStringPtr(req.Status, strings.TrimSpace)
}

func (req *UpdateStudyLearningDomainRequest) Validate() string {
	if req.DomainKey == nil && req.Title == nil && req.Summary == nil &&
		req.OwnerRole == nil && req.DisplayOrder == nil && req.Status == nil {
		return "수정할 항목이 없습니다"
	}
	if req.DomainKey != nil {
		if msg := validateStudyKey("domain_key", *req.DomainKey); msg != "" {
			return msg
		}
	}
	if req.Title != nil {
		if msg := validateRequiredText("title", *req.Title, StudyTitleMaxRunes); msg != "" {
			return msg
		}
	}
	if req.Summary != nil && utf8.RuneCountInString(*req.Summary) > StudySummaryMaxRunes {
		return "summary는 1000자를 초과할 수 없습니다"
	}
	if req.OwnerRole != nil {
		if msg := validateRequiredText("owner_role", *req.OwnerRole, StudyOwnerRoleMaxRunes); msg != "" {
			return msg
		}
	}
	if req.DisplayOrder != nil && *req.DisplayOrder < 0 {
		return "display_order는 0 이상이어야 합니다"
	}
	if req.Status != nil && !validStudyDomainStatuses[*req.Status] {
		return "status는 draft/active/archived 중 하나여야 합니다"
	}
	return ""
}

// StudyLearningPlan — 신입/직무별 교육 플랜 헤더.
type StudyLearningPlan struct {
	PlanID       string     `json:"plan_id"`
	TenantScope  string     `json:"tenant_scope"`
	PlanKey      string     `json:"plan_key"`
	Title        string     `json:"title"`
	Audience     string     `json:"audience"`
	Objective    string     `json:"objective"`
	DurationDays int        `json:"duration_days"`
	Status       string     `json:"status"`
	CreatedBy    *string    `json:"created_by,omitempty"`
	CreatedAt    *time.Time `json:"created_at,omitempty"`
	UpdatedAt    *time.Time `json:"updated_at,omitempty"`
}

type StudyLearningPlanStep struct {
	StepID          string     `json:"step_id"`
	PlanID          string     `json:"plan_id"`
	DomainID        *string    `json:"domain_id,omitempty"`
	LineNo          int        `json:"line_no"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	ExpectedMinutes int        `json:"expected_minutes"`
	Required        bool       `json:"required"`
	AssessmentKind  string     `json:"assessment_kind"`
	ResourceURL     *string    `json:"resource_url,omitempty"`
	CreatedAt       *time.Time `json:"created_at,omitempty"`
	UpdatedAt       *time.Time `json:"updated_at,omitempty"`
}

type StudyLearningPlanWithSteps struct {
	StudyLearningPlan
	Steps []StudyLearningPlanStep `json:"steps"`
}

type CreateStudyLearningPlanRequest struct {
	PlanKey      string                               `json:"plan_key"`
	Title        string                               `json:"title"`
	Audience     string                               `json:"audience"`
	Objective    string                               `json:"objective"`
	DurationDays int                                  `json:"duration_days"`
	Status       string                               `json:"status"`
	Steps        []CreateStudyLearningPlanStepRequest `json:"steps"`
}

type UpdateStudyLearningPlanRequest struct {
	PlanKey      *string `json:"plan_key,omitempty"`
	Title        *string `json:"title,omitempty"`
	Audience     *string `json:"audience,omitempty"`
	Objective    *string `json:"objective,omitempty"`
	DurationDays *int    `json:"duration_days,omitempty"`
	Status       *string `json:"status,omitempty"`
}

type CreateStudyLearningPlanStepRequest struct {
	DomainID        *string `json:"domain_id,omitempty"`
	LineNo          int     `json:"line_no"`
	Title           string  `json:"title"`
	Description     string  `json:"description"`
	ExpectedMinutes int     `json:"expected_minutes"`
	Required        *bool   `json:"required,omitempty"`
	AssessmentKind  string  `json:"assessment_kind"`
	ResourceURL     *string `json:"resource_url,omitempty"`
}

type UpdateStudyLearningPlanStepRequest struct {
	DomainID        *string `json:"domain_id,omitempty"`
	LineNo          *int    `json:"line_no,omitempty"`
	Title           *string `json:"title,omitempty"`
	Description     *string `json:"description,omitempty"`
	ExpectedMinutes *int    `json:"expected_minutes,omitempty"`
	Required        *bool   `json:"required,omitempty"`
	AssessmentKind  *string `json:"assessment_kind,omitempty"`
	ResourceURL     *string `json:"resource_url,omitempty"`
}

type StudyLearningPlanInsert struct {
	TenantScope  string  `json:"tenant_scope"`
	PlanKey      string  `json:"plan_key"`
	Title        string  `json:"title"`
	Audience     string  `json:"audience"`
	Objective    string  `json:"objective"`
	DurationDays int     `json:"duration_days"`
	Status       string  `json:"status"`
	CreatedBy    *string `json:"created_by,omitempty"`
}

type StudyLearningPlanStepInsert struct {
	PlanID          string  `json:"plan_id"`
	DomainID        *string `json:"domain_id,omitempty"`
	LineNo          int     `json:"line_no"`
	Title           string  `json:"title"`
	Description     string  `json:"description"`
	ExpectedMinutes int     `json:"expected_minutes"`
	Required        bool    `json:"required"`
	AssessmentKind  string  `json:"assessment_kind"`
	ResourceURL     *string `json:"resource_url,omitempty"`
}

func (req *CreateStudyLearningPlanRequest) Normalize() {
	req.PlanKey = normalizeStudyKey(req.PlanKey)
	req.Title = strings.TrimSpace(req.Title)
	req.Audience = strings.TrimSpace(req.Audience)
	req.Objective = strings.TrimSpace(req.Objective)
	req.Status = strings.TrimSpace(req.Status)
	if req.Status == "" {
		req.Status = "draft"
	}
	for i := range req.Steps {
		req.Steps[i].Normalize()
		if req.Steps[i].LineNo == 0 {
			req.Steps[i].LineNo = i + 1
		}
	}
}

func (req *CreateStudyLearningPlanRequest) Validate() string {
	if msg := validateStudyKey("plan_key", req.PlanKey); msg != "" {
		return msg
	}
	if msg := validateRequiredText("title", req.Title, StudyTitleMaxRunes); msg != "" {
		return msg
	}
	if msg := validateRequiredText("audience", req.Audience, StudyAudienceMaxRunes); msg != "" {
		return msg
	}
	if msg := validateRequiredText("objective", req.Objective, StudyObjectiveMaxRunes); msg != "" {
		return msg
	}
	if req.DurationDays <= 0 || req.DurationDays > StudyPlanMaxDurationDays {
		return "duration_days는 1 이상 365 이하이어야 합니다"
	}
	if !validStudyPlanStatuses[req.Status] {
		return "status는 draft/active/retired 중 하나여야 합니다"
	}
	seenLineNo := map[int]bool{}
	for i := range req.Steps {
		if msg := req.Steps[i].Validate("steps[" + strconv.Itoa(i) + "]"); msg != "" {
			return msg
		}
		if seenLineNo[req.Steps[i].LineNo] {
			return "steps[" + strconv.Itoa(i) + "].line_no가 중복되었습니다"
		}
		seenLineNo[req.Steps[i].LineNo] = true
	}
	return ""
}

func (req CreateStudyLearningPlanRequest) Insert(tenantScope string, createdBy *string) StudyLearningPlanInsert {
	return StudyLearningPlanInsert{
		TenantScope:  tenantScope,
		PlanKey:      req.PlanKey,
		Title:        req.Title,
		Audience:     req.Audience,
		Objective:    req.Objective,
		DurationDays: req.DurationDays,
		Status:       req.Status,
		CreatedBy:    createdBy,
	}
}

func (req *UpdateStudyLearningPlanRequest) Normalize() {
	normalizeStringPtr(req.PlanKey, normalizeStudyKey)
	normalizeStringPtr(req.Title, strings.TrimSpace)
	normalizeStringPtr(req.Audience, strings.TrimSpace)
	normalizeStringPtr(req.Objective, strings.TrimSpace)
	normalizeStringPtr(req.Status, strings.TrimSpace)
}

func (req *UpdateStudyLearningPlanRequest) Validate() string {
	if req.PlanKey == nil && req.Title == nil && req.Audience == nil &&
		req.Objective == nil && req.DurationDays == nil && req.Status == nil {
		return "수정할 항목이 없습니다"
	}
	if req.PlanKey != nil {
		if msg := validateStudyKey("plan_key", *req.PlanKey); msg != "" {
			return msg
		}
	}
	if req.Title != nil {
		if msg := validateRequiredText("title", *req.Title, StudyTitleMaxRunes); msg != "" {
			return msg
		}
	}
	if req.Audience != nil {
		if msg := validateRequiredText("audience", *req.Audience, StudyAudienceMaxRunes); msg != "" {
			return msg
		}
	}
	if req.Objective != nil {
		if msg := validateRequiredText("objective", *req.Objective, StudyObjectiveMaxRunes); msg != "" {
			return msg
		}
	}
	if req.DurationDays != nil && (*req.DurationDays <= 0 || *req.DurationDays > StudyPlanMaxDurationDays) {
		return "duration_days는 1 이상 365 이하이어야 합니다"
	}
	if req.Status != nil && !validStudyPlanStatuses[*req.Status] {
		return "status는 draft/active/retired 중 하나여야 합니다"
	}
	return ""
}

func (req *CreateStudyLearningPlanStepRequest) Normalize() {
	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	req.AssessmentKind = strings.TrimSpace(req.AssessmentKind)
	if req.AssessmentKind == "" {
		req.AssessmentKind = "none"
	}
	normalizeNullableStringPtr(&req.DomainID)
	normalizeNullableStringPtr(&req.ResourceURL)
}

func (req *CreateStudyLearningPlanStepRequest) Validate(prefix string) string {
	if req.LineNo <= 0 {
		return prefix + ".line_no는 1 이상이어야 합니다"
	}
	if msg := validateOptionalUUID(prefix+".domain_id", req.DomainID); msg != "" {
		return msg
	}
	if msg := validateRequiredText(prefix+".title", req.Title, StudyTitleMaxRunes); msg != "" {
		return msg
	}
	if msg := validateRequiredText(prefix+".description", req.Description, StudyDescriptionMaxRunes); msg != "" {
		return msg
	}
	if req.ExpectedMinutes <= 0 || req.ExpectedMinutes > StudyStepMaxExpectedMinutes {
		return prefix + ".expected_minutes는 1 이상 1440 이하이어야 합니다"
	}
	if !validStudyAssessmentKinds[req.AssessmentKind] {
		return prefix + ".assessment_kind는 none/quiz/checklist/submission/manager_review 중 하나여야 합니다"
	}
	if msg := validateResourceURL(prefix+".resource_url", req.ResourceURL); msg != "" {
		return msg
	}
	return ""
}

func (req CreateStudyLearningPlanStepRequest) Insert(planID string) StudyLearningPlanStepInsert {
	required := true
	if req.Required != nil {
		required = *req.Required
	}
	return StudyLearningPlanStepInsert{
		PlanID:          planID,
		DomainID:        req.DomainID,
		LineNo:          req.LineNo,
		Title:           req.Title,
		Description:     req.Description,
		ExpectedMinutes: req.ExpectedMinutes,
		Required:        required,
		AssessmentKind:  req.AssessmentKind,
		ResourceURL:     req.ResourceURL,
	}
}

func (req *UpdateStudyLearningPlanStepRequest) Normalize() {
	normalizeNullableStringPtr(&req.DomainID)
	normalizeStringPtr(req.Title, strings.TrimSpace)
	normalizeStringPtr(req.Description, strings.TrimSpace)
	normalizeStringPtr(req.AssessmentKind, strings.TrimSpace)
	normalizeNullableStringPtr(&req.ResourceURL)
}

func (req *UpdateStudyLearningPlanStepRequest) Validate() string {
	if req.DomainID == nil && req.LineNo == nil && req.Title == nil && req.Description == nil &&
		req.ExpectedMinutes == nil && req.Required == nil && req.AssessmentKind == nil && req.ResourceURL == nil {
		return "수정할 항목이 없습니다"
	}
	if msg := validateOptionalUUID("domain_id", req.DomainID); msg != "" {
		return msg
	}
	if req.LineNo != nil && *req.LineNo <= 0 {
		return "line_no는 1 이상이어야 합니다"
	}
	if req.Title != nil {
		if msg := validateRequiredText("title", *req.Title, StudyTitleMaxRunes); msg != "" {
			return msg
		}
	}
	if req.Description != nil {
		if msg := validateRequiredText("description", *req.Description, StudyDescriptionMaxRunes); msg != "" {
			return msg
		}
	}
	if req.ExpectedMinutes != nil && (*req.ExpectedMinutes <= 0 || *req.ExpectedMinutes > StudyStepMaxExpectedMinutes) {
		return "expected_minutes는 1 이상 1440 이하이어야 합니다"
	}
	if req.AssessmentKind != nil && !validStudyAssessmentKinds[*req.AssessmentKind] {
		return "assessment_kind는 none/quiz/checklist/submission/manager_review 중 하나여야 합니다"
	}
	if msg := validateResourceURL("resource_url", req.ResourceURL); msg != "" {
		return msg
	}
	return ""
}

func normalizeStudyKey(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func normalizeStringPtr(ptr *string, fn func(string) string) {
	if ptr == nil {
		return
	}
	*ptr = fn(*ptr)
}

func normalizeNullableStringPtr(ptr **string) {
	if ptr == nil || *ptr == nil {
		return
	}
	trimmed := strings.TrimSpace(**ptr)
	if trimmed == "" {
		*ptr = nil
		return
	}
	*ptr = &trimmed
}

func validateRequiredText(field, value string, maxRunes int) string {
	if strings.TrimSpace(value) == "" {
		return field + "은 필수 항목입니다"
	}
	if utf8.RuneCountInString(value) > maxRunes {
		return field + "은 " + strconv.Itoa(maxRunes) + "자를 초과할 수 없습니다"
	}
	return ""
}

func validateStudyKey(field, value string) string {
	if value == "" {
		return field + "는 필수 항목입니다"
	}
	if utf8.RuneCountInString(value) > StudyKeyMaxRunes {
		return field + "는 60자를 초과할 수 없습니다"
	}
	for i, r := range value {
		if r >= 'a' && r <= 'z' {
			continue
		}
		if r >= '0' && r <= '9' {
			continue
		}
		if r == '_' || r == '-' {
			if i == 0 {
				return field + "는 영문 소문자 또는 숫자로 시작해야 합니다"
			}
			continue
		}
		return field + "는 영문 소문자, 숫자, _, - 만 사용할 수 있습니다"
	}
	return ""
}

func validateOptionalUUID(field string, value *string) string {
	if value == nil || *value == "" {
		return ""
	}
	if _, err := uuid.Parse(*value); err != nil {
		return field + "는 UUID 형식이어야 합니다"
	}
	return ""
}

func validateResourceURL(field string, value *string) string {
	if value == nil || *value == "" {
		return ""
	}
	if utf8.RuneCountInString(*value) > StudyResourceURLMaxRunes {
		return field + "은 500자를 초과할 수 없습니다"
	}
	if strings.HasPrefix(*value, "https://") || strings.HasPrefix(*value, "http://") || strings.HasPrefix(*value, "/") {
		return ""
	}
	return field + "은 http(s) URL 또는 내부 경로(/...)만 허용합니다"
}
