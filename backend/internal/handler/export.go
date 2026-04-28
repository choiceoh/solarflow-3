package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	supa "github.com/supabase-community/supabase-go"
	"github.com/xuri/excelize/v2"

	"solarflow-backend/internal/response"
)

// ExportHandler — 아마란스10 ERP 내보내기 핸들러
// 비유: "ERP 양식 변환기" — DB 데이터를 아마란스 양식 .xlsx로 변환
// TODO: Phase 확장(D-067) — 아마란스 매출마감 실물 양식 확보 후 sales 내보내기 구현.
type ExportHandler struct {
	DB *supa.Client
}

// NewExportHandler — ExportHandler 생성자
func NewExportHandler(db *supa.Client) *ExportHandler {
	return &ExportHandler{DB: db}
}

// AmaranthSalesClosing — GET /api/v1/export/amaranth/sales
// 비유: 매출마감 양식은 아직 실물 서식이 없어 닫힌 접수창으로 명확히 안내
func (h *ExportHandler) AmaranthSalesClosing(w http.ResponseWriter, r *http.Request) {
	response.RespondError(w, http.StatusNotImplemented, "아마란스 매출마감 내보내기는 D-067에 따라 실물 양식 확인 후 구현합니다")
}

// --- 입고 34컬럼 헤더 ---

var inboundHeaders = []string{
	"거래구분", "입고일자", "거래처코드", "환종", "환율",
	"과세구분", "단가구분", "창고코드", "담당자코드", "비고(건)",
	"품번", "입고수량", "재고단위수량", "단가유형", "부가세미포함단가",
	"부가세포함단가", "공급가", "부가세", "합계액", "외화단가",
	"외화금액", "장소코드", "LOT번호", "관리구분", "프로젝트코드",
	"비고(내역)", "발주번호", "발주순번", "수입선적번호", "수입선적순번",
	"입고의뢰번호", "입고의뢰순번", "입고검사번호", "입고검사순번",
}

var inboundERPCodes = []string{
	"PO_FG", "RCV_DT", "TR_CD", "EXCH_CD", "EXCH_RT",
	"VAT_FG", "UMVAT_FG", "WH_CD", "PLN_CD", "REMARK_DC",
	"ITEM_CD", "PO_QT", "RCV_QT", "UM_FG", "RCV_UM",
	"VAT_UM", "RCVG_AM", "RCVV_AM", "RCVH_AM", "EXCH_UM",
	"EXCH_AM", "LC_CD", "LOT_NB", "MGMT_CD", "PJT_CD",
	"REMARKD_DC", "PO_NB", "PO_SQ", "IBL_NB", "IBL_SQ",
	"REQ_NB", "REQ_SQ", "QC_NB", "QC_SQ",
}

// --- 출고 35컬럼 헤더 ---

var outboundHeaders = []string{
	"거래구분", "출고일자", "고객코드", "환종", "환율",
	"과세구분", "단가구분", "창고코드", "담당자코드", "비고(건)",
	"품번", "출고수량", "재고단위수량", "단가유형", "부가세미포함단가",
	"부가세포함단가", "공급가", "부가세", "합계액", "장소코드",
	"관리구분", "프로젝트코드", "비고(내역)", "납품처코드", "지역",
	"외화단가", "외화금액", "배송방법", "LOT번호", "주문번호",
	"주문순번", "출고의뢰번호", "출고의뢰순번", "출고검사번호", "출고검사순번",
}

var outboundERPCodes = []string{
	"SO_FG", "ISU_DT", "TR_CD", "EXCH_CD", "EXCH_RT",
	"VAT_FG", "UMVAT_FG", "WH_CD", "PLN_CD", "REMARK_DC",
	"ITEM_CD", "SO_QT", "ISU_QT", "UM_FG", "ISU_UM",
	"VAT_UM", "ISUG_AM", "ISUV_AM", "ISUH_AM", "LC_CD",
	"MGMT_CD", "PJT_CD", "REMARK_DC_D", "SHIP_CD", "AREA_CD",
	"EXCH_UM", "EXCH_AM", "SHIP_FG", "LOT_NB", "SO_NB",
	"SO_SQ", "REQ_NB", "REQ_SQ", "QC_NB", "QC_SQ",
}

// --- 입고 내보내기 구조체 (DB 조회용) ---

