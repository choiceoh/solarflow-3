package outbound

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

// ReceivingLogHandler — D-141 WMS Phase 3 입고 검수 로그 (모든 테넌트 공유).
//
// 비유: "입고 검수 일지" — 트럭 도착 → 검수자가 수량/규격 확인 → 차이 사유 + 사진.
// 두 흐름 통합: source_type='bl_line' (module) | 'intercompany' (BARO) | 'manual'.
type ReceivingLogHandler struct {
	DB *supa.Client
}

func NewReceivingLogHandler(db *supa.Client) *ReceivingLogHandler {
	return &ReceivingLogHandler{DB: db}
}

// init — D-20260512-090000 feature self-mounting.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDTxReceivingLog,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewReceivingLogHandler(d.DB)
			g := d.Gates
			r.Route("/receiving-logs", func(r chi.Router) {
				r.Use(g.Feature(feature.IDTxReceivingLog))
				r.Get("/", h.List)
				r.Get("/{id}", h.GetByID)
				r.With(g.Write).Post("/", h.Create)
				r.With(g.Write).Patch("/{id}", h.Update)
				r.With(g.Write).Delete("/{id}", h.Delete)
			})
		},
	})
}

// ReceivingLog — 입고 검수 1건.
type ReceivingLog struct {
	ReceivingID           string     `json:"receiving_id"`
	SourceType            string     `json:"source_type"`
	BLLineID              *string    `json:"bl_line_id,omitempty"`
	IntercompanyRequestID *string    `json:"intercompany_request_id,omitempty"`
	WarehouseID           string     `json:"warehouse_id"`
	ProductID             *string    `json:"product_id,omitempty"`
	ProductCodeSnapshot   *string    `json:"product_code_snapshot,omitempty"`
	ProductNameSnapshot   *string    `json:"product_name_snapshot,omitempty"`
	QuantityExpected      int        `json:"quantity_expected"`
	QuantityReceived      int        `json:"quantity_received"`
	QuantityVariance      int        `json:"quantity_variance"` // GENERATED
	LocationID            *string    `json:"location_id,omitempty"`
	LocationCodeSnapshot  *string    `json:"location_code_snapshot,omitempty"`
	ReceiverUserID        *string    `json:"receiver_user_id,omitempty"`
	ReceivedAt            *time.Time `json:"received_at,omitempty"`
	VarianceReason        *string    `json:"variance_reason,omitempty"`
	VarianceNote          *string    `json:"variance_note,omitempty"`
	PhotoAttachmentIDs    []string   `json:"photo_attachment_ids,omitempty"`
	Notes                 *string    `json:"notes,omitempty"`
}

// CreateReceivingLogRequest — 등록 요청.
type CreateReceivingLogRequest struct {
	SourceType            string   `json:"source_type"`
	BLLineID              *string  `json:"bl_line_id,omitempty"`
	IntercompanyRequestID *string  `json:"intercompany_request_id,omitempty"`
	WarehouseID           string   `json:"warehouse_id"`
	ProductID             *string  `json:"product_id,omitempty"`
	ProductCodeSnapshot   *string  `json:"product_code_snapshot,omitempty"`
	ProductNameSnapshot   *string  `json:"product_name_snapshot,omitempty"`
	QuantityExpected      int      `json:"quantity_expected"`
	QuantityReceived      int      `json:"quantity_received"`
	LocationID            *string  `json:"location_id,omitempty"`
	LocationCodeSnapshot  *string  `json:"location_code_snapshot,omitempty"`
	VarianceReason        *string  `json:"variance_reason,omitempty"`
	VarianceNote          *string  `json:"variance_note,omitempty"`
	PhotoAttachmentIDs    []string `json:"photo_attachment_ids,omitempty"`
	Notes                 *string  `json:"notes,omitempty"`
}

