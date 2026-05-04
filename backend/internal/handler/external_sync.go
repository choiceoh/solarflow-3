package handler

// ExternalSyncHandler — 외부 단방향 동기화 (D-059).
// 비유: "외부 시트 자동·수동 동기화 창구" — 구글 시트를 1시간 cron 또는 사용자 클릭으로
// SolarFlow 마스터/거래에 idempotent INSERT.
//
// 자동 모드 정책 (보수적):
// - 마스터 정확/정규화 매칭만 자동 등록 (fuzzy/none 은 SKIP + 카운트만 보고)
// - 같은 (spreadsheet_id, sheet_row_index) 조합은 058 마이그레이션의 UNIQUE 인덱스로
//   자동 dedup. 두 번째 sync 부터는 신규 행만 처리.
//
// 수동 모드는 프론트의 외부 양식 변환 다이얼로그 (D-056) 가 fuzzy/신규 등록·매출 동시
// 등록까지 처리. 백엔드는 시트 fetch proxy 만 제공.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"
	"github.com/xuri/excelize/v2"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

type ExternalSyncHandler struct {
	DB         *supa.Client
	httpClient *http.Client
}

func NewExternalSyncHandler(db *supa.Client) *ExternalSyncHandler {
	return &ExternalSyncHandler{
		DB:         db,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (h *ExternalSyncHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/external-sync-sources", func(r chi.Router) {
		r.Get("/", h.List)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Patch("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
		r.With(g.Write).Post("/{id}/run", h.RunManually)
	})
	r.Route("/external-format", func(r chi.Router) {
		// 프론트 변환 다이얼로그가 호출 — 공개 시트를 xlsx 바이너리로 stream proxy.
		r.Get("/google-sheet", h.FetchGoogleSheet)
	})
}

// ──────────────── CRUD ────────────────

func (h *ExternalSyncHandler) List(w http.ResponseWriter, r *http.Request) {
	data, _, err := h.DB.From("external_sync_sources").Select("*", "exact", false).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "동기화 소스 조회 실패")
		return
	}
	var rows []model.ExternalSyncSource
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 디코딩 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

func (h *ExternalSyncHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateExternalSyncSourceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	data, _, err := h.DB.From("external_sync_sources").Insert(req, false, "", "", "").Execute()
	if err != nil {
		if isUniqueViolation(err) {
			response.RespondError(w, http.StatusConflict, "이미 등록된 시트입니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "동기화 소스 등록 실패")
		return
	}
	var rows []model.ExternalSyncSource
	_ = json.Unmarshal(data, &rows)
	if len(rows) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "등록 결과 확인 실패")
		return
	}
	response.RespondJSON(w, http.StatusCreated, rows[0])
}

func (h *ExternalSyncHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.UpdateExternalSyncSourceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	if _, _, err := h.DB.From("external_sync_sources").
		Update(req, "", "").
		Eq("sync_id", id).
		Execute(); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "수정 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *ExternalSyncHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, _, err := h.DB.From("external_sync_sources").
		Delete("", "").
		Eq("sync_id", id).
		Execute(); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "삭제 실패")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ExternalSyncHandler) RunManually(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	source, err := h.fetchSourceByID(id)
	if err != nil {
		response.RespondError(w, http.StatusNotFound, "동기화 소스를 찾을 수 없습니다")
		return
	}
	go h.runOne(source)
	response.RespondJSON(w, http.StatusAccepted, map[string]string{"status": "started"})
}

// ──────────────── Sheet proxy ────────────────

func (h *ExternalSyncHandler) FetchGoogleSheet(w http.ResponseWriter, r *http.Request) {
	spreadsheetID := r.URL.Query().Get("spreadsheet_id")
	gidStr := r.URL.Query().Get("gid")
	if spreadsheetID == "" {
		response.RespondError(w, http.StatusBadRequest, "spreadsheet_id 필수")
		return
	}
	gid, _ := strconv.ParseInt(gidStr, 10, 64)
	body, ct, err := h.downloadGoogleSheet(spreadsheetID, gid)
	if err != nil {
		log.Printf("[google sheet fetch 실패] %v", err)
		response.RespondError(w, http.StatusBadGateway, "구글 시트 다운로드 실패 (공개 권한 확인)")
		return
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", `attachment; filename="sheet.xlsx"`)
	_, _ = w.Write(body)
}

func (h *ExternalSyncHandler) downloadGoogleSheet(spreadsheetID string, gid int64) ([]byte, string, error) {
	url := fmt.Sprintf(
		"https://docs.google.com/spreadsheets/d/%s/export?format=xlsx&gid=%d",
		spreadsheetID, gid,
	)
	resp, err := h.httpClient.Get(url)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	}
	return body, ct, nil
}

