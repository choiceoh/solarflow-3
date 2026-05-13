package tt

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	postgrest "github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/handlerutil"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

// ttSortable — server-side 정렬 허용 컬럼 (BL 패턴과 동일).
var ttSortable = map[string]struct{}{
	"remit_date": {},
	"amount_usd": {},
	"status":     {},
	"purpose":    {},
	"bank_name":  {},
	"created_at": {},
}

func sanitizeTTSearchTerm(q string) string {
	q = strings.TrimSpace(q)
	if q == "" {
		return ""
	}
	replacer := strings.NewReplacer(",", " ", "(", " ", ")", " ", ".", " ", "*", " ", "\"", " ")
	return strings.TrimSpace(replacer.Replace(q))
}

// TTHandler — TT(전신송금) 관련 API를 처리하는 핸들러
// 비유: "TT 송금 관리실" — 각 PO에 연결된 선급금/잔금 송금 내역을 관리
type TTHandler struct {
	DB *supa.Client
}

// NewTTHandler — TTHandler 생성자
func NewTTHandler(db *supa.Client) *TTHandler {
	return &TTHandler{DB: db}
}

// init — D-20260512-090000 feature self-mounting.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDTxTT,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewTTHandler(d.DB)
			g := d.Gates
			r.Route("/tts", func(r chi.Router) {
				r.Use(g.Feature(feature.IDTxTT))
				r.Get("/", h.List)
				r.Get("/summary", h.Summary)
				r.Get("/dashboard", h.Dashboard)
				r.Get("/{id}", h.GetByID)
				r.With(g.Write).Post("/", h.Create)
				r.With(g.Write).Put("/{id}", h.Update)
				r.With(g.Write).Delete("/{id}", h.Delete)
			})
		},
	})
}

// ttReadView — List/Summary/Dashboard 가 쿼리할 base view 이름 (마이그 114).
// tt_remittances 는 직접 company_id 가 없어 과거엔 purchase_orders 에서 po_id 리스트를
// 끌어와 .In("po_id", ...) 했다 — PO 가 많은 테넌트에서 URL 폭주 (PR #806 동일 패턴).
// view 는 po_company_id 컬럼을 노출해 server-side eq 만으로 끝낸다.
// 쓰기(Create/Update/Delete) 는 tt_remittances 테이블 직접.
const ttReadView = "tt_remittances_with_company"

func (h *TTHandler) applyTTFilters(r *http.Request, query *postgrest.FilterBuilder) (*postgrest.FilterBuilder, bool, error) {
	// 비유: ?po_id=xxx — 특정 PO의 송금만 필터
	if poID := r.URL.Query().Get("po_id"); poID != "" {
		query = query.Eq("po_id", poID)
	}

	// 비유: ?company_id=xxx — view 의 po_company_id 컬럼으로 server-side 매칭.
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" && r.URL.Query().Get("po_id") == "" {
		query = query.Eq("po_company_id", compID)
	}

	// 비유: ?status=completed — 특정 상태의 송금만 필터
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	}
	// 기간 — remit_date 범위. frontend ProcurementPage date_range 서버 위임.
	if from := r.URL.Query().Get("remit_date_from"); from != "" {
		query = query.Gte("remit_date", from)
	}
	if to := r.URL.Query().Get("remit_date_to"); to != "" {
		query = query.Lte("remit_date", to)
	}
	// 검색 — purpose/bank_name/memo ilike. PO 의 join 필드는 or 절 미지원.
	if q := sanitizeTTSearchTerm(r.URL.Query().Get("q")); q != "" {
		clauses := []string{
			fmt.Sprintf("purpose.ilike.*%s*", q),
			fmt.Sprintf("bank_name.ilike.*%s*", q),
			fmt.Sprintf("memo.ilike.*%s*", q),
		}
		query = query.Or(strings.Join(clauses, ","), "")
	}
	return query, true, nil
}

func parseTTSort(r *http.Request) (column string, ascending bool) {
	column = "remit_date"
	ascending = false
	if raw := r.URL.Query().Get("sort"); raw != "" {
		if _, ok := ttSortable[raw]; ok {
			column = raw
		}
	}
	if r.URL.Query().Get("order") == "asc" {
		ascending = true
	}
	return column, ascending
}