type inboundExportRow struct {
	// bl_shipments
	BLNumber      string   `json:"bl_number"`
	InboundType   string   `json:"inbound_type"`
	Currency      string   `json:"currency"`
	ExchangeRate  *float64 `json:"exchange_rate"`
	ETA           *string  `json:"eta"`
	ActualArrival *string  `json:"actual_arrival"`
	POID          *string  `json:"po_id"`
	Memo          *string  `json:"memo"`

	// bl_line_items (nested)
	BLLineID         string   `json:"bl_line_id"`
	ProductID        string   `json:"product_id"`
	Quantity         int      `json:"quantity"`
	InvoiceAmountUSD *float64 `json:"invoice_amount_usd"`
	UnitPriceUSDWp   *float64 `json:"unit_price_usd_wp"`
	UnitPriceKRWWp   *float64 `json:"unit_price_krw_wp"`
	LineMemo         *string  `json:"line_memo"`

	// joined
	Products      *inboundProductJoin      `json:"products"`
	Warehouses    *inboundWarehouseJoin    `json:"warehouses"`
	Manufacturers *inboundManufacturerJoin `json:"manufacturers"`
}

type inboundProductJoin struct {
	ProductCode string `json:"product_code"`
	SpecWP      int    `json:"spec_wp"`
}

type inboundWarehouseJoin struct {
	WarehouseCode string `json:"warehouse_code"`
	LocationCode  string `json:"location_code"`
}

type inboundManufacturerJoin struct {
	NameKR string `json:"name_kr"`
}

// --- 출고 내보내기 구조체 (DB 조회용) ---

type outboundExportRow struct {
	OutboundID   string                 `json:"outbound_id"`
	OutboundDate string                 `json:"outbound_date"`
	Quantity     int                    `json:"quantity"`
	SiteName     *string                `json:"site_name"`
	Memo         *string                `json:"memo"`
	Products     *outboundProductJoin   `json:"products"`
	Warehouses   *outboundWarehouseJoin `json:"warehouses"`
}

type outboundProductJoin struct {
	ProductCode string `json:"product_code"`
}

type outboundWarehouseJoin struct {
	WarehouseCode string `json:"warehouse_code"`
	LocationCode  string `json:"location_code"`
}

// saleForOutbound — 출고에 연결된 매출 정보
type saleForOutbound struct {
	OutboundID   string   `json:"outbound_id"`
	CustomerID   string   `json:"customer_id"`
	UnitPriceEa  *float64 `json:"unit_price_ea"`
	SupplyAmount *float64 `json:"supply_amount"`
	VatAmount    *float64 `json:"vat_amount"`
	TotalAmount  *float64 `json:"total_amount"`
}

// partnerERP — 거래처 ERP 코드 조회용
type partnerERP struct {
	PartnerID   string  `json:"partner_id"`
	PartnerName string  `json:"partner_name"`
	ERPCode     *string `json:"erp_code"`
}

// poForExport — PO 번호 조회용
type poForExport struct {
	POID     string  `json:"po_id"`
	PONumber *string `json:"po_number"`
}

// blShipmentForExport — 입고 내보내기용 B/L 조회 구조체
type blShipmentForExport struct {
	BLID           string   `json:"bl_id"`
	BLNumber       string   `json:"bl_number"`
	InboundType    string   `json:"inbound_type"`
	Currency       string   `json:"currency"`
	ExchangeRate   *float64 `json:"exchange_rate"`
	ETA            *string  `json:"eta"`
	ActualArrival  *string  `json:"actual_arrival"`
	POID           *string  `json:"po_id"`
	Memo           *string  `json:"memo"`
	ManufacturerID string   `json:"manufacturer_id"`
	WarehouseID    *string  `json:"warehouse_id"`
	CompanyID      string   `json:"company_id"`
}

// --- 유틸리티 ---

// formatDate — YYYY-MM-DD → YYYYMMDD (하이픈 제거)
func formatDate(d *string) string {
	if d == nil || *d == "" {
		return ""
	}
	return strings.ReplaceAll(*d, "-", "")
}

// ptrStr — *string → string (nil 안전)
func ptrStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// ptrFloat — *float64 → float64 (nil 안전)
func ptrFloat(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}

// buildRemark — 비고 조합 (최대 60자)
func buildRemark(parts ...string) string {
	var nonEmpty []string
	for _, p := range parts {
		if p != "" {
			nonEmpty = append(nonEmpty, p)
		}
	}
	result := strings.Join(nonEmpty, " / ")
	runes := []rune(result)
	if len(runes) > 60 {
		return string(runes[:60])
	}
	return result
}