func (h *ExternalSyncHandler) fetchSourceByID(id string) (model.ExternalSyncSource, error) {
	data, _, err := h.DB.From("external_sync_sources").
		Select("*", "exact", false).Eq("sync_id", id).Execute()
	if err != nil {
		return model.ExternalSyncSource{}, err
	}
	var rows []model.ExternalSyncSource
	if err := json.Unmarshal(data, &rows); err != nil {
		return model.ExternalSyncSource{}, err
	}
	if len(rows) == 0 {
		return model.ExternalSyncSource{}, fmt.Errorf("not found")
	}
	return rows[0], nil
}

// ──────────────── Cron worker ────────────────

var workerStartOnce sync.Once

// StartHourlyWorker — main.go 가 부트스트랩 직후 호출. 1시간 ticker 로 enabled+hourly 시트 처리.
// sync.Once 로 다중 호출 안전 (테스트·재시작 등).
func (h *ExternalSyncHandler) StartHourlyWorker() {
	workerStartOnce.Do(func() {
		go h.workerLoop()
	})
}

func (h *ExternalSyncHandler) workerLoop() {
	log.Printf("[external sync] worker 시작 — 부팅 직후 1회 + 매 1시간")
	// 부팅 직후 한 번 + 매 1시간
	h.runHourlyOnce()
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		h.runHourlyOnce()
	}
}

func (h *ExternalSyncHandler) runHourlyOnce() {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("[external sync worker panic] %v", rec)
		}
	}()
	// PostgREST boolean 비교가 supabase-go .Eq 로 일관되지 않아 메모리 필터로 폴백 (안전).
	data, _, err := h.DB.From("external_sync_sources").
		Select("*", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[external sync] 시트 조회 실패: %v", err)
		return
	}
	var all []model.ExternalSyncSource
	if err := json.Unmarshal(data, &all); err != nil {
		log.Printf("[external sync] 응답 디코딩 실패: %v", err)
		return
	}
	active := make([]model.ExternalSyncSource, 0, len(all))
	for _, s := range all {
		if s.Enabled && s.Schedule == "hourly" {
			active = append(active, s)
		}
	}
	log.Printf("[external sync] runHourlyOnce — 전체 %d / 활성 %d", len(all), len(active))
	for _, s := range active {
		h.runOne(s)
	}
}

func (h *ExternalSyncHandler) runOne(src model.ExternalSyncSource) {
	log.Printf("[external sync] 시작: %s (sync_id=%s)", src.Name, src.SyncID)
	body, _, err := h.downloadGoogleSheet(src.SpreadsheetID, src.SheetGid)
	if err != nil {
		h.recordError(src.SyncID, fmt.Sprintf("download: %v", err))
		return
	}
	if src.ExternalFormatID != "topsolar_group_outbound" {
		h.recordError(src.SyncID, "지원하지 않는 external_format_id")
		return
	}
	imported, skipped, perr := h.processTopsolarOutbound(src, body)
	if perr != nil {
		h.recordError(src.SyncID, perr.Error())
		return
	}
	h.recordSuccess(src.SyncID, imported, skipped)
	log.Printf("[external sync] 완료: %s — imported=%d skipped=%d", src.Name, imported, skipped)
}

func (h *ExternalSyncHandler) recordError(syncID, msg string) {
	now := time.Now().UTC().Format(time.RFC3339)
	_, _, _ = h.DB.From("external_sync_sources").Update(map[string]interface{}{
		"last_synced_at": now,
		"last_error":     msg,
	}, "", "").Eq("sync_id", syncID).Execute()
	log.Printf("[external sync] 에러 (sync_id=%s): %s", syncID, msg)
}

func (h *ExternalSyncHandler) recordSuccess(syncID string, imported, skipped int) {
	now := time.Now().UTC().Format(time.RFC3339)
	_, _, _ = h.DB.From("external_sync_sources").Update(map[string]interface{}{
		"last_synced_at":      now,
		"last_sync_count":     imported,
		"last_skipped_count":  skipped,
		"last_error":          nil,
	}, "", "").Eq("sync_id", syncID).Execute()
}

// ──────────────── 변환 (단순 자동 모드) ────────────────
//
// 정책: 마스터 정확/정규화 매칭만 자동 등록. fuzzy/신규는 SKIP.
// 자동 등록 차단: products/companies/partners 등록 안 함 — 마스터에 없는 코드는 SKIP.
// dedup: 058 마이그레이션의 UNIQUE 인덱스가 (spreadsheet_id, sheet_row_index) 충돌을
// 자동 처리 — INSERT 가 23505 면 idempotent skip.

// D-059 PR 11: 자동 모드에서 신규 product 등록 시 prefix 룰로 manufacturer/wattage 추론.
type productInferenceRule struct {
	pattern    *regexp.Regexp
	mfgKeyword string
}