// List — GET /api/v1/tts — TT 목록 조회 (PO/제조사 정보 포함)
// 비유: 송금 관리실에서 전체 송금 전표를 꺼내 보여주는 것
func (h *TTHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From(ttReadView).
		Select("*, purchase_orders(po_number, manufacturers(name_kr))", "exact", false)
	var ok bool
	var err error
	query, ok, err = h.applyTTFilters(r, query)
	if err != nil {
		log.Printf("[TT 목록 필터 처리 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "TT 목록 필터 처리에 실패했습니다")
		return
	}
	if !ok {
		w.Header().Set("X-Total-Count", "0")
		response.RespondJSON(w, http.StatusOK, []TTWithRelations{})
		return
	}

	sortCol, asc := parseTTSort(r)
	query = query.Order(sortCol, &postgrest.OrderOpts{Ascending: asc})

	limit, offset := handlerutil.ParseLimitOffset(r, 100, 1000)
	data, count, err := query.Range(offset, offset+limit-1, "").Execute()
	if err != nil {
		log.Printf("[TT 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "TT 목록 조회에 실패했습니다")
		return
	}

	var remittances []TTWithRelations
	if err := json.Unmarshal(data, &remittances); err != nil {
		log.Printf("[TT 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, remittances)
}

type ttSummaryRow struct {
	TTID      string  `json:"tt_id"`
	POID      string  `json:"po_id"`
	RemitDate *string `json:"remit_date"`
	AmountUSD float64 `json:"amount_usd"`
	Status    string  `json:"status"`
}

type TTSummaryBoard struct {
	Total              int64                           `json:"total"`
	CompletedCount     int64                           `json:"completed_count"`
	PlannedCount       int64                           `json:"planned_count"`
	CompletedAmountUSD float64                         `json:"completed_amount_usd"`
	POCount            int64                           `json:"po_count"`
	ByStatus           map[string]int64                `json:"by_status"`
	MonthlyAmount      []handlerutil.SummaryMonthPoint `json:"monthly_amount"`
}

// Summary — GET /api/v1/tts/summary — T/T KPI 카드용 전체 집계.
func (h *TTHandler) Summary(w http.ResponseWriter, r *http.Request) {
	var applyErr error
	empty := false
	rows, total, err := handlerutil.FetchAllSummaryRows[ttSummaryRow](func() *postgrest.FilterBuilder {
		q := h.DB.From(ttReadView).
			Select("tt_id,po_id,remit_date,amount_usd,status", "exact", false)
		q, ok, err := h.applyTTFilters(r, q)
		if err != nil {
			applyErr = err
			return q.Eq("tt_id", "__filter_error__")
		}
		if !ok || empty {
			empty = true
			return q.Eq("tt_id", "__empty__")
		}
		return q
	})
	if applyErr != nil {
		log.Printf("[TT 요약 필터 처리 실패] %v", applyErr)
		response.RespondError(w, http.StatusInternalServerError, "TT 요약 필터 처리에 실패했습니다")
		return
	}
	if err != nil {
		log.Printf("[TT 요약 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "TT 요약 조회에 실패했습니다")
		return
	}

	byStatus := map[string]int64{}
	monthlyAmount := map[string]float64{}
	poIDs := map[string]struct{}{}
	summary := TTSummaryBoard{Total: total, ByStatus: byStatus}
	if total == 0 {
		summary.Total = int64(len(rows))
	}
	for _, row := range rows {
		handlerutil.IncrementCount(byStatus, row.Status)
		if row.Status == "completed" {
			summary.CompletedCount++
			summary.CompletedAmountUSD += row.AmountUSD
		}
		if row.Status == "planned" {
			summary.PlannedCount++
		}
		if row.POID != "" {
			poIDs[row.POID] = struct{}{}
		}
		if month := handlerutil.DateMonth(row.RemitDate); month != "" && row.Status == "completed" {
			monthlyAmount[month] += row.AmountUSD
		}
	}
	summary.POCount = handlerutil.DistinctCount(poIDs)
	summary.MonthlyAmount = handlerutil.RecentMonthAmounts(monthlyAmount, 6)
	response.RespondJSON(w, http.StatusOK, summary)
}

// GetByID — GET /api/v1/tts/{id} — TT 상세 조회
// 비유: 특정 송금 전표를 꺼내 자세히 보는 것
func (h *TTHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("tt_remittances").
		Select("*, purchase_orders(po_number, manufacturers(name_kr))", "exact", false).
		Eq("tt_id", id).
		Execute()
	if err != nil {
		log.Printf("[TT 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "TT 조회에 실패했습니다")
		return
	}

	var remittances []TTWithRelations
	if err := json.Unmarshal(data, &remittances); err != nil {
		log.Printf("[TT 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(remittances) == 0 {
		response.RespondError(w, http.StatusNotFound, "TT를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, remittances[0])
}

// Create — POST /api/v1/tts — TT 등록
// 비유: 새 송금 전표를 작성하여 관리실에 보관하는 것
func (h *TTHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateTTRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[TT 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 송금 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("tt_remittances").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[TT 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "TT 등록에 실패했습니다")
		return
	}

	var created []TTRemittance
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[TT 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "TT 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/tts/{id} — TT 수정
// 비유: 기존 송금 전표의 내용을 수정하는 것
func (h *TTHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req UpdateTTRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[TT 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("tt_remittances").
		Update(req, "", "").
		Eq("tt_id", id).
		Execute()
	if err != nil {
		log.Printf("[TT 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "TT 수정에 실패했습니다")
		return
	}

	var updated []TTRemittance
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[TT 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 TT를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/tts/{id} — TT 송금 삭제
func (h *TTHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("tt_remittances").
		Delete("", "").
		Eq("tt_id", id).
		Execute()
	if err != nil {
		log.Printf("[TT 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "TT 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
