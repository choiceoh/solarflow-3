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
	products, err := h.fetchProductsByCode()
	if err != nil {
		return 0, 0, fmt.Errorf("products fetch: %w", err)
	}
	warehouses, err := h.fetchWarehousesByCode()
	if err != nil {
		return 0, 0, fmt.Errorf("warehouses fetch: %w", err)
	}

	imported := 0
	skipped := 0
	currentSection := ""
	for idx, row := range rows {
		excelRowNum := idx + 1
		gubun := safeCell(row, 0)

		// 섹션 마커
		if section := parseTopsolarSection(gubun); section != "" {
			currentSection = section
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
			skipped++
			continue
		}
		companyID, ok := companies[normalizeCorp(seller)]
		if !ok {
			skipped++
			continue
		}
		productID, ok := products[normalizeCode(productCode)]
		if !ok {
			// 자동 모드는 신규 product 등록 안 함 — SKIP
			skipped++
			continue
		}
		// 창고는 탑솔라 양식에 정보 없음 — 기본 창고 매핑은 마스터에 한 개만 있을 때 자동
		warehouseID := ""
		if src.DefaultWarehouseID != nil && *src.DefaultWarehouseID != "" {
			warehouseID = *src.DefaultWarehouseID
		} else {
			warehouseID = pickDefaultWarehouse(warehouses)
		}
		if warehouseID == "" {
			skipped++
			continue
		}

		qty, err := strconv.Atoi(strings.ReplaceAll(qtyStr, ",", ""))
		if err != nil || qty <= 0 {
			skipped++
			continue
		}

		dateISO := parseTopsolarDate(safeCell(row, 1))
		if dateISO == "" {
			// 자동 모드는 자유 형식 날짜 보정 안 함 (수동 모드만) — SKIP
			skipped++
			continue
		}

		sourcePayload := map[string]interface{}{
			"source":           "google_sheet",
			"spreadsheet_id":   src.SpreadsheetID,
			"sheet_gid":        src.SheetGid,
			"sheet_row_index":  excelRowNum,
			"section":          currentSection,
			"customer_name":    safeCell(row, 2),
			"site_name":        safeCell(row, 3),
			"site_address":     safeCell(row, 4),
			"order_number":     safeCell(row, 5),
			"unit_price_wp":    parseTopsolarNumber(safeCell(row, 10)),
			"supply_amount":    parseTopsolarNumber(safeCell(row, 11)),
			"vat_amount":       parseTopsolarNumber(safeCell(row, 12)),
			"total_amount":     parseTopsolarNumber(safeCell(row, 13)),
		}

		req := model.CreateOutboundRequest{
			OutboundDate:   dateISO,
			CompanyID:      companyID,
			ProductID:      productID,
			Quantity:       qty,
			WarehouseID:    warehouseID,
			UsageCategory:  "sale",
			Status:         "active",
			SiteName:       optStr(safeCell(row, 3)),
			SiteAddress:    optStr(safeCell(row, 4)),
			SourcePayload:  sourcePayload,
		}

		_, _, err = h.DB.From("outbounds").Insert(req, false, "", "", "").Execute()
		if err != nil {
			if isUniqueViolation(err) {
				// dedup index 충돌 — 이미 동기화된 행. idempotent skip.
				skipped++
				continue
			}
			skipped++
			log.Printf("[external sync] outbound INSERT 실패 row=%d: %v", excelRowNum, err)
			continue
		}
		imported++
	}
	return imported, skipped, nil
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