var productRules = []productInferenceRule{
	{regexp.MustCompile(`(?i)^TSM[\s-]*(\d{3})`), "Trina"},
	{regexp.MustCompile(`(?i)^LR[78][\s-]*\d+H[YGSM]D[\s-]*(\d{3})`), "LONGi"},
	{regexp.MustCompile(`(?i)^LR5[\s-]*\d+H[YGSM]D[\s-]*(\d{3})`), "LONGi"},
	{regexp.MustCompile(`(?i)^JKM[\s-]*(\d{3})`), "Jinko"},
	{regexp.MustCompile(`(?i)^RSM[\s-]*\d+[\s-]+(?:\d+[\s-]+)?(\d{3})`), "Risen"},
	{regexp.MustCompile(`(?i)^Q[.\s-]*PEAK[\s-]*\w*[\s-]+(\d{3})`), "Hanwha"},
	{regexp.MustCompile(`(?i)^HA[\s-]*(\d{3})`), ""},
	{regexp.MustCompile(`(?i)^HS[\s-]*(\d{3})`), "한솔"},
	{regexp.MustCompile(`(?i)^JAM[\s-]*\d+D\d+[\s-]*(\d{3})`), "ja"},
	{regexp.MustCompile(`(?i)^CS6W[\s-]*[A-Z]*[\s-]*(\d{3})`), "캐솔"},
}

func inferProductMeta(code string, mfgIndex map[string]string) (string, int) {
	for _, r := range productRules {
		if m := r.pattern.FindStringSubmatch(code); m != nil {
			wattage := 0
			if w, err := strconv.Atoi(m[1]); err == nil {
				wattage = w
			}
			mfgID := ""
			if r.mfgKeyword != "" {
				if id, ok := mfgIndex[strings.ToLower(r.mfgKeyword)]; ok {
					mfgID = id
				}
			}
			return mfgID, wattage
		}
	}
	return "", 0
}


// D-059 PR 12: 자유 형식 날짜 보정.
// 수동 모드(JS topsolarOutbound.ts) 와 동일 정책 — 섹션 마커 `탑솔라 (1월)` + 같은 섹션의
// 정상 datetime 행에서 연도를 캐시해서 자유 표기 (예: `1/12 오후착`) → ISO 변환.
// 시간 표기(`오후착`, `오전`, `9시착`)는 source_payload.date_raw 에 보존.
type sectionDateContext struct {
	sellerKey     string
	monthNum      int
	inferredYear  int
}

var freeDatePattern = regexp.MustCompile(`^(\d{1,2})/(\d{1,2})`)
var sectionMarkerPattern = regexp.MustCompile(`^\s*(탑솔라|디원|화신이엔지)\s*\((\d{1,2})월\s*\)`)

// parseSectionMarkerForDate — 섹션 마커에서 (seller, monthNum) 추출. 매치 안 되면 ("", 0).
func parseSectionMarkerForDate(s string) (string, int) {
	m := sectionMarkerPattern.FindStringSubmatch(s)
	if m == nil {
		return "", 0
	}
	n, _ := strconv.Atoi(m[2])
	return m[1], n
}

// parseTopsolarDateWithContext — 섹션 컨텍스트로 자유 형식 날짜 보정.
// 반환: (iso, rawText). iso 가 비면 보정 실패.
func parseTopsolarDateWithContext(s string, ctx *sectionDateContext) (string, string) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", ""
	}
	// 1) ISO / 한국 표기 — 기존 로직
	if iso := parseTopsolarDate(s); iso != "" {
		return iso, s
	}
	// 2) 자유 형식 M/D — 섹션 컨텍스트로 연도 보정
	if ctx != nil && ctx.inferredYear > 0 {
		m := freeDatePattern.FindStringSubmatch(s)
		if m != nil {
			month, _ := strconv.Atoi(m[1])
			day, _ := strconv.Atoi(m[2])
			if month >= 1 && month <= 12 && day >= 1 && day <= 31 {
				return fmt.Sprintf("%04d-%02d-%02d", ctx.inferredYear, month, day), s
			}
		}
	}
	return "", s
}

var topsolarSellerMap = map[string]string{
	"탑": "탑솔라", "탑솔라": "탑솔라",
	"디원": "디원",
	"화신": "화신이엔지", "화신이엔지": "화신이엔지",
}

