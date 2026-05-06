package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/response"
)

// DBIntegrityHandler — 운영자 전용 DB 정합성 검증 (D-064 PR 37).
//
// GET /api/v1/admin/db-integrity 호출 시 HIGH/MED/LOW 검증을 모두 실행해
// 운영자 화면에 표시할 결과 JSON 반환. 로컬 AI 가 결과를 추가 분석.
type DBIntegrityHandler struct {
	DB *supa.Client
}

func NewDBIntegrityHandler(db *supa.Client) *DBIntegrityHandler {
	return &DBIntegrityHandler{DB: db}
}

// RegisterRoutes — admin/operator 만 접근 (g.AdminOnly).
func (h *DBIntegrityHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.With(g.AdminOnly).Get("/admin/db-integrity", h.Run)
}

// IntegrityCheck — 한 검증 항목.
type IntegrityCheck struct {
	Category    string  `json:"category"` // "데이터 손실" / "산식" / "cross-link" / "ERP 본질"
	Severity    string  `json:"severity"` // "high" / "med" / "low"
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Baseline    *int64  `json:"baseline,omitempty"` // 정상 기대값 (nil = 0 가정)
	Actual      int64   `json:"actual"`
	Tolerance   float64 `json:"tolerance"`        // 허용 오차 (절대값 또는 비율)
	Status      string  `json:"status"`           // "pass" / "warn" / "fail"
	Hint        string  `json:"hint,omitempty"`   // 위반 시 권장 조치
}

// IntegrityResponse — 운영자 화면에 보낼 응답.
type IntegrityResponse struct {
	Checks         []IntegrityCheck `json:"checks"`
	Summary        IntegritySummary `json:"summary"`
	GeneratedAt    string           `json:"generated_at"`
	AnalyzedByAI   bool             `json:"analyzed_by_ai"` // 운영자가 AI 분석 트리거했는지
}

type IntegritySummary struct {
	HighFails  int `json:"high_fails"`
	MedFails   int `json:"med_fails"`
	LowFails   int `json:"low_fails"`
	TotalFails int `json:"total_fails"`
	Total      int `json:"total"`
}

// Run — 모든 검증을 실행. RPC 통해 SQL count 조회.
// SQL 직접 실행은 supabase-go 가 제한적이라 PostgREST head 메서드 + filter 로 count.
func (h *DBIntegrityHandler) Run(w http.ResponseWriter, r *http.Request) {
	checks := h.runChecks()

	summary := IntegritySummary{Total: len(checks)}
	for _, c := range checks {
		if c.Status == "fail" {
			summary.TotalFails++
			switch c.Severity {
			case "high":
				summary.HighFails++
			case "med":
				summary.MedFails++
			case "low":
				summary.LowFails++
			}
		}
	}

	resp := IntegrityResponse{
		Checks:      checks,
		Summary:     summary,
		GeneratedAt: nowRFC3339(),
	}
	response.RespondJSON(w, http.StatusOK, resp)
}

