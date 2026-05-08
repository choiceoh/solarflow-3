package model

import "testing"

func TestCreateStudyLearningPlanRequest_NormalizeAndValidate(t *testing.T) {
	req := CreateStudyLearningPlanRequest{
		PlanKey:      " New_Employee_10_Day ",
		Title:        " 신입 온보딩 ",
		Audience:     " 신규 입사자 ",
		Objective:    " 업무 흐름을 설명할 수 있다 ",
		DurationDays: 10,
		Steps: []CreateStudyLearningPlanStepRequest{
			{
				Title:           " 회사 기본 ",
				Description:     " 계정과 보안을 점검한다 ",
				ExpectedMinutes: 30,
			},
		},
	}
	req.Normalize()

	if req.PlanKey != "new_employee_10_day" {
		t.Fatalf("plan_key normalize 실패: %q", req.PlanKey)
	}
	if req.Status != "draft" {
		t.Fatalf("기본 status 기대 draft, 실제=%q", req.Status)
	}
	if req.Steps[0].LineNo != 1 {
		t.Fatalf("line_no 자동 부여 기대 1, 실제=%d", req.Steps[0].LineNo)
	}
	if req.Steps[0].AssessmentKind != "none" {
		t.Fatalf("기본 assessment_kind 기대 none, 실제=%q", req.Steps[0].AssessmentKind)
	}
	if msg := req.Validate(); msg != "" {
		t.Fatalf("valid request가 실패함: %s", msg)
	}
}

func TestCreateStudyLearningPlanRequest_RejectsBadStep(t *testing.T) {
	req := CreateStudyLearningPlanRequest{
		PlanKey:      "new_employee",
		Title:        "신입",
		Audience:     "신입",
		Objective:    "목표",
		DurationDays: 3,
		Steps: []CreateStudyLearningPlanStepRequest{
			{
				LineNo:          1,
				Title:           "단계",
				Description:     "설명",
				ExpectedMinutes: 0,
			},
		},
	}
	req.Normalize()
	if msg := req.Validate(); msg == "" {
		t.Fatalf("expected_minutes=0은 거부되어야 합니다")
	}
}

func TestUpdateStudyLearningDomainRequest_RequiresField(t *testing.T) {
	req := UpdateStudyLearningDomainRequest{}
	req.Normalize()
	if msg := req.Validate(); msg == "" {
		t.Fatalf("빈 update는 거부되어야 합니다")
	}
}