func (h *ExternalSyncHandler) processTopsolarOutbound(src model.ExternalSyncSource, body []byte) (int, int, error) {
	f, err := excelize.OpenReader(bytes.NewReader(body))
	if err != nil {
		return 0, 0, fmt.Errorf("xlsx 파싱: %w", err)
	}
	defer f.Close()

	sheetName := f.GetSheetList()[0]
	rows, err := f.GetRows(sheetName)
	if err != nil {
		return 0, 0, fmt.Errorf("rows 읽기: %w", err)
	}

	// 마스터 캐시 — 매 행마다 SELECT 안 하도록 한 번에.
	companies, err := h.fetchCompaniesByCode()
	if err != nil {
		return 0, 0, fmt.Errorf("companies fetch: %w", err)
	}
	products, err := h.fetchProductsLookup()
	if err != nil {
		return 0, 0, fmt.Errorf("products fetch: %w", err)
	}
	warehouses, err := h.fetchWarehousesByCode()
	if err != nil {
		return 0, 0, fmt.Errorf("warehouses fetch: %w", err)
	}
	mfgIndex, err := h.fetchManufacturerIndex()
	if err != nil {
		log.Printf("[external sync] manufacturer index 조회 실패: %v — 추론 없이 등록", err)
		mfgIndex = map[string]string{}
	}
	orders, err := h.fetchOrdersByNumber()
	if err != nil {
		return 0, 0, fmt.Errorf("orders fetch: %w", err)
	}
	partners, err := h.fetchPartnerIndex()
	if err != nil {
		return 0, 0, fmt.Errorf("partners fetch: %w", err)
	}

	// D-059 PR 12 — 1차 패스: 섹션별 inferredYear 캐시 (자유 형식 날짜 보정용)
	sectionCtx := map[string]*sectionDateContext{}
	var scanSeller string
	var scanMonth int
	for _, row := range rows {
		cell0 := safeCell(row, 0)
		if s, mo := parseSectionMarkerForDate(cell0); s != "" {
			scanSeller, scanMonth = s, mo
			key := fmt.Sprintf("%s-%d", s, mo)
			if _, ok := sectionCtx[key]; !ok {
				sectionCtx[key] = &sectionDateContext{sellerKey: s, monthNum: mo}
			}
			continue
		}
		if scanSeller == "" || cell0 == "구분" || cell0 == "합 계" || cell0 == "합계" {
			continue
		}
		rawDate := safeCell(row, 1)
		if iso := parseTopsolarDate(rawDate); iso != "" && len(iso) >= 4 {
			if year, err := strconv.Atoi(iso[:4]); err == nil {
				key := fmt.Sprintf("%s-%d", scanSeller, scanMonth)
				if ctx, ok := sectionCtx[key]; ok && ctx.inferredYear == 0 {
					ctx.inferredYear = year
				}
			}
		}
	}

	imported := 0
	skipped := 0
	currentSection := ""
	var currentDateCtx *sectionDateContext
	skipBy := map[string]int{}  // D-059 PR 12: SKIP 사유별 카운트
	bump := func(k string) { skipBy[k]++; skipped++ }
	for idx, row := range rows {
		excelRowNum := idx + 1
		gubun := safeCell(row, 0)

		// 섹션 마커
		if s, mo := parseSectionMarkerForDate(gubun); s != "" {
			currentSection = s
			key := fmt.Sprintf("%s-%d", s, mo)
			currentDateCtx = sectionCtx[key]
			continue
		}
		if gubun == "구분" || gubun == "합 계" || gubun == "합계" {
			continue
		}
		productCode := safeCell(row, 6)
		qtyStr := safeCell(row, 7)
		if productCode == "" || qtyStr == "" {
			continue
		}

		seller := normalizeTopsolarSeller(gubun, currentSection)
		if seller == "" {
			bump("seller_unknown")
			continue
		}
		companyID, ok := companies[normalizeCorp(seller)]
		if !ok {
			newID, regErr := h.autoRegisterCompany(seller)
			if regErr != nil {
				log.Printf("[external sync] company 등록 실패 %s: %v", seller, regErr)
				bump("company_register_fail")
				continue
			}
			companyID = newID
			companies[normalizeCorp(seller)] = newID
		}
		pmeta, ok := products[normalizeCode(productCode)]
		if !ok {
			newID, wattage, regErr := h.autoRegisterProductWithWattage(productCode, mfgIndex)
			if regErr != nil {
				log.Printf("[external sync] product 등록 실패 %s: %v", productCode, regErr)
				bump("product_register_fail")
				continue
			}
			pmeta = productMeta{ID: newID, WattageKW: wattage}
			products[normalizeCode(productCode)] = pmeta
		}
		productID := pmeta.ID
		// 창고는 탑솔라 양식에 정보 없음 — 기본 창고 매핑은 마스터에 한 개만 있을 때 자동
		warehouseID := ""
		if src.DefaultWarehouseID != nil && *src.DefaultWarehouseID != "" {
			warehouseID = *src.DefaultWarehouseID
		} else {
			warehouseID = pickDefaultWarehouse(warehouses)
		}
		if warehouseID == "" {
			bump("warehouse_missing")
			continue
		}

		qty, err := strconv.Atoi(strings.ReplaceAll(qtyStr, ",", ""))
		if err != nil || qty <= 0 {
			bump("qty_invalid")
			continue
		}

		dateISO, dateRaw := parseTopsolarDateWithContext(safeCell(row, 1), currentDateCtx)
		if dateISO == "" {
			bump("date_freeform")
			continue
		}
		_ = dateRaw

		sourcePayload := map[string]interface{}{
			"source":           "google_sheet",
			"spreadsheet_id":   src.SpreadsheetID,
			"sheet_gid":        src.SheetGid,
			"sheet_row_index":  excelRowNum,
			"section":          currentSection,
			"date_raw":         dateRaw,
			"customer_name":    safeCell(row, 2),
			"site_name":        safeCell(row, 3),
			"site_address":     safeCell(row, 4),
			"order_number":     safeCell(row, 5),
			"unit_price_wp":    parseTopsolarNumber(safeCell(row, 10)),
			"supply_amount":    parseTopsolarNumber(safeCell(row, 11)),
			"vat_amount":       parseTopsolarNumber(safeCell(row, 12)),
			"total_amount":     parseTopsolarNumber(safeCell(row, 13)),
		}

		var capacityKW *float64
		if pmeta.WattageKW > 0 {
			v := float64(qty) * pmeta.WattageKW
			capacityKW = &v
		}

		// D-059 PR 14: customer + order 자동 매핑/등록
		rawCustomer := safeCell(row, 2)
		var customerID string
		if rawCustomer != "" {
			if id, ok := partners[normalizeCorp(rawCustomer)]; ok {
				customerID = id
			} else {
				newCustID, regErr := h.autoRegisterPartner(rawCustomer)
				if regErr != nil {
					log.Printf("[external sync] partner 등록 실패 %s: %v", rawCustomer, regErr)
				} else {
					customerID = newCustID
					partners[normalizeCorp(rawCustomer)] = newCustID
				}
			}
		}

		var orderIDPtr *string
		if customerID != "" {
			orderNumber := safeCell(row, 5)
			if orderNumber == "" {
				short := src.SpreadsheetID
				if len(short) > 8 {
					short = short[:8]
				}
				orderNumber = fmt.Sprintf("AUTO-%s-%d", short, excelRowNum)
			}
			if id, ok := orders[normalizeCode(orderNumber)]; ok {
				orderIDPtr = &id
			} else {
				unitPrice := parseTopsolarNumber(safeCell(row, 10))
				newOrderID, regErr := h.autoRegisterOrder(orderNumber, companyID, customerID, productID, qty, unitPrice, capacityKW, dateISO, optStr(safeCell(row, 3)), optStr(safeCell(row, 4)))
				if regErr != nil {
					log.Printf("[external sync] order 등록 실패 %s: %v", orderNumber, regErr)
				} else {
					orderIDPtr = &newOrderID
					orders[normalizeCode(orderNumber)] = newOrderID
				}
			}
		}
		req := model.CreateOutboundRequest{
			OutboundDate:   dateISO,
			CompanyID:      companyID,
			ProductID:      productID,
			Quantity:       qty,
			CapacityKw:     capacityKW,
			WarehouseID:    warehouseID,
			UsageCategory:  "sale",
			Status:         "active",
			OrderID:        orderIDPtr,
			SiteName:       optStr(safeCell(row, 3)),
			SiteAddress:    optStr(safeCell(row, 4)),
			SourcePayload:  sourcePayload,
		}

		_, _, err = h.DB.From("outbounds").Insert(req, false, "", "", "").Execute()
		if err != nil {
			if isUniqueViolation(err) {
				bump("dedup_already")
				continue
			}
			bump("outbound_insert_fail")
			log.Printf("[external sync] outbound INSERT 실패 row=%d: %v", excelRowNum, err)
			continue
		}
		imported++
	}
	if len(skipBy) > 0 {
		log.Printf("[external sync] SKIP 사유별: %v", skipBy)
	}
	return imported, skipped, nil
}