func (req *CreateReceivingLogRequest) Validate() string {
	switch req.SourceType {
	case "bl_line", "intercompany", "manual":
	default:
		return "source_type은 bl_line/intercompany/manual 중 하나여야 합니다"
	}
	if req.SourceType == "bl_line" && req.BLLineID == nil {
		return "bl_line 소스는 bl_line_id가 필수입니다"
	}
	if req.SourceType == "intercompany" && req.IntercompanyRequestID == nil {
		return "intercompany 소스는 intercompany_request_id가 필수입니다"
	}
	if req.WarehouseID == "" {
		return "warehouse_id는 필수입니다"
	}
	if req.QuantityExpected < 0 || req.QuantityReceived < 0 {
		return "수량은 0 이상이어야 합니다"
	}
	if req.QuantityReceived != req.QuantityExpected && req.VarianceReason == nil {
		return "수량 차이 발생 시 variance_reason은 필수입니다"
	}
	if req.VarianceReason != nil {
		switch *req.VarianceReason {
		case "shortage", "overage", "damaged", "wrong_product", "wrong_spec", "other":
		default:
			return "variance_reason은 shortage/overage/damaged/wrong_product/wrong_spec/other 중 하나여야 합니다"
		}
	}
	return ""
}

// List — GET /api/v1/receiving-logs?source_type=&warehouse_id=&variance_only=true
func (h *ReceivingLogHandler) List(w http.ResponseWriter, r *http.Request) {
	q := h.DB.From("receiving_logs").Select("*", "exact", false)
	if st := r.URL.Query().Get("source_type"); st != "" {
		q = q.Eq("source_type", st)
	}
	if wid := r.URL.Query().Get("warehouse_id"); wid != "" {
		q = q.Eq("warehouse_id", wid)
	}
	if r.URL.Query().Get("variance_only") == "true" {
		q = q.Neq("quantity_variance", "0")
	}
	data, _, err := q.
		Order("received_at", &postgrest.OrderOpts{Ascending: false, NullsFirst: false}).
		Limit(200, "").
		Execute()
	if err != nil {
		log.Printf("[receiving log 목록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "검수 로그 조회 실패")
		return
	}
	var rows []ReceivingLog
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// GetByID — GET /api/v1/receiving-logs/{id}
func (h *ReceivingLogHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	data, _, err := h.DB.From("receiving_logs").
		Select("*", "exact", false).
		Eq("receiving_id", id).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "조회 실패")
		return
	}
	var rows []ReceivingLog
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		response.RespondError(w, http.StatusNotFound, "검수 로그를 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows[0])
}

// Create — POST /api/v1/receiving-logs
func (h *ReceivingLogHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateReceivingLogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	uid := middleware.GetUserID(r.Context())

	insert := map[string]any{
		"source_type":       req.SourceType,
		"warehouse_id":      req.WarehouseID,
		"quantity_expected": req.QuantityExpected,
		"quantity_received": req.QuantityReceived,
	}
	if uid != "" {
		insert["receiver_user_id"] = uid
	}
	if req.BLLineID != nil {
		insert["bl_line_id"] = *req.BLLineID
	}
	if req.IntercompanyRequestID != nil {
		insert["intercompany_request_id"] = *req.IntercompanyRequestID
	}
	if req.ProductID != nil {
		insert["product_id"] = *req.ProductID
	}
	if req.ProductCodeSnapshot != nil {
		insert["product_code_snapshot"] = *req.ProductCodeSnapshot
	}
	if req.ProductNameSnapshot != nil {
		insert["product_name_snapshot"] = *req.ProductNameSnapshot
	}
	if req.LocationID != nil {
		insert["location_id"] = *req.LocationID
	}
	if req.LocationCodeSnapshot != nil {
		insert["location_code_snapshot"] = *req.LocationCodeSnapshot
	}
	if req.VarianceReason != nil {
		insert["variance_reason"] = *req.VarianceReason
	}
	if req.VarianceNote != nil {
		insert["variance_note"] = *req.VarianceNote
	}
	if len(req.PhotoAttachmentIDs) > 0 {
		insert["photo_attachment_ids"] = req.PhotoAttachmentIDs
	}
	if req.Notes != nil {
		insert["notes"] = *req.Notes
	}

	data, _, err := h.DB.From("receiving_logs").
		Insert(insert, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[receiving log 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "검수 로그 등록 실패 (마이그 087 미적용?)")
		return
	}
	var created []ReceivingLog
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Delete — DELETE /api/v1/receiving-logs/{id} — admin 만 (검수 로그 회계 증빙).
func (h *ReceivingLogHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, _, err := h.DB.From("receiving_logs").
		Delete("", "").Eq("receiving_id", id).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "삭제 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