// runChecks — 모든 검증 항목 실행.
// 각 검증은 PostgREST head=count 쿼리 또는 RPC.
func (h *DBIntegrityHandler) runChecks() []IntegrityCheck {
	var checks []IntegrityCheck

	// === HIGH: 데이터 손실 baseline (count 비교) ===
	// baseline 은 PR 33/34 검증 시점 기준값. 향후 DB 테이블로 외부화 가능.
	checks = append(checks,
		h.countCheck("데이터 손실", "high", "sales 행수",
			"매출 행수가 baseline 대비 ±5% 이내인가", "sales", "", int64Ptr(1976), 0.05,
			"갑작스런 감소 = 데이터 손실 가능성. 최근 cleanup/migration 확인."),
		h.countCheck("데이터 손실", "high", "outbounds 행수",
			"출고 행수가 baseline 대비 ±5% 이내인가", "outbounds", "status=eq.active", int64Ptr(2229), 0.05,
			"감소 시 cancel 처리 누락 또는 정리. 증가 시 ERP backfill 중복 가능."),
		h.countCheck("데이터 손실", "high", "inbounds 행수",
			"입고 행수가 baseline 대비 ±5% 이내인가", "inbounds", "", int64Ptr(117), 0.05,
			"감소 시 ERP 입고 시트 reimport 누락 가능."),
		h.countCheck("데이터 손실", "high", "fifo_matches 행수",
			"FIFO 매칭 행수가 baseline 대비 ±5% 이내인가", "fifo_matches", "", int64Ptr(3332), 0.05,
			"감소 시 fifo_matches FK SET NULL on outbound delete 영향 가능."),
		h.countCheck("데이터 손실", "high", "products 활성 행수",
			"활성 products 가 baseline 대비 ±10% 이내인가", "products", "is_active=eq.true", int64Ptr(104), 0.10,
			"갑작스런 감소 = 마스터 비활성화 다수 발생. PR 33 의 38건은 의도적."),
	)

	// === HIGH: NULL 비율 ===
	checks = append(checks,
		h.nullRatioCheck("핵심 컬럼 NULL", "high", "sales.tax_invoice_date NULL",
			"매출 계산서 발행일 NULL 비율이 5% 이하인가", "sales", "tax_invoice_date", "", 0.05,
			"NULL 비율 증가 = ERP 매출 backfill 회귀 또는 새 매출 입력 시 발행일 누락."),
		h.nullRatioCheck("핵심 컬럼 NULL", "high", "sales.outbound_id NULL",
			"매출이 출고와 연결됐는가 (NULL 1% 이하)", "sales", "outbound_id", "", 0.01,
			"NULL = orphan 매출. order_id 만 있는 직접 매출은 정상."),
		h.nullRatioCheck("핵심 컬럼 NULL", "high", "outbounds.usage_category NULL",
			"출고 분류 NULL 비율 0%", "outbounds", "usage_category", "", 0.00,
			"NULL = ERP 관리구분 매핑 누락. PR 33 수정 후 0 유지 기대."),
	)

	// === MED: 외화 정합성 ===
	checks = append(checks,
		h.compareCheck("외화 정합성", "med", "sales 외화 KRW 비율",
			"국내 매출은 100% KRW", "sales", "currency=eq.KRW", "sales", "", 100.0, 1.0,
			"USD/CNY 등 외화 매출 발견 시 ERP currency 라벨링 또는 분류 확인."),
		h.compareCheck("외화 정합성", "med", "inbounds USD 정상 비율",
			"USD inbound 단가가 USD 단위 (PR 34: 20건 KRW 잘못 표기 → 정정 후 0 잔존)",
			"inbounds", "currency=eq.USD&unit_price_wp=lt.10",
			"inbounds", "currency=eq.USD", 100.0, 1.0,
			"비율 < 100% = USD 표기인데 KRW 단가 다시 들어왔을 가능성. PR 34 fix 회귀."),
	)

	// === MED: cross-link 정합성 ===
	checks = append(checks,
		h.orphanCheck("FK 정합성", "med", "fifo_matches.outbound_id orphan",
			"존재하지 않는 outbound 참조 0건", "fifo_matches", "outbound_id",
			"outbounds", "outbound_id", 0,
			"orphan = outbound 삭제 후 fifo_matches FK SET NULL 미적용 또는 FK 제약 부재."),
		h.orphanCheck("FK 정합성", "med", "sales.customer_id orphan",
			"존재하지 않는 partner 참조 0건", "sales", "customer_id",
			"partners", "partner_id", 0,
			"orphan = partner 삭제 후 sales 정리 누락."),
	)

	// === LOW: ERP 본질 추세 (참고용) ===
	checks = append(checks,
		h.countCheck("ERP 본질 (참고)", "low", "면장 신고>입항 (사후신고)",
			"관세법 입항 전 5일 신고 — 정상 패턴, 추세 변화 감지",
			"import_declarations", "declaration_date=gt.arrival_date", int64Ptr(43), 0.20,
			"수치가 크게 변하면 ERP 면장 입력 패턴이 바뀐 것. 운영자 확인."),
	)

	return checks
}