// colName — 0-based 인덱스 → 엑셀 열 이름 (A, B, ..., Z, AA, ...)
func colName(idx int) string {
	name := ""
	for {
		name = string(rune('A'+idx%26)) + name
		idx = idx/26 - 1
		if idx < 0 {
			break
		}
	}
	return name
}

// writeHeaders — 행1 한글헤더, 행2 ERP코드 작성
func writeHeaders(f *excelize.File, sheet string, headers []string, erpCodes []string) {
	for i, h := range headers {
		col := colName(i)
		f.SetCellValue(sheet, fmt.Sprintf("%s1", col), h)
		if i < len(erpCodes) && erpCodes[i] != "" {
			f.SetCellValue(sheet, fmt.Sprintf("%s2", col), erpCodes[i])
		}
	}
}

// AmaranthInbound — GET /api/v1/export/amaranth/inbound
// 비유: 입고 데이터를 아마란스10 양식 .xlsx로 변환하여 다운로드
func (h *ExportHandler) AmaranthInbound(w http.ResponseWriter, r *http.Request) {
	companyID := r.URL.Query().Get("company_id")
	fromDate := r.URL.Query().Get("from")
	toDate := r.URL.Query().Get("to")

	// bl_shipments 조회 (completed/erp_done, 기간 필터)
	query := h.DB.From("bl_shipments").
		Select("bl_id, bl_number, inbound_type, currency, exchange_rate, eta, actual_arrival, po_id, memo, manufacturer_id, warehouse_id, company_id", "exact", false)

	// status 필터: completed 또는 erp_done
	query = query.In("status", []string{"completed", "erp_done"})

	if companyID != "" && companyID != "all" {
		query = query.Eq("company_id", companyID)
	}

	blData, _, err := query.Execute()
	if err != nil {
		log.Printf("[아마란스 입고 내보내기] B/L 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "B/L 조회에 실패했습니다")
		return
	}

	var shipments []blShipmentForExport
	if err := json.Unmarshal(blData, &shipments); err != nil {
		log.Printf("[아마란스 입고 내보내기] B/L 디코딩 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "데이터 처리에 실패했습니다")
		return
	}

	// 날짜 범위 필터 (actual_arrival 또는 eta 기준)
	var filteredBLs []blShipmentForExport
	for _, bl := range shipments {
		dateStr := ""
		if bl.ActualArrival != nil && *bl.ActualArrival != "" {
			dateStr = *bl.ActualArrival
		} else if bl.ETA != nil && *bl.ETA != "" {
			dateStr = *bl.ETA
		}
		if fromDate != "" && dateStr < fromDate {
			continue
		}
		if toDate != "" && dateStr > toDate {
			continue
		}
		filteredBLs = append(filteredBLs, bl)
	}

	// B/L ID 목록 수집
	blIDs := make([]string, 0, len(filteredBLs))
	blMap := make(map[string]blShipmentForExport)
	for _, bl := range filteredBLs {
		if bl.BLID != "" {
			blIDs = append(blIDs, bl.BLID)
			blMap[bl.BLID] = bl
		}
	}

	// 라인아이템 조회
	type lineItem struct {
		BLLineID         string              `json:"bl_line_id"`
		BLID             string              `json:"bl_id"`
		ProductID        string              `json:"product_id"`
		Quantity         int                 `json:"quantity"`
		InvoiceAmountUSD *float64            `json:"invoice_amount_usd"`
		UnitPriceUSDWp   *float64            `json:"unit_price_usd_wp"`
		UnitPriceKRWWp   *float64            `json:"unit_price_krw_wp"`
		Memo             *string             `json:"memo"`
		Products         *inboundProductJoin `json:"products"`
	}

	var allLines []lineItem
	if len(blIDs) > 0 {
		lineQuery := h.DB.From("bl_line_items").
			Select("bl_line_id, bl_id, product_id, quantity, invoice_amount_usd, unit_price_usd_wp, unit_price_krw_wp, memo, products(product_code, spec_wp)", "exact", false).
			In("bl_id", blIDs)

		lineData, _, err := lineQuery.Execute()
		if err != nil {
			log.Printf("[아마란스 입고 내보내기] 라인아이템 조회 실패: %v", err)
			response.RespondError(w, http.StatusInternalServerError, "라인아이템 조회에 실패했습니다")
			return
		}
		if err := json.Unmarshal(lineData, &allLines); err != nil {
			log.Printf("[아마란스 입고 내보내기] 라인아이템 디코딩 실패: %v", err)
			response.RespondError(w, http.StatusInternalServerError, "데이터 처리에 실패했습니다")
			return
		}
	}

	// 창고 정보 맵
	whMap, err := h.loadWarehouseMap()
	if err != nil {
		log.Printf("[아마란스 입고 내보내기] 창고 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "창고 조회에 실패했습니다")
		return
	}

	// 거래처 ERP 코드 맵 (partner_name → erp_code)
	partnerMap, err := h.loadPartnerERPMap()
	if err != nil {
		log.Printf("[아마란스 입고 내보내기] 거래처 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 조회에 실패했습니다")
		return
	}

	// 제조사 맵 (manufacturer_id → name_kr)
	mfgMap, err := h.loadManufacturerMap()
	if err != nil {
		log.Printf("[아마란스 입고 내보내기] 제조사 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "제조사 조회에 실패했습니다")
		return
	}

	// PO 번호 맵 (po_id → po_number)
	poMap, err := h.loadPOMap()
	if err != nil {
		log.Printf("[아마란스 입고 내보내기] PO 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "PO 조회에 실패했습니다")
		return
	}

	// 원가 데이터 맵 (product_id → cif_wp_krw) — import 유형의 원가 단가 조회용
	// cost_details에서 가져옴
	cifMap, err := h.loadCIFMap(blIDs)
	if err != nil {
		log.Printf("[아마란스 입고 내보내기] 원가 조회 실패: %v", err)
		// 원가 없어도 계속 진행 (빈값 처리)
		cifMap = make(map[string]float64)
	}

	// 엑셀 생성
	f := excelize.NewFile()
	sheet := "Sheet1"
	writeHeaders(f, sheet, inboundHeaders, inboundERPCodes)

	row := 3
	for _, bl := range filteredBLs {
		blID := bl.BLID
		inboundType := bl.InboundType
		currency := bl.Currency
		blNumber := bl.BLNumber
		blMemo := ptrStr(bl.Memo)
		mfgID := bl.ManufacturerID
		whID := ptrStr(bl.WarehouseID)
		poID := ptrStr(bl.POID)

		// 날짜: actual_arrival 우선, 없으면 eta
		var datePtr *string
		if bl.ActualArrival != nil && *bl.ActualArrival != "" {
			datePtr = bl.ActualArrival
		} else if bl.ETA != nil && *bl.ETA != "" {
			datePtr = bl.ETA
		}

		exchangeRate := ptrFloat(bl.ExchangeRate)
		if currency == "KRW" {
			exchangeRate = 1
		}

		// 거래구분
		tradeType := "0"
		if inboundType == "import" {
			tradeType = "3"
		}

		// 과세구분
		vatType := "0"
		if inboundType == "import" {
			vatType = "1"
		}

		// 거래처코드: 제조사 이름 → partners erp_code
		mfgName := mfgMap[mfgID]
		trCode := partnerMap[mfgName]

		// 창고
		whCode := ""
		lcCode := ""
		if wh, ok := whMap[whID]; ok {
			whCode = wh.warehouseCode
			lcCode = wh.locationCode
		}

		// PO 번호
		poNumber := ""
		if poID != "" {
			poNumber = poMap[poID]
		}

		// 라인 순번
		lineSeq := 0
		for _, line := range allLines {
			if line.BLID != blID {
				continue
			}
			lineSeq++

			productCode := ""
			specWP := 0
			if line.Products != nil {
				productCode = line.Products.ProductCode
				specWP = line.Products.SpecWP
			}

			// 단가 계산
			var unitPriceKRW float64
			if inboundType == "import" {
				// import: cif_wp_krw * spec_wp
				cifWpKrw := cifMap[line.ProductID]
				unitPriceKRW = cifWpKrw * float64(specWP)
			} else {
				// domestic: unit_price_krw_wp * spec_wp
				unitPriceKRW = ptrFloat(line.UnitPriceKRWWp) * float64(specWP)
			}

			// 부가세포함단가
			vatUM := unitPriceKRW * 1.1
			if inboundType == "import" {
				vatUM = unitPriceKRW // 수입 영세
			}

			qty := float64(line.Quantity)
			supplyAmt := qty * unitPriceKRW
			vatAmt := 0.0
			if inboundType != "import" {
				vatAmt = supplyAmt * 0.1
			}
			totalAmt := supplyAmt + vatAmt

			// 외화단가 (USD/EA)
			exchUM := ptrFloat(line.UnitPriceUSDWp) * float64(specWP)

			seqStr := fmt.Sprintf("%d", lineSeq)
			remark := buildRemark(blNumber, blMemo)
			lineRemark := ptrStr(line.Memo)

			// 34컬럼 기록
			cells := []interface{}{
				tradeType,                       // A 거래구분
				formatDate(datePtr),             // B 입고일자
				trCode,                          // C 거래처코드
				currency,                        // D 환종
				exchangeRate,                    // E 환율
				vatType,                         // F 과세구분
				"0",                             // G 단가구분
				whCode,                          // H 창고코드
				"",                              // I 담당자코드
				remark,                          // J 비고(건)
				productCode,                     // K 품번
				line.Quantity,                   // L 입고수량
				line.Quantity,                   // M 재고단위수량
				"",                              // N 단가유형
				unitPriceKRW,                    // O 부가세미포함단가
				vatUM,                           // P 부가세포함단가
				supplyAmt,                       // Q 공급가
				vatAmt,                          // R 부가세
				totalAmt,                        // S 합계액
				exchUM,                          // T 외화단가
				ptrFloat(line.InvoiceAmountUSD), // U 외화금액
				lcCode,                          // V 장소코드
				"",                              // W LOT번호
				"",                              // X 관리구분 (D-068)
				"",                              // Y 프로젝트코드
				lineRemark,                      // Z 비고(내역)
				poNumber,                        // AA 발주번호
				seqStr,                          // AB 발주순번
				blNumber,                        // AC 수입선적번호
				seqStr,                          // AD 수입선적순번
				"", "", "", "",                  // AE~AH 입고의뢰/입고검사 번호·순번
			}

			for ci, val := range cells {
				cell := fmt.Sprintf("%s%d", colName(ci), row)
				if err := f.SetCellValue(sheet, cell, val); err != nil {
					log.Printf("[아마란스 입고] 셀 %s 값 설정 실패: %v", cell, err)
				}
			}
			row++
		}
	}

	// 파일 전송
	today := time.Now().Format("20060102")
	fileName := fmt.Sprintf("amaranth_inbound_%s.xlsx", today)

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", fileName))

	if _, err := f.WriteTo(w); err != nil {
		log.Printf("[아마란스 입고 내보내기] 파일 전송 실패: %v", err)
	}
}

// AmaranthOutbound — GET /api/v1/export/amaranth/outbound
// 비유: 출고 데이터를 아마란스10 양식 .xlsx로 변환하여 다운로드
func (h *ExportHandler) AmaranthOutbound(w http.ResponseWriter, r *http.Request) {
	companyID := r.URL.Query().Get("company_id")
	fromDate := r.URL.Query().Get("from")
	toDate := r.URL.Query().Get("to")

	// outbounds 조회 (status=active, 기간 필터)
	query := h.DB.From("outbounds").
		Select("outbound_id, outbound_date, quantity, site_name, memo, products(product_code), warehouses(warehouse_code, location_code)", "exact", false).
		Eq("status", "active")

	if companyID != "" && companyID != "all" {
		query = query.Eq("company_id", companyID)
	}
	if fromDate != "" {
		query = query.Gte("outbound_date", fromDate)
	}
	if toDate != "" {
		query = query.Lte("outbound_date", toDate)
	}

	outData, _, err := query.Execute()
	if err != nil {
		log.Printf("[아마란스 출고 내보내기] 출고 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 조회에 실패했습니다")
		return
	}

	var outbounds []outboundExportRow
	if err := json.Unmarshal(outData, &outbounds); err != nil {
		log.Printf("[아마란스 출고 내보내기] 출고 디코딩 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "데이터 처리에 실패했습니다")
		return
	}

	// 매출 데이터 조회 (outbound_id → sale)
	obIDs := make([]string, 0, len(outbounds))
	for _, ob := range outbounds {
		obIDs = append(obIDs, ob.OutboundID)
	}

	saleMap := make(map[string]saleForOutbound)
	if len(obIDs) > 0 {
		saleData, _, err := h.DB.From("sales").
			Select("outbound_id, customer_id, unit_price_ea, supply_amount, vat_amount, total_amount", "exact", false).
			In("outbound_id", obIDs).
			Neq("status", "cancelled").
			Execute()
		if err != nil {
			log.Printf("[아마란스 출고 내보내기] 매출 조회 실패: %v", err)
			// 매출 없어도 계속 진행
		} else {
			var sales []saleForOutbound
			if err := json.Unmarshal(saleData, &sales); err != nil {
				log.Printf("[아마란스 출고 내보내기] 매출 디코딩 실패: %v", err)
			} else {
				for _, s := range sales {
					saleMap[s.OutboundID] = s
				}
			}
		}
	}

	// 거래처 맵 (partner_id → erp_code)
	partnerIDMap, err := h.loadPartnerIDERPMap()
	if err != nil {
		log.Printf("[아마란스 출고 내보내기] 거래처 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 조회에 실패했습니다")
		return
	}

	// 엑셀 생성
	f := excelize.NewFile()
	sheet := "Sheet1"
	writeHeaders(f, sheet, outboundHeaders, outboundERPCodes)

	for i, ob := range outbounds {
		row := i + 3

		productCode := ""
		if ob.Products != nil {
			productCode = ob.Products.ProductCode
		}

		whCode := ""
		lcCode := ""
		if ob.Warehouses != nil {
			whCode = ob.Warehouses.WarehouseCode
			lcCode = ob.Warehouses.LocationCode
		}

		dateStr := strings.ReplaceAll(ob.OutboundDate, "-", "")
		remark := buildRemark(ptrStr(ob.SiteName), ptrStr(ob.Memo))

		// 매출 연결
		sale, hasSale := saleMap[ob.OutboundID]
		trCode := ""
		if hasSale {
			trCode = partnerIDMap[sale.CustomerID]
		}

		var unitPriceEa, vatUM, supplyAmt, vatAmt, totalAmt interface{}
		if hasSale {
			unitPriceEa = ptrFloat(sale.UnitPriceEa)
			vatUM = ptrFloat(sale.UnitPriceEa) * 1.1
			supplyAmt = ptrFloat(sale.SupplyAmount)
			vatAmt = ptrFloat(sale.VatAmount)
			totalAmt = ptrFloat(sale.TotalAmount)
		} else {
			unitPriceEa = ""
			vatUM = ""
			supplyAmt = ""
			vatAmt = ""
			totalAmt = ""
		}

		// 35컬럼 기록
		cells := []interface{}{
			"0",             // A 거래구분
			dateStr,         // B 출고일자
			trCode,          // C 고객코드
			"KRW",           // D 환종
			1,               // E 환율
			"0",             // F 과세구분
			"0",             // G 단가구분
			whCode,          // H 창고코드
			"",              // I 담당자코드
			remark,          // J 비고(건)
			productCode,     // K 품번
			ob.Quantity,     // L 출고수량
			ob.Quantity,     // M 재고단위수량
			"",              // N 단가유형
			unitPriceEa,     // O 부가세미포함단가
			vatUM,           // P 부가세포함단가
			supplyAmt,       // Q 공급가
			vatAmt,          // R 부가세
			totalAmt,        // S 합계액
			lcCode,          // T 장소코드
			"",              // U 관리구분 (D-068)
			"",              // V 프로젝트코드
			ptrStr(ob.Memo), // W 비고(내역)
			"",              // X 납품처코드
			"",              // Y 지역
			0,               // Z 외화단가
			0,               // AA 외화금액
			"",              // AB 배송방법
			"",              // AC LOT번호
			"",              // AD 주문번호
			"",              // AE 주문순번
			"",              // AF 출고의뢰번호
			"",              // AG 출고의뢰순번
			"",              // AH 출고검사번호
			"",              // AI 출고검사순번
		}

		for ci, val := range cells {
			cell := fmt.Sprintf("%s%d", colName(ci), row)
			if err := f.SetCellValue(sheet, cell, val); err != nil {
				log.Printf("[아마란스 출고] 셀 %s 값 설정 실패: %v", cell, err)
			}
		}
	}

	today := time.Now().Format("20060102")
	fileName := fmt.Sprintf("amaranth_outbound_%s.xlsx", today)

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", fileName))

	if _, err := f.WriteTo(w); err != nil {
		log.Printf("[아마란스 출고 내보내기] 파일 전송 실패: %v", err)
	}
}

// --- 데이터 로더 ---

type warehouseInfo struct {
	warehouseCode string
	locationCode  string
}

func (h *ExportHandler) loadWarehouseMap() (map[string]warehouseInfo, error) {
	data, _, err := h.DB.From("warehouses").
		Select("warehouse_id, warehouse_code, location_code", "exact", false).
		Execute()
	if err != nil {
		return nil, err
	}

	var items []struct {
		WarehouseID   string `json:"warehouse_id"`
		WarehouseCode string `json:"warehouse_code"`
		LocationCode  string `json:"location_code"`
	}
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}

	m := make(map[string]warehouseInfo, len(items))
	for _, item := range items {
		m[item.WarehouseID] = warehouseInfo{
			warehouseCode: item.WarehouseCode,
			locationCode:  item.LocationCode,
		}
	}
	return m, nil
}

func (h *ExportHandler) loadPartnerERPMap() (map[string]string, error) {
	data, _, err := h.DB.From("partners").
		Select("partner_name, erp_code", "exact", false).
		Execute()
	if err != nil {
		return nil, err
	}

	var items []partnerERP
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}

	m := make(map[string]string, len(items))
	for _, item := range items {
		if item.ERPCode != nil {
			m[item.PartnerName] = *item.ERPCode
		}
	}
	return m, nil
}

func (h *ExportHandler) loadPartnerIDERPMap() (map[string]string, error) {
	data, _, err := h.DB.From("partners").
		Select("partner_id, erp_code", "exact", false).
		Execute()
	if err != nil {
		return nil, err
	}

	var items []partnerERP
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}

	m := make(map[string]string, len(items))
	for _, item := range items {
		if item.ERPCode != nil {
			m[item.PartnerID] = *item.ERPCode
		}
	}
	return m, nil
}

func (h *ExportHandler) loadManufacturerMap() (map[string]string, error) {
	data, _, err := h.DB.From("manufacturers").
		Select("manufacturer_id, name_kr", "exact", false).
		Execute()
	if err != nil {
		return nil, err
	}

	var items []struct {
		ManufacturerID string `json:"manufacturer_id"`
		NameKR         string `json:"name_kr"`
	}
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}

	m := make(map[string]string, len(items))
	for _, item := range items {
		m[item.ManufacturerID] = item.NameKR
	}
	return m, nil
}

func (h *ExportHandler) loadPOMap() (map[string]string, error) {
	data, _, err := h.DB.From("purchase_orders").
		Select("po_id, po_number", "exact", false).
		Execute()
	if err != nil {
		return nil, err
	}

	var items []poForExport
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}

	m := make(map[string]string, len(items))
	for _, item := range items {
		if item.PONumber != nil {
			m[item.POID] = *item.PONumber
		}
	}
	return m, nil
}

// loadCIFMap — 원가 데이터에서 product_id → cif_wp_krw 매핑
func (h *ExportHandler) loadCIFMap(blIDs []string) (map[string]float64, error) {
	if len(blIDs) == 0 {
		return make(map[string]float64), nil
	}

	// declarations에서 bl_id 기반 조회 → cost_details
	declData, _, err := h.DB.From("declarations").
		Select("declaration_id", "exact", false).
		In("bl_id", blIDs).
		Execute()
	if err != nil {
		return nil, err
	}

	var decls []struct {
		DeclarationID string `json:"declaration_id"`
	}
	if err := json.Unmarshal(declData, &decls); err != nil {
		return nil, err
	}

	if len(decls) == 0 {
		return make(map[string]float64), nil
	}

	declIDs := make([]string, 0, len(decls))
	for _, d := range decls {
		declIDs = append(declIDs, d.DeclarationID)
	}

	costData, _, err := h.DB.From("cost_details").
		Select("product_id, cif_wp_krw", "exact", false).
		In("declaration_id", declIDs).
		Execute()
	if err != nil {
		return nil, err
	}

	var costs []struct {
		ProductID string  `json:"product_id"`
		CifWpKrw  float64 `json:"cif_wp_krw"`
	}
	if err := json.Unmarshal(costData, &costs); err != nil {
		return nil, err
	}

	m := make(map[string]float64, len(costs))
	for _, c := range costs {
		m[c.ProductID] = c.CifWpKrw
	}
	return m, nil
}
