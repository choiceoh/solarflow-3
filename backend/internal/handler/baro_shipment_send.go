package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/response"
)

// BaroShipmentSendHandler — D-137 출하 알림 발송 + 드라이버 PWA 토큰 (PR7.5).
//
// 외부 API 통합 stub:
//   - KAKAO_NOTIFY_API_KEY 미설정 → 카톡 발송 시 501
//   - ALIGO_API_KEY 미설정 → SMS 발송 시 501
//   - manual 채널 (수동 복사) 만 안전 동작 — 발송 추적만 기록
//
// 드라이버 PWA 토큰: 24h 만료 random hex. /d/<token> 라우트로 PWA 접근.
type BaroShipmentSendHandler struct {
	DB *supa.Client
}

func NewBaroShipmentSendHandler(db *supa.Client) *BaroShipmentSendHandler {
	return &BaroShipmentSendHandler{DB: db}
}

type ShipmentSendRequest struct {
	PartnerID        string  `json:"partner_id"`
	OutboundID       *string `json:"outbound_id,omitempty"`
	DispatchRouteID  *string `json:"dispatch_route_id,omitempty"`
	Stage            string  `json:"stage"`             // loading | departure | arrival | delivered
	Channel          string  `json:"channel"`           // kakao | sms | manual_copy
	RecipientPhone   *string `json:"recipient_phone,omitempty"`
	RecipientName    *string `json:"recipient_name,omitempty"`
	MessageBody      string  `json:"message_body"`
	IssueDriverToken bool    `json:"issue_driver_token,omitempty"` // 차주 PWA 링크 발급
	DriverPhone      *string `json:"driver_phone,omitempty"`
}

type ShipmentSendResponse struct {
	NoticeID       string  `json:"notice_id"`
	Channel        string  `json:"channel"`
	DeliveryStatus string  `json:"delivery_status"` // sent | manual_logged | pending | failed
	DriverURL      *string `json:"driver_url,omitempty"`
	Note           string  `json:"note"`
}

// Send — POST /api/v1/baro/shipment-notices
func (h *BaroShipmentSendHandler) Send(w http.ResponseWriter, r *http.Request) {
	var req ShipmentSendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if req.MessageBody == "" {
		response.RespondError(w, http.StatusBadRequest, "message_body는 필수입니다")
		return
	}
	switch req.Stage {
	case "loading", "departure", "arrival", "delivered":
	default:
		response.RespondError(w, http.StatusBadRequest, "stage는 loading/departure/arrival/delivered 중 하나여야 합니다")
		return
	}
	switch req.Channel {
	case "kakao", "sms", "manual_copy":
	default:
		response.RespondError(w, http.StatusBadRequest, "channel은 kakao/sms/manual_copy 중 하나여야 합니다")
		return
	}

	deliveryStatus := "pending"
	noteMsg := ""

	switch req.Channel {
	case "manual_copy":
		// 사용자가 직접 카톡에 붙여넣기 — 발송 추적만 기록
		deliveryStatus = "manual_logged"
		noteMsg = "수동 복사 발송 — 사용자가 카톡에 직접 붙여넣음"
	case "kakao":
		if os.Getenv("KAKAO_NOTIFY_API_KEY") == "" {
			response.RespondError(w, http.StatusNotImplemented,
				"카톡 자동 발송 미구현 (KAKAO_NOTIFY_API_KEY 미설정). 사업자 키 발급 후 환경변수 주입 — PR7.5b 참조.")
			return
		}
		// TODO PR7.5b: kakao notification talk API 호출
		response.RespondError(w, http.StatusNotImplemented, "카톡 발송 핸들러 본체 미구현 (PR7.5b)")
		return
	case "sms":
		if os.Getenv("ALIGO_API_KEY") == "" {
			response.RespondError(w, http.StatusNotImplemented,
				"SMS 자동 발송 미구현 (ALIGO_API_KEY 미설정). PR7.5c 참조.")
			return
		}
		response.RespondError(w, http.StatusNotImplemented, "SMS 발송 핸들러 본체 미구현 (PR7.5c)")
		return
	}

	// 발송 추적 row 기록
	uid := middleware.GetUserID(r.Context())
	insert := map[string]any{
		"partner_id":        req.PartnerID,
		"outbound_id":       req.OutboundID,
		"dispatch_route_id": req.DispatchRouteID,
		"stage":             req.Stage,
		"channel":           req.Channel,
		"recipient_phone":   req.RecipientPhone,
		"recipient_name":    req.RecipientName,
		"message_body":      req.MessageBody,
		"sent_by":           uid,
		"delivery_status":   deliveryStatus,
	}
	data, _, err := h.DB.From("baro_shipment_notices").
		Insert(insert, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[shipment-notice insert 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "발송 추적 기록 실패 (마이그 084 적용 필요?)")
		return
	}
	var created []struct {
		NoticeID string `json:"notice_id"`
	}
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	resp := ShipmentSendResponse{
		NoticeID:       created[0].NoticeID,
		Channel:        req.Channel,
		DeliveryStatus: deliveryStatus,
		Note:           noteMsg,
	}

	// 차주 PWA 토큰 발급 (요청 시)
	if req.IssueDriverToken {
		token, gerr := generateDriverToken()
		if gerr != nil {
			log.Printf("[driver token 생성 실패] %v", gerr)
		} else {
			tokInsert := map[string]any{
				"token":        token,
				"notice_id":    created[0].NoticeID,
				"driver_phone": req.DriverPhone,
			}
			if _, _, terr := h.DB.From("baro_driver_tokens").
				Insert(tokInsert, false, "", "", "").Execute(); terr != nil {
				log.Printf("[driver token 저장 실패] %v", terr)
			} else {
				url := buildDriverURL(r, token)
				resp.DriverURL = &url
				resp.Note += " (드라이버 PWA 링크 발급, 24h 만료)"
			}
		}
	}

	response.RespondJSON(w, http.StatusCreated, resp)
}