// D-059 PR 11
func (h *ExternalSyncHandler) fetchManufacturerIndex() (map[string]string, error) {
	data, _, err := h.DB.From("manufacturers").Select("manufacturer_id,name_kr,name_en,short_name", "exact", false).Execute()
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ManufacturerID string  `json:"manufacturer_id"`
		NameKR         string  `json:"name_kr"`
		NameEN         *string `json:"name_en"`
		ShortName      *string `json:"short_name"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	index := make(map[string]string, len(rows)*4)
	put := func(k, id string) {
		k = strings.ToLower(strings.TrimSpace(k))
		if k == "" {
			return
		}
		if _, exists := index[k]; !exists {
			index[k] = id
		}
	}
	for _, r := range rows {
		put(r.NameKR, r.ManufacturerID)
		if r.NameEN != nil {
			put(*r.NameEN, r.ManufacturerID)
			lower := strings.ToLower(*r.NameEN)
			for _, kw := range []string{"trina", "longi", "jinko", "risen", "hanwha", "qcell"} {
				if strings.Contains(lower, kw) {
					put(kw, r.ManufacturerID)
				}
			}
		}
		if r.ShortName != nil {
			put(*r.ShortName, r.ManufacturerID)
		}
	}
	return index, nil
}

func (h *ExternalSyncHandler) autoRegisterProduct(rawCode string, mfgIndex map[string]string) (string, error) {
	mfgID, wattageW := inferProductMeta(rawCode, mfgIndex)
	code := rawCode
	if len(code) > 30 {
		code = code[:30]
	}
	name := rawCode
	if len(name) > 100 {
		name = name[:100]
	}
	body := map[string]interface{}{
		"product_code": code,
		"product_name": name,
		"is_active":    true,
	}
	if mfgID != "" {
		body["manufacturer_id"] = mfgID
	}
	if wattageW > 0 {
		body["spec_wp"] = wattageW
		body["wattage_kw"] = float64(wattageW) / 1000.0
	}
	data, _, err := h.DB.From("products").Insert(body, false, "", "", "").Execute()
	if err != nil {
		return "", err
	}
	var rows []model.Product
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return "", fmt.Errorf("등록 결과 확인 실패")
	}
	log.Printf("[external sync] product 자동 등록: %s (mfg=%v, wattage=%dW)", rawCode, mfgID != "", wattageW)
	return rows[0].ProductID, nil
}


// D-059 PR 12: 신규 product 등록 + 추론한 wattage 반환 (capacity_kw 자동 계산용)
func (h *ExternalSyncHandler) autoRegisterProductWithWattage(rawCode string, mfgIndex map[string]string) (string, float64, error) {
	mfgID, wattageW := inferProductMeta(rawCode, mfgIndex)
	code := rawCode
	if len(code) > 30 {
		code = code[:30]
	}
	name := rawCode
	if len(name) > 100 {
		name = name[:100]
	}
	body := map[string]interface{}{
		"product_code": code,
		"product_name": name,
		"is_active":    true,
	}
	wattageKW := 0.0
	if mfgID != "" {
		body["manufacturer_id"] = mfgID
	}
	if wattageW > 0 {
		body["spec_wp"] = wattageW
		wattageKW = float64(wattageW) / 1000.0
		body["wattage_kw"] = wattageKW
	}
	data, _, err := h.DB.From("products").Insert(body, false, "", "", "").Execute()
	if err != nil {
		return "", 0, err
	}
	var rows []model.Product
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return "", 0, fmt.Errorf("등록 결과 확인 실패")
	}
	log.Printf("[external sync] product 자동 등록: %s (mfg=%v, wattage=%dW)", rawCode, mfgID != "", wattageW)
	return rows[0].ProductID, wattageKW, nil
}

func (h *ExternalSyncHandler) autoRegisterCompany(rawName string) (string, error) {
	hash := uint32(0)
	for _, r := range rawName {
		hash = hash*31 + uint32(r)
	}
	cleanedName := rawName
	if len(cleanedName) > 100 {
		cleanedName = cleanedName[:100]
	}
	prefix := []rune{}
	for _, r := range rawName {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || (r >= 0xAC00 && r <= 0xD7AF) {
			prefix = append(prefix, r)
			if len(prefix) >= 4 {
				break
			}
		}
	}
	if len(prefix) == 0 {
		prefix = []rune("AUTO")
	}
	code := string(prefix) + fmt.Sprintf("%06X", hash)[:6]
	if len(code) > 10 {
		code = code[:10]
	}
	body := map[string]interface{}{
		"company_name": cleanedName,
		"company_code": code,
		"is_active":    true,
	}
	data, _, err := h.DB.From("companies").Insert(body, false, "", "", "").Execute()
	if err != nil {
		return "", err
	}
	var rows []model.Company
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return "", fmt.Errorf("등록 결과 확인 실패")
	}
	log.Printf("[external sync] company 자동 등록: %s (code=%s)", rawName, code)
	return rows[0].CompanyID, nil
}


// D-059 PR 14: 수주(orders) 마스터 인덱스 — order_number 정규화 키 → order_id
func (h *ExternalSyncHandler) fetchOrdersByNumber() (map[string]string, error) {
	data, _, err := h.DB.From("orders").Select("order_id,order_number", "exact", false).Execute()
	if err != nil {
		return nil, err
	}
	var rows []struct {
		OrderID     string  `json:"order_id"`
		OrderNumber *string `json:"order_number"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows))
	for _, r := range rows {
		if r.OrderNumber != nil && *r.OrderNumber != "" {
			out[normalizeCode(*r.OrderNumber)] = r.OrderID
		}
	}
	return out, nil
}

