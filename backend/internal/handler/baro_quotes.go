package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// BaroQuotesHandler — D-135 견적 DB 저장 + 발송 추적 (PR2.5b).
//
// 비유: "견적서 보관함 + 보낸편지함" — LocalStorage 휘발성 draft 를 DB 영구 저장으로 승격.
// 발송 채널은 status 머신으로 추적 (draft → sent → replied → won/lost/expired).
//
// 외부 API 통합 (PR2.5c — KakaoTalk Notification Talk + Aligo SMS) 은 환경변수 기반 stub:
//   - KAKAO_NOTIFY_API_KEY 미설정 → channel='kakao' send 시 501 + 안내
//   - ALIGO_API_KEY 미설정 → channel='sms' send 시 501 + 안내
// 본 PR 에서는 channel='manual' (수동 복사) 만 안전하게 동작.
type BaroQuotesHandler struct {
	DB *supa.Client
}

func NewBaroQuotesHandler(db *supa.Client) *BaroQuotesHandler {
	return &BaroQuotesHandler{DB: db}
}

// QuoteWithLines — 견적 1건 응답 (헤더 + 라인 묶음).
type QuoteWithLines struct {
	model.BaroQuote
	Lines []model.BaroQuoteLine `json:"lines"`
}

// List — GET /api/v1/baro/quotes?partner_id=&status=
func (h *BaroQuotesHandler) List(w http.ResponseWriter, r *http.Request) {
	q := h.DB.From("baro_quotes").Select("*", "exact", false)
	if pid := r.URL.Query().Get("partner_id"); pid != "" {
		q = q.Eq("partner_id", pid)
	}
	if st := r.URL.Query().Get("status"); st != "" {
		q = q.Eq("status", st)
	}
	if r.URL.Query().Get("mine") == "true" {
		uid := middleware.GetUserID(r.Context())
		if uid != "" {
			q = q.Eq("created_by", uid)
		}
	}
	data, _, err := q.
		Order("created_at", &postgrest.OrderOpts{Ascending: false, NullsFirst: false}).
		Limit(100, "").
		Execute()
	if err != nil {
		log.Printf("[견적 목록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "견적 목록 조회 실패")
		return
	}
	var rows []model.BaroQuote
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// GetByID — GET /api/v1/baro/quotes/{id}
func (h *BaroQuotesHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	hdrData, _, err := h.DB.From("baro_quotes").
		Select("*", "exact", false).
		Eq("quote_id", id).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "견적 조회 실패")
		return
	}
	var hdrs []model.BaroQuote
	if err := json.Unmarshal(hdrData, &hdrs); err != nil || len(hdrs) == 0 {
		response.RespondError(w, http.StatusNotFound, "견적을 찾을 수 없습니다")
		return
	}
	linesData, _, _ := h.DB.From("baro_quote_lines").
		Select("*", "exact", false).
		Eq("quote_id", id).
		Order("line_no", &postgrest.OrderOpts{Ascending: true}).
		Execute()
	var lines []model.BaroQuoteLine
	_ = json.Unmarshal(linesData, &lines)
	if lines == nil {
		lines = []model.BaroQuoteLine{}
	}
	response.RespondJSON(w, http.StatusOK, QuoteWithLines{BaroQuote: hdrs[0], Lines: lines})
}