// GetByDriverToken — GET /api/v1/baro/driver/{token}
//
// 차주 PWA 가 페이지 로드 시 호출. 인증 미적용 (외부 차주 access). 토큰 만료/사용 검증.
func (h *BaroShipmentSendHandler) GetByDriverToken(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		response.RespondError(w, http.StatusBadRequest, "token이 필요합니다")
		return
	}

	tokData, _, err := h.DB.From("baro_driver_tokens").
		Select("token,notice_id,expires_at,used_at,driver_phone", "exact", false).
		Eq("token", token).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "토큰 조회 실패")
		return
	}
	var toks []struct {
		Token       string  `json:"token"`
		NoticeID    string  `json:"notice_id"`
		ExpiresAt   string  `json:"expires_at"`
		UsedAt      *string `json:"used_at"`
		DriverPhone *string `json:"driver_phone"`
	}
	if err := json.Unmarshal(tokData, &toks); err != nil || len(toks) == 0 {
		response.RespondError(w, http.StatusNotFound, "유효하지 않은 토큰입니다")
		return
	}
	tk := toks[0]
	if tExp, perr := time.Parse(time.RFC3339, tk.ExpiresAt); perr == nil {
		if time.Now().After(tExp) {
			response.RespondError(w, http.StatusGone, "만료된 토큰입니다 (24h 초과)")
			return
		}
	}

	// notice + 일부 컨텍스트 응답 (배송 정보)
	noticeData, _, _ := h.DB.From("baro_shipment_notices").
		Select("notice_id,partner_id,stage,message_body,recipient_phone,recipient_name", "exact", false).
		Eq("notice_id", tk.NoticeID).
		Execute()
	var notices []map[string]any
	_ = json.Unmarshal(noticeData, &notices)
	if len(notices) == 0 {
		response.RespondError(w, http.StatusNotFound, "출하 정보를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, map[string]any{
		"token":  token,
		"notice": notices[0],
	})
}

// generateDriverToken — 32자 hex random.
func generateDriverToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// buildDriverURL — 운영용 호스트 추론. baro.topworks.ltd 기본.
func buildDriverURL(r *http.Request, token string) string {
	scheme := "https"
	host := os.Getenv("BARO_PUBLIC_HOST")
	if host == "" {
		host = "baro.topworks.ltd"
	}
	if r.TLS == nil && r.Host != "" {
		// 로컬 dev — http
		scheme = "http"
		host = r.Host
	}
	return scheme + "://" + host + "/d/" + token
}