// D-059 PR 14: partner_id (customer) 인덱스 — 정규화된 거래처명 → partner_id (alias 사전 머지)
func (h *ExternalSyncHandler) fetchPartnerIndex() (map[string]string, error) {
	data, _, err := h.DB.From("partners").Select("partner_id,partner_name", "exact", false).Execute()
	if err != nil {
		return nil, err
	}
	var rows []struct {
		PartnerID   string `json:"partner_id"`
		PartnerName string `json:"partner_name"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows)*2)
	for _, r := range rows {
		out[normalizeCorp(r.PartnerName)] = r.PartnerID
	}
	// alias 사전 머지
	aliasData, _, err := h.DB.From("partner_aliases").Select("canonical_partner_id,alias_text_normalized", "exact", false).Execute()
	if err == nil {
		var aliases []model.PartnerAlias
		if json.Unmarshal(aliasData, &aliases) == nil {
			for _, a := range aliases {
				if _, exists := out[a.AliasTextNormalized]; !exists {
					out[a.AliasTextNormalized] = a.CanonicalPartnerID
				}
			}
		}
	}
	delete(out, "")
	return out, nil
}

// D-059 PR 14: 거래처(customer) 자동 등록
func (h *ExternalSyncHandler) autoRegisterPartner(rawName string) (string, error) {
	name := rawName
	if len(name) > 100 {
		name = name[:100]
	}
	body := map[string]interface{}{
		"partner_name": name,
		"partner_type": "customer",
		"is_active":    true,
	}
	data, _, err := h.DB.From("partners").Insert(body, false, "", "", "").Execute()
	if err != nil {
		return "", err
	}
	var rows []model.Partner
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return "", fmt.Errorf("등록 결과 확인 실패")
	}
	log.Printf("[external sync] partner 자동 등록: %s (customer)", rawName)
	return rows[0].PartnerID, nil
}

// D-059 PR 14: 수주 자동 등록
//   defaults — receipt_method=purchase_order, management_category=sale, fulfillment_source=stock
func (h *ExternalSyncHandler) autoRegisterOrder(orderNumber, companyID, customerID, productID string, qty int, unitPriceWp float64, capacityKW *float64, orderDate string, siteName, siteAddress *string) (string, error) {
	body := map[string]interface{}{
		"order_number":        orderNumber,
		"company_id":          companyID,
		"customer_id":         customerID,
		"product_id":          productID,
		"quantity":            qty,
		"unit_price_wp":       unitPriceWp,
		"order_date":          orderDate,
		"receipt_method":      "purchase_order",
		"management_category": "sale",
		"fulfillment_source":  "stock",
		"status":              "completed",
	}
	if capacityKW != nil {
		body["capacity_kw"] = *capacityKW
	}
	if siteName != nil && *siteName != "" {
		body["site_name"] = *siteName
	}
	if siteAddress != nil && *siteAddress != "" {
		body["site_address"] = *siteAddress
	}
	data, _, err := h.DB.From("orders").Insert(body, false, "", "", "").Execute()
	if err != nil {
		return "", err
	}
	var rows []model.Order
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return "", fmt.Errorf("등록 결과 확인 실패")
	}
	log.Printf("[external sync] order 자동 등록: %s (qty=%d, unit=%.0f)", orderNumber, qty, unitPriceWp)
	return rows[0].OrderID, nil
}

// ──────────────── 변환 보조 ────────────────

func safeCell(row []string, idx int) string {
	if idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

func parseTopsolarSection(s string) string {
	// "탑솔라 (1월)", "디원 (2월)", "화신이엔지 (3월)" → '탑솔라' / '디원' / '화신이엔지'
	if !strings.Contains(s, "(") || !strings.Contains(s, "월") {
		return ""
	}
	for _, k := range []string{"탑솔라", "디원", "화신이엔지"} {
		if strings.HasPrefix(s, k) {
			return k
		}
	}
	return ""
}

func normalizeTopsolarSeller(gubun, section string) string {
	for _, t := range strings.FieldsFunc(gubun, func(r rune) bool { return r == '/' }) {
		t = strings.TrimSpace(t)
		if v, ok := topsolarSellerMap[t]; ok {
			return v
		}
		for k, v := range topsolarSellerMap {
			if strings.HasPrefix(t, k) {
				return v
			}
		}
	}
	if v, ok := topsolarSellerMap[section]; ok {
		return v
	}
	return ""
}

// normalizeCode — 비교용 정규화: 영숫자(대문자) + 한글 음절/자모 + CJK 한자 보존,
// 공백·하이픈·괄호·점·쉼표·㈜ 같은 표기 변형은 모두 제거.
// (D-059 PR 10: 한글 회사명/품번 매칭이 빈 문자열이 되어 모두 SKIP되던 문제 해결.)
func normalizeCode(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r >= 'a' && r <= 'z':
			b.WriteRune(r - 32)
		case r >= 0xAC00 && r <= 0xD7AF: // 한글 음절
			b.WriteRune(r)
		case r >= 0x3131 && r <= 0x318F: // 한글 자모
			b.WriteRune(r)
		case r >= 0x4E00 && r <= 0x9FFF: // CJK 한자
			b.WriteRune(r)
		}
	}
	return b.String()
}

// normalizeCorp — 회사·거래처명 정규화: normalizeCode 와 같지만 ㈜·(주)·(株)·(유) 등
// 법인 약칭을 미리 제거해서 alias 사전(공통 정규화 키 사용)과 호환.
func normalizeCorp(s string) string {
	for _, t := range []string{"(주)", "㈜", "주식회사", "(株)", "(유)", "(합)"} {
		s = strings.ReplaceAll(s, t, "")
	}
	return normalizeCode(s)
}


// 자동 모드 단순화: ISO 날짜 (YYYY-MM-DD) 또는 한국 표기 ("2026. 1. 3" / "2026-01-03") 만 인식.
// 자유 형식 ("1/12 오후착") 은 SKIP (수동 모드에서 보정).
func parseTopsolarDate(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 10 && s[4] == '-' && s[7] == '-' {
		return s[:10]
	}
	// "2026. 1. 3" 형식
	parts := strings.Split(s, ".")
	if len(parts) >= 3 {
		y := strings.TrimSpace(parts[0])
		m := strings.TrimSpace(parts[1])
		d := strings.TrimSpace(parts[2])
		if len(y) == 4 && len(m) >= 1 && len(d) >= 1 {
			if len(m) == 1 {
				m = "0" + m
			}
			if len(d) == 1 {
				d = "0" + d
			}
			return fmt.Sprintf("%s-%s-%s", y, m, d)
		}
	}
	return ""
}

func parseTopsolarNumber(s string) float64 {
	s = strings.ReplaceAll(strings.TrimSpace(s), ",", "")
	if s == "" {
		return 0
	}
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

func optStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func pickDefaultWarehouse(warehouses map[string]string) string {
	// 자동 모드 임시 정책: warehouses 가 정확히 하나면 그것 채택. 둘 이상이면 SKIP (모호).
	if len(warehouses) == 1 {
		for _, id := range warehouses {
			return id
		}
	}
	return ""
}

func (h *ExternalSyncHandler) fetchCompaniesByCode() (map[string]string, error) {
	data, _, err := h.DB.From("companies").Select("company_id,company_code,company_name", "exact", false).Execute()
	if err != nil {
		return nil, err
	}
	var rows []model.Company
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows)*2)
	for _, c := range rows {
		out[normalizeCorp(c.CompanyCode)] = c.CompanyID
		out[normalizeCorp(c.CompanyName)] = c.CompanyID
	}
	// alias 사전 머지 (D-059 PR 10) — 수동 모드에서 학습된 매핑을 자동 모드도 활용
	aliasData, _, err := h.DB.From("company_aliases").Select("canonical_company_id,alias_text_normalized", "exact", false).Execute()
	if err == nil {
		var aliases []model.CompanyAlias
		if json.Unmarshal(aliasData, &aliases) == nil {
			for _, a := range aliases {
				if _, exists := out[a.AliasTextNormalized]; !exists {
					out[a.AliasTextNormalized] = a.CanonicalCompanyID
				}
			}
		}
	}
	delete(out, "")
	return out, nil
}


// D-059 PR 12: product_code → (product_id, wattage_kw) 인덱스. capacity_kw 자동 계산용.
type productMeta struct {
	ID         string
	WattageKW  float64
}

func (h *ExternalSyncHandler) fetchProductsLookup() (map[string]productMeta, error) {
	data, _, err := h.DB.From("products").Select("product_id,product_code,wattage_kw", "exact", false).Execute()
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ProductID  string   `json:"product_id"`
		ProductCode string  `json:"product_code"`
		WattageKW  *float64 `json:"wattage_kw"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	out := make(map[string]productMeta, len(rows))
	for _, p := range rows {
		w := 0.0
		if p.WattageKW != nil {
			w = *p.WattageKW
		}
		out[normalizeCode(p.ProductCode)] = productMeta{ID: p.ProductID, WattageKW: w}
	}
	// alias 사전 머지
	aliasData, _, err := h.DB.From("product_aliases").Select("canonical_product_id,alias_code_normalized", "exact", false).Execute()
	if err == nil {
		var aliases []model.ProductAlias
		if json.Unmarshal(aliasData, &aliases) == nil {
			// canonical_product_id → wattage_kw 룩업 보조 맵
			wByID := make(map[string]float64, len(rows))
			for _, p := range rows {
				if p.WattageKW != nil {
					wByID[p.ProductID] = *p.WattageKW
				}
			}
			for _, a := range aliases {
				if _, exists := out[a.AliasCodeNormalized]; !exists {
					out[a.AliasCodeNormalized] = productMeta{
						ID:        a.CanonicalProductID,
						WattageKW: wByID[a.CanonicalProductID],
					}
				}
			}
		}
	}
	delete(out, "")
	return out, nil
}

func (h *ExternalSyncHandler) fetchProductsByCode() (map[string]string, error) {
	data, _, err := h.DB.From("products").Select("product_id,product_code", "exact", false).Execute()
	if err != nil {
		return nil, err
	}
	var rows []model.Product
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows))
	for _, p := range rows {
		out[normalizeCode(p.ProductCode)] = p.ProductID
	}
	// alias 사전 머지 (D-059 PR 10)
	aliasData, _, err := h.DB.From("product_aliases").Select("canonical_product_id,alias_code_normalized", "exact", false).Execute()
	if err == nil {
		var aliases []model.ProductAlias
		if json.Unmarshal(aliasData, &aliases) == nil {
			for _, a := range aliases {
				if _, exists := out[a.AliasCodeNormalized]; !exists {
					out[a.AliasCodeNormalized] = a.CanonicalProductID
				}
			}
		}
	}
	delete(out, "")
	return out, nil
}

func (h *ExternalSyncHandler) fetchWarehousesByCode() (map[string]string, error) {
	data, _, err := h.DB.From("warehouses").Select("warehouse_id,warehouse_code,warehouse_name", "exact", false).Execute()
	if err != nil {
		return nil, err
	}
	var rows []model.Warehouse
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows))
	for _, w := range rows {
		out[normalizeCode(w.WarehouseCode)] = w.WarehouseID
	}
	return out, nil
}