// Create — POST /api/v1/baro/quotes
// 헤더 + 라인 한 번에 저장. 합계 자동 계산.
func (h *BaroQuotesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateBaroQuoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	uid := middleware.GetUserID(r.Context())

	// 합계 계산 — line_total_krw 는 DB GENERATED 라 여기서는 헤더 합계만
	subtotal := 0.0
	for _, l := range req.Lines {
		subtotal += float64(l.Quantity) * l.UnitPriceKrw
	}
	vat := subtotal * 0.1
	total := subtotal + vat

	hdrInsert := map[string]any{
		"partner_id":   req.PartnerID,
		"created_by":   uid,
		"status":       "draft",
		"valid_until":  req.ValidUntil,
		"notes":        req.Notes,
		"subtotal_krw": subtotal,
		"vat_krw":      vat,
		"total_krw":    total,
	}
	hdrData, _, err := h.DB.From("baro_quotes").
		Insert(hdrInsert, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[견적 헤더 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "견적 등록에 실패했습니다 (마이그 084 적용 필요?)")
		return
	}
	var created []model.BaroQuote
	if err := json.Unmarshal(hdrData, &created); err != nil || len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	quoteID := created[0].QuoteID

	// 라인 일괄 INSERT
	if len(req.Lines) > 0 {
		lineRows := make([]map[string]any, 0, len(req.Lines))
		for i, l := range req.Lines {
			row := map[string]any{
				"quote_id":       quoteID,
				"line_no":        i + 1,
				"product_id":     l.ProductID,
				"product_code":   l.ProductCode,
				"product_name":   l.ProductName,
				"spec_wp":        l.SpecWp,
				"quantity":       l.Quantity,
				"unit_price_krw": l.UnitPriceKrw,
				"notes":          l.Notes,
			}
			lineRows = append(lineRows, row)
		}
		if _, _, lerr := h.DB.From("baro_quote_lines").
			Insert(lineRows, false, "", "", "").Execute(); lerr != nil {
			log.Printf("[견적 라인 등록 실패] quote=%s, err=%v", quoteID, lerr)
			// 헤더는 살아있고 라인만 실패 — 클라이언트에 경고
			response.RespondError(w, http.StatusPartialContent, "견적 헤더는 저장됐으나 라인 저장 실패: "+lerr.Error())
			return
		}
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/baro/quotes/{id} (헤더만)
func (h *BaroQuotesHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.UpdateBaroQuoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	upd := map[string]any{}
	if req.ValidUntil != nil {
		upd["valid_until"] = *req.ValidUntil
	}
	if req.Notes != nil {
		upd["notes"] = *req.Notes
	}
	if req.Status != nil {
		upd["status"] = *req.Status
	}
	if req.ReplyNote != nil {
		upd["reply_note"] = *req.ReplyNote
		now := time.Now().UTC()
		upd["replied_at"] = now.Format(time.RFC3339)
	}
	if len(upd) == 0 {
		response.RespondError(w, http.StatusBadRequest, "수정할 필드가 없습니다")
		return
	}
	upd["updated_at"] = time.Now().UTC().Format(time.RFC3339)
	_, _, err := h.DB.From("baro_quotes").
		Update(upd, "", "").Eq("quote_id", id).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "수정 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Delete — DELETE /api/v1/baro/quotes/{id}
func (h *BaroQuotesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, _, err := h.DB.From("baro_quotes").
		Delete("", "").Eq("quote_id", id).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "삭제 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Send — POST /api/v1/baro/quotes/{id}/send
//
// channel='manual' / 'pdf' : 즉시 sent_at 기록 (외부 호출 없음 — 사용자가 직접 카톡 붙여넣기 / PDF 다운로드).
// channel='kakao' : KAKAO_NOTIFY_API_KEY 환경변수 미설정 시 501 + 안내. PR2.5c 에서 실제 구현.
// channel='sms'   : ALIGO_API_KEY 미설정 시 501 + 안내. PR2.5c 에서 실제 구현.
// channel='email' : SMTP / SendGrid 통합 — 미구현, 501.
func (h *BaroQuotesHandler) Send(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.QuoteSendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	switch req.Channel {
	case "manual", "pdf":
		// 즉시 처리 — 외부 호출 없음
	case "kakao":
		if os.Getenv("KAKAO_NOTIFY_API_KEY") == "" {
			response.RespondError(w, http.StatusNotImplemented,
				"카톡 자동 발송 미구현 (KAKAO_NOTIFY_API_KEY 미설정). 운영자가 사업자 키를 발급받아 환경변수로 주입해야 합니다 — PR2.5c 참조.")
			return
		}
		// TODO PR2.5c: kakao notification talk API 호출
		response.RespondError(w, http.StatusNotImplemented, "카톡 발송 핸들러 본체 미구현 (PR2.5c)")
		return
	case "sms":
		if os.Getenv("ALIGO_API_KEY") == "" {
			response.RespondError(w, http.StatusNotImplemented,
				"SMS 자동 발송 미구현 (ALIGO_API_KEY 미설정). PR2.5c 참조.")
			return
		}
		response.RespondError(w, http.StatusNotImplemented, "SMS 발송 핸들러 본체 미구현 (PR2.5c)")
		return
	case "email":
		response.RespondError(w, http.StatusNotImplemented, "이메일 발송 미구현 (PR2.5c)")
		return
	}

	// status='sent' + sent_at 기록
	now := time.Now().UTC().Format(time.RFC3339)
	_, _, err := h.DB.From("baro_quotes").
		Update(map[string]any{
			"status":       "sent",
			"sent_at":      now,
			"sent_channel": req.Channel,
			"sent_to":      req.SentTo,
			"updated_at":   now,
		}, "", "").Eq("quote_id", id).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "발송 상태 기록 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]any{
		"status":       "sent",
		"channel":      req.Channel,
		"sent_to":      req.SentTo,
		"sent_at":      now,
		"note":         "channel='manual' 인 경우 영업이 직접 카톡에 붙여넣기 후 본 endpoint 호출",
	})
}
