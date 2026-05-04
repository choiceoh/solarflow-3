package handler

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"
	"github.com/xuri/excelize/v2"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

const (
	amaranthXLSXContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	outboundDataStartRow    = 4
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

// FullDataDump — GET /api/v1/export/all
// 비유: 8개 거래·기준 컬렉션을 한 묶음 JSON으로 내려주는 관리자 전용 통합 덤프.
// 권한: g.AdminOnly + 테넌트 스코프 분리.
//   - baro 테넌트(D-108): company_code = "BR" 인 법인 데이터만
//   - topsolar/cable 테넌트: company_code != "BR" 인 법인 데이터만
//
// 단일 DB · URL 분기 · 코드 레벨 마스킹 (D-108) 패턴을 그대로 적용한다.
func (h *ExportHandler) FullDataDump(w http.ResponseWriter, r *http.Request) {
	scope := middleware.GetTenantScope(r.Context())

	companiesData, companyIDs, err := h.tenantScopedCompanies(scope)
	if err != nil {
		log.Printf("[전체 데이터 덤프] 법인 조회 실패: scope=%s err=%v", scope, err)
		response.RespondError(w, http.StatusInternalServerError, "법인 조회에 실패했습니다")
		return
	}

	dump := struct {
		Companies    json.RawMessage `json:"companies"`
		Orders       json.RawMessage `json:"orders"`
		Outbounds    json.RawMessage `json:"outbounds"`
		Sales        json.RawMessage `json:"sales"`
		Receipts     json.RawMessage `json:"receipts"`
		Bls          json.RawMessage `json:"bls"`
		Declarations json.RawMessage `json:"declarations"`
		Expenses     json.RawMessage `json:"expenses"`
	}{
		Companies: companiesData,
	}

	// 테넌트에 속한 법인이 0개면 거래 시트도 모두 빈 배열로 회신.
	if len(companyIDs) == 0 {
		empty := json.RawMessage("[]")
		dump.Orders = empty
		dump.Outbounds = empty
		dump.Sales = empty
		dump.Receipts = empty
		dump.Bls = empty
		dump.Declarations = empty
		dump.Expenses = empty
		response.RespondJSON(w, http.StatusOK, dump)
		return
	}

	txTables := []struct {
		label  string
		table  string
		target *json.RawMessage
	}{
		{"수주", "orders", &dump.Orders},
		{"출고", "outbounds", &dump.Outbounds},
		{"매출", "sales", &dump.Sales},
		{"수금", "receipts", &dump.Receipts},
		{"입고", "bl_shipments", &dump.Bls},
		{"면장", "import_declarations", &dump.Declarations},
		{"부대비용", "incidental_expenses", &dump.Expenses},
	}

	for _, t := range txTables {
		data, _, err := h.DB.From(t.table).
			Select("*", "exact", false).
			In("company_id", companyIDs).
			Execute()
		if err != nil {
			log.Printf("[전체 데이터 덤프] %s(%s) 조회 실패: scope=%s err=%v", t.label, t.table, scope, err)
			response.RespondError(w, http.StatusInternalServerError, fmt.Sprintf("%s 조회에 실패했습니다", t.label))
			return
		}
		if len(data) == 0 {
			data = []byte("[]")
		}
		*t.target = json.RawMessage(data)
	}

	response.RespondJSON(w, http.StatusOK, dump)
}

// tenantScopedCompanies — 호출 사용자의 테넌트 스코프에 속한 법인 raw JSON과 ID 목록을 반환.
// 비유: "이 사람 사원증으로 들어갈 수 있는 법인실의 명함첩만 모아준다."
func (h *ExportHandler) tenantScopedCompanies(scope string) (json.RawMessage, []string, error) {
	query := h.DB.From("companies").Select("*", "exact", false)
	if scope == middleware.TenantScopeBaro {
		query = query.Eq("company_code", "BR")
	} else {
		query = query.Neq("company_code", "BR")
	}
	data, _, err := query.Execute()
	if err != nil {
		return nil, nil, err
	}
	if len(data) == 0 {
		data = []byte("[]")
	}

	var rows []struct {
		CompanyID string `json:"company_id"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.CompanyID != "" {
			ids = append(ids, row.CompanyID)
		}
	}
	return json.RawMessage(data), ids, nil
}

// DownloadRPAPackage — GET /api/v1/export/amaranth/rpa-package
// 비유: 사용자가 npm을 만지지 않도록, 운영자가 준비한 Windows 자동화 ZIP에 서버 설정을 주입해 내려준다.
func (h *ExportHandler) DownloadRPAPackage(w http.ResponseWriter, r *http.Request) {
	packagePath, err := findRPAPackagePath()
	if err != nil {
		response.RespondError(w, http.StatusNotFound, err.Error())
		return
	}

	rpaToken := strings.TrimSpace(os.Getenv("SOLARFLOW_AMARANTH_RPA_TOKEN"))
	if rpaToken == "" {
		response.RespondError(w, http.StatusInternalServerError, "SOLARFLOW_AMARANTH_RPA_TOKEN을 설정해야 RPA 설치 패키지를 배포할 수 있습니다")
		return
	}

	uploadURL := strings.TrimSpace(os.Getenv("AMARANTH_OUTBOUND_UPLOAD_URL"))
	if uploadURL == "" {
		response.RespondError(w, http.StatusInternalServerError, "AMARANTH_OUTBOUND_UPLOAD_URL을 설정해야 RPA 설치 패키지를 배포할 수 있습니다")
		return
	}

	tempPath, err := prepareRPAPackage(packagePath, generateRPAEnv(r, rpaToken, uploadURL))
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, fmt.Sprintf("RPA 설치 패키지 준비 실패: %v", err))
		return
	}
	defer os.Remove(tempPath)

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="solarflow-amaranth-rpa-windows.zip"`)
	http.ServeFile(w, r, tempPath)
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

var outboundDescriptions = []string{
	"타입 : 문자\n 길이 : 1\n 필수 : True\n 설명 : 숫자만 입력하세요. (0.DOMESTIC, 1.LOCAL L/C, 2.구매승인서, 3.MASTER L/C, 4.T/T, 5.D/A, 6.D/P)",
	"타입 : 날짜\n 길이 : 8\n 필수 : True\n 설명 : 숫자 기준 8자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 10\n 필수 : True\n 설명 : 영문/숫자 기준 10자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 4\n 필수 : True\n 설명 : 영문/숫자 기준 4자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 17,6\n 필수 : True\n 설명 : 숫자 기준 17,6자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 1\n 필수 : True\n 설명 : 숫자 1자리(최대)를 입력 하세요.(0.매출과세 1.수출영세 2.매출면세 3. 매출기타)",
	"타입 : 문자\n 길이 : 1\n 필수 : True\n 설명 : 숫자 1자리(최대)를 입력 하세요.(0. 부가세미포함 1.부가세포함)",
	"타입 : 문자\n 길이 : 4\n 필수 : True\n 설명 : 영문/숫자 기준 4자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 10\n 필수 : False\n 설명 : 영문/숫자 기준 10자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 60\n 필수 : False\n 설명 : 영문/숫자 기준 60자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 30\n 필수 : True\n 설명 : 영문/숫자 기준 30자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 17,6\n 필수 : True\n 설명 : 숫자 기준 17,6자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 17,6\n 필수 : True\n 설명 : 숫자 기준 17,6자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 10\n 필수 : False\n 설명 : 영문/숫자 기준 10자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 17,6\n 필수 : False\n 설명 : 숫자 기준 17,6자리(최대)를 입력하세요.",
	"타입 : 숫자\n 길이 : 17,6\n 필수 : False\n 설명 : 숫자 기준 17,6자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 17,4\n 필수 : False\n 설명 : 숫자 기준 17,4자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 17,4\n 필수 : False\n 설명 : 숫자 기준 17,4자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 17,4\n 필수 : False\n 설명 : 숫자 기준 17,4자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 4\n 필수 : True\n 설명 : 영문/숫자 기준 4자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 10\n 필수 : False\n 설명 : 영문/숫자 기준 10자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 10\n 필수 : False\n 설명 : 영문/숫자 기준 10자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 60\n 필수 : False\n 설명 : 영문/숫자 기준 60자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 5\n 필수 : False\n 설명 : 영문/숫자 기준 5자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 10\n 필수 : False\n 설명 : 영문/숫자 기준 10자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 17,6\n 필수 : False\n 설명 : 숫자 기준 17,6자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 17,4\n 필수 : False\n 설명 : 숫자 기준 17,4자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 10\n 필수 : False\n 설명 : 영문/숫자 기준 10자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 50\n 필수 : False\n 설명 : 영문/숫자 기준 50자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 12\n 필수 : False\n 설명 : 영문/숫자 기준12자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 5,0\n 필수 : False\n 설명 : 숫자 기준 5자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 12\n 필수 : False\n 설명 : 영문/숫자 기준 12자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 5,0\n 필수 : False\n 설명 : 숫자 기준 5자리(최대)를 입력 하세요.",
	"타입 : 문자\n 길이 : 12\n 필수 : False\n 설명 : 영문/숫자 기준 12자리(최대)를 입력 하세요.",
	"타입 : 숫자\n 길이 : 5,0\n 필수 : False\n 설명 : 숫자 기준 5자리(최대)를 입력 하세요.",
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

// inboundLineForExport — 아마란스 입고 내보내기용 라인아이템 (B/L 라인).
// 핸들러가 DB에서 조회해 buildAmaranthInboundWorkbook에 전달.
type inboundLineForExport struct {
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

// inboundExportLookups — 아마란스 입고 워크북 빌드에 필요한 코드/이름 룩업 묶음.
// 핸들러가 DB에서 미리 조회해 전달. buildAmaranthInboundWorkbook은 DB에 의존하지 않는다.
type inboundExportLookups struct {
	Warehouses    map[string]warehouseInfo // warehouse_id → {code, location}
	PartnerERPs   map[string]string        // partner_name → erp_code
	Manufacturers map[string]string        // manufacturer_id → name_kr
	POs           map[string]string        // po_id → po_number
	CIFByProduct  map[string]float64       // product_id → cif_wp_krw
}

// buildAmaranthInboundWorkbook — 입고 데이터를 아마란스10 양식 .xlsx 워크북으로 변환.
// pure 함수 — DB·HTTP 의존 없음. 단위테스트는 io_export_test.go.
// 호출 측이 DB 조회 후 모든 데이터를 넘겨야 한다.
func buildAmaranthInboundWorkbook(bls []blShipmentForExport, lines []inboundLineForExport, lookups inboundExportLookups) *excelize.File {
	f := excelize.NewFile()
	sheet := "Sheet1"
	writeHeaders(f, sheet, inboundHeaders, inboundERPCodes)

	row := 3
	for _, bl := range bls {
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
		mfgName := lookups.Manufacturers[mfgID]
		trCode := lookups.PartnerERPs[mfgName]

		// 창고
		whCode := ""
		lcCode := ""
		if wh, ok := lookups.Warehouses[whID]; ok {
			whCode = wh.warehouseCode
			lcCode = wh.locationCode
		}

		// PO 번호
		poNumber := ""
		if poID != "" {
			poNumber = lookups.POs[poID]
		}

		// 라인 순번
		lineSeq := 0
		for _, line := range lines {
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
				cifWpKrw := lookups.CIFByProduct[line.ProductID]
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
				"", "", "", "", // AE~AH 입고의뢰/입고검사 번호·순번
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
	return f
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

func findRPAPackagePath() (string, error) {
	candidates := []string{}
	if configured := strings.TrimSpace(os.Getenv("SOLARFLOW_AMARANTH_RPA_PACKAGE")); configured != "" {
		candidates = append(candidates, configured)
	}
	candidates = append(candidates,
		filepath.Join("..", "rpa", "amaranth-uploader", "dist", "solarflow-amaranth-rpa-windows.zip"),
		filepath.Join("rpa", "amaranth-uploader", "dist", "solarflow-amaranth-rpa-windows.zip"),
	)

	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("RPA 설치 패키지를 찾지 못했습니다. SOLARFLOW_AMARANTH_RPA_PACKAGE 또는 rpa/amaranth-uploader/dist/solarflow-amaranth-rpa-windows.zip을 준비하세요")
}

func prepareRPAPackage(packagePath string, envContent string) (string, error) {
	source, err := zip.OpenReader(packagePath)
	if err != nil {
		return "", err
	}
	defer source.Close()

	tempFile, err := os.CreateTemp("", "solarflow-amaranth-rpa-*.zip")
	if err != nil {
		return "", err
	}
	tempPath := tempFile.Name()

	cleanup := func(closeErr error) (string, error) {
		tempFile.Close()
		os.Remove(tempPath)
		return "", closeErr
	}

	writer := zip.NewWriter(tempFile)
	for _, sourceFile := range source.File {
		cleanName := filepath.ToSlash(filepath.Clean(sourceFile.Name))
		if cleanName == ".env" || strings.HasSuffix(cleanName, "/.env") {
			continue
		}

		header := sourceFile.FileHeader
		header.Name = cleanName
		entry, err := writer.CreateHeader(&header)
		if err != nil {
			return cleanup(err)
		}
		if sourceFile.FileInfo().IsDir() {
			continue
		}

		reader, err := sourceFile.Open()
		if err != nil {
			return cleanup(err)
		}
		if _, err := io.Copy(entry, reader); err != nil {
			reader.Close()
			return cleanup(err)
		}
		reader.Close()
	}

	envHeader := &zip.FileHeader{Name: ".env", Method: zip.Deflate}
	envHeader.SetMode(0600)
	envEntry, err := writer.CreateHeader(envHeader)
	if err != nil {
		return cleanup(err)
	}
	if _, err := envEntry.Write([]byte(envContent)); err != nil {
		return cleanup(err)
	}

	if err := writer.Close(); err != nil {
		return cleanup(err)
	}
	if err := tempFile.Close(); err != nil {
		os.Remove(tempPath)
		return "", err
	}

	return tempPath, nil
}

func generateRPAEnv(r *http.Request, rpaToken string, uploadURL string) string {
	return strings.Join([]string{
		fmt.Sprintf("SOLARFLOW_API_URL=%s", publicAPIURL(r)),
		fmt.Sprintf("SOLARFLOW_AMARANTH_RPA_TOKEN=%s", rpaToken),
		"SOLARFLOW_ACCESS_TOKEN=",
		fmt.Sprintf("AMARANTH_OUTBOUND_UPLOAD_URL=%s", uploadURL),
		"AMARANTH_USER_DATA_DIR=.profile",
		"AMARANTH_HEADLESS=false",
		"AMARANTH_BROWSER_CHANNEL=auto",
		"AMARANTH_AUTO_LOGIN=false",
		"AMARANTH_COMPANY_CODE=",
		"AMARANTH_USER_ID=",
		"AMARANTH_PASSWORD=",
		"AMARANTH_LOGIN_NEXT_TEXT=다음",
		"AMARANTH_LOGIN_SUBMIT_TEXT=로그인",
		"AMARANTH_PAGE_READY_TEXT=출고등록엑셀업로드",
		"AMARANTH_FEATURE_MENU_TEXT=기능모음",
		`AMARANTH_UPLOAD_MENU_TEXT=엑셀\s*업로드|파일\s*업로드`,
		`AMARANTH_CONVERT_CONFIRM_TEXT=변환\s*확인`,
		`AMARANTH_SUCCESS_TEXT=정상\s*처리|업로드\s*완료|변환\s*완료|성공적으로|완료되었습니다`,
		"AMARANTH_FAILURE_TEXT=실패|오류|에러|필수|중복|등록불가",
		"AMARANTH_POLL_INTERVAL_MS=30000",
		"AMARANTH_MAX_JOBS_PER_RUN=1",
		"",
	}, "\n")
}

func publicAPIURL(r *http.Request) string {
	if configured := strings.TrimRight(strings.TrimSpace(os.Getenv("SOLARFLOW_PUBLIC_API_URL")), "/"); configured != "" {
		return configured
	}

	scheme := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
	if scheme == "" {
		scheme = "http"
	}
	host := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = r.Host
	}
	return fmt.Sprintf("%s://%s", scheme, host)
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
		if err := f.SetCellValue(sheet, fmt.Sprintf("%s1", col), h); err != nil {
			log.Printf("[아마란스 헤더] 셀 %s1 값 설정 실패: %v", col, err)
		}
		if i < len(erpCodes) && erpCodes[i] != "" {
			if err := f.SetCellValue(sheet, fmt.Sprintf("%s2", col), erpCodes[i]); err != nil {
				log.Printf("[아마란스 헤더] 셀 %s2 값 설정 실패: %v", col, err)
			}
		}
	}
}

// writeHeadersWithDescriptions — 행1 한글헤더, 행2 ERP코드, 행3 실물 업로드 설명 작성
func writeHeadersWithDescriptions(f *excelize.File, sheet string, headers []string, erpCodes []string, descriptions []string) {
	writeHeaders(f, sheet, headers, erpCodes)
	for i, desc := range descriptions {
		col := colName(i)
		if err := f.SetCellValue(sheet, fmt.Sprintf("%s3", col), desc); err != nil {
			log.Printf("[아마란스 설명행] 셀 %s3 값 설정 실패: %v", col, err)
		}
	}
	if err := f.SetRowHeight(sheet, 3, 96); err != nil {
		log.Printf("[아마란스 설명행] 높이 설정 실패: %v", err)
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
	var allLines []inboundLineForExport
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

	// 엑셀 생성 — pure builder에 위임
	f := buildAmaranthInboundWorkbook(filteredBLs, allLines, inboundExportLookups{
		Warehouses:    whMap,
		PartnerERPs:   partnerMap,
		Manufacturers: mfgMap,
		POs:           poMap,
		CIFByProduct:  cifMap,
	})

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

	f, _, err := h.buildAmaranthOutboundWorkbook(companyID, fromDate, toDate)
	if err != nil {
		log.Printf("[아마란스 출고 내보내기] 엑셀 생성 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 출고 엑셀 생성에 실패했습니다")
		return
	}
	defer closeWorkbook("아마란스 출고 내보내기", f)

	today := time.Now().Format("20060102")
	fileName := fmt.Sprintf("amaranth_outbound_%s.xlsx", today)

	w.Header().Set("Content-Type", amaranthXLSXContentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", fileName))

	if _, err := f.WriteTo(w); err != nil {
		log.Printf("[아마란스 출고 내보내기] 파일 전송 실패: %v", err)
	}
}

func (h *ExportHandler) buildAmaranthOutboundWorkbook(companyID, fromDate, toDate string) (*excelize.File, int, error) {
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
		return nil, 0, fmt.Errorf("출고 조회 실패: %w", err)
	}

	var outbounds []outboundExportRow
	if err := json.Unmarshal(outData, &outbounds); err != nil {
		return nil, 0, fmt.Errorf("출고 디코딩 실패: %w", err)
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
		return nil, 0, fmt.Errorf("거래처 조회 실패: %w", err)
	}

	// 엑셀 생성
	f := excelize.NewFile()
	applyAmaranthWorkbookProperties(f, "SolarFlow Amaranth Outbound")
	sheet := "Sheet1"
	writeHeadersWithDescriptions(f, sheet, outboundHeaders, outboundERPCodes, outboundDescriptions)

	for i, ob := range outbounds {
		row := i + outboundDataStartRow

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

		var unitPriceEa, supplyAmt, vatAmt, totalAmt interface{}
		if hasSale {
			unitPriceEa = ptrFloat(sale.UnitPriceEa)
			supplyAmt = ptrFloat(sale.SupplyAmount)
			vatAmt = ptrFloat(sale.VatAmount)
			totalAmt = ptrFloat(sale.TotalAmount)
		} else {
			unitPriceEa = ""
			supplyAmt = ""
			vatAmt = ""
			totalAmt = ""
		}

		// 35컬럼 기록
		cells := []interface{}{
			"0",                               // A 거래구분
			dateStr,                           // B 출고일자
			trCode,                            // C 고객코드
			"KRW",                             // D 환종
			1,                                 // E 환율
			"0",                               // F 과세구분
			"0",                               // G 단가구분
			whCode,                            // H 창고코드
			amaranthDefaultSalespersonCode(),  // I 담당자코드
			remark,                            // J 비고(건)
			productCode,                       // K 품번
			ob.Quantity,                       // L 출고수량
			ob.Quantity,                       // M 재고단위수량
			"",                                // N 단가유형
			unitPriceEa,                       // O 부가세미포함단가
			"",                                // P 부가세포함단가 — 실물 업로드 샘플과 동일하게 공란
			supplyAmt,                         // Q 공급가
			vatAmt,                            // R 부가세
			totalAmt,                          // S 합계액
			lcCode,                            // T 장소코드
			amaranthDefaultOutboundMgmtCode(), // U 관리구분
			"",                                // V 프로젝트코드
			ptrStr(ob.Memo),                   // W 비고(내역)
			"",                                // X 납품처코드
			"",                                // Y 지역
			0,                                 // Z 외화단가
			0,                                 // AA 외화금액
			"",                                // AB 배송방법
			"",                                // AC LOT번호
			"",                                // AD 주문번호
			"",                                // AE 주문순번
			"",                                // AF 출고의뢰번호
			"",                                // AG 출고의뢰순번
			"",                                // AH 출고검사번호
			"",                                // AI 출고검사순번
		}

		for ci, val := range cells {
			cell := fmt.Sprintf("%s%d", colName(ci), row)
			if err := f.SetCellValue(sheet, cell, val); err != nil {
				log.Printf("[아마란스 출고] 셀 %s 값 설정 실패: %v", cell, err)
			}
		}
	}

	return f, len(outbounds), nil
}

// CreateOutboundUploadJob — POST /api/v1/export/amaranth/outbound/jobs
// 비유: RPA 작업함에 "이 출고 엑셀을 아마란스에 올려주세요" 접수증을 만든다.
func (h *ExportHandler) CreateOutboundUploadJob(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	companyID, fromDate, toDate, ok := parseAmaranthJobFilters(w, r)
	if !ok {
		return
	}

	f, rowCount, err := h.buildAmaranthOutboundWorkbook(ptrStr(companyID), ptrStr(fromDate), ptrStr(toDate))
	if err != nil {
		log.Printf("[아마란스 출고 업로드 작업] 엑셀 생성 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 출고 엑셀 생성에 실패했습니다")
		return
	}
	defer closeWorkbook("아마란스 출고 업로드 작업", f)

	var buf bytes.Buffer
	if _, err := f.WriteTo(&buf); err != nil {
		log.Printf("[아마란스 출고 업로드 작업] 엑셀 버퍼 생성 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 출고 엑셀 파일을 만들 수 없습니다")
		return
	}

	hash := sha256.Sum256(buf.Bytes())
	fileHash := hex.EncodeToString(hash[:])
	existing, err := h.findUploadJobByHash("outbound", fileHash)
	if err != nil {
		log.Printf("[아마란스 출고 업로드 작업] 중복 작업 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 작업 중복 확인에 실패했습니다")
		return
	}
	if existing != nil {
		redactUploadJob(existing)
		response.RespondJSON(w, http.StatusOK, model.AmaranthUploadJobCreateResponse{
			Job:       *existing,
			Duplicate: true,
		})
		return
	}

	jobID := uuid.NewString()
	today := time.Now().Format("20060102")
	fileName := fmt.Sprintf("amaranth_outbound_%s.xlsx", today)
	storedName := jobID + ".xlsx"
	dir := filepath.Join(amaranthUploadRoot(), "outbound", today)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		log.Printf("[아마란스 출고 업로드 작업] 저장 폴더 생성 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 파일 저장 폴더를 만들 수 없습니다")
		return
	}

	storedPath := filepath.Join(dir, storedName)
	if err := os.WriteFile(storedPath, buf.Bytes(), 0o640); err != nil {
		log.Printf("[아마란스 출고 업로드 작업] 파일 저장 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 파일을 저장할 수 없습니다")
		return
	}

	email := middleware.GetUserEmail(r.Context())
	req := model.CreateAmaranthUploadJobRequest{
		JobID:          jobID,
		JobType:        "outbound",
		Status:         "pending",
		CompanyID:      companyID,
		DateFrom:       fromDate,
		DateTo:         toDate,
		FileName:       fileName,
		StoredName:     storedName,
		StoredPath:     storedPath,
		ContentType:    amaranthXLSXContentType,
		SizeBytes:      int64(buf.Len()),
		FileSHA256:     fileHash,
		RowCount:       rowCount,
		CreatedBy:      &userID,
		CreatedByEmail: ptrIfNotEmpty(email),
	}

	data, _, err := h.DB.From("amaranth_upload_jobs").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		removeStoredFile(storedPath)
		log.Printf("[아마란스 출고 업로드 작업] DB 등록 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 작업을 저장할 수 없습니다")
		return
	}

	var created []model.AmaranthUploadJob
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		removeStoredFile(storedPath)
		log.Printf("[아마란스 출고 업로드 작업] DB 응답 처리 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 작업 생성 결과를 확인할 수 없습니다")
		return
	}

	redactUploadJob(&created[0])
	response.RespondJSON(w, http.StatusCreated, model.AmaranthUploadJobCreateResponse{
		Job:       created[0],
		Duplicate: false,
	})
}

// ListUploadJobs — GET /api/v1/export/amaranth/jobs
func (h *ExportHandler) ListUploadJobs(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("amaranth_upload_jobs").
		Select("*", "exact", false).
		Order("created_at", &postgrest.OrderOpts{Ascending: false})

	if jobType := strings.TrimSpace(r.URL.Query().Get("job_type")); jobType != "" {
		query = query.Eq("job_type", jobType)
	}
	if status := strings.TrimSpace(r.URL.Query().Get("status")); status != "" {
		query = query.Eq("status", status)
	}
	if companyID := strings.TrimSpace(r.URL.Query().Get("company_id")); companyID != "" && companyID != "all" {
		if _, err := uuid.Parse(companyID); err != nil {
			response.RespondError(w, http.StatusBadRequest, "company_id는 UUID 형식이어야 합니다")
			return
		}
		query = query.Eq("company_id", companyID)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[아마란스 업로드 작업 목록] 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 작업 목록 조회에 실패했습니다")
		return
	}

	var jobs []model.AmaranthUploadJob
	if err := json.Unmarshal(data, &jobs); err != nil {
		log.Printf("[아마란스 업로드 작업 목록] 디코딩 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 작업 목록 처리에 실패했습니다")
		return
	}
	for i := range jobs {
		redactUploadJob(&jobs[i])
	}
	response.RespondJSON(w, http.StatusOK, jobs)
}

// DownloadUploadJobFile — GET /api/v1/export/amaranth/jobs/{id}/download
func (h *ExportHandler) DownloadUploadJobFile(w http.ResponseWriter, r *http.Request) {
	job, ok := h.getUploadJob(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	path, err := safeStoredPath(job.StoredPath)
	if err != nil {
		log.Printf("[아마란스 업로드 작업 다운로드] 경로 검증 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 파일 경로가 올바르지 않습니다")
		return
	}

	file, err := os.Open(path)
	if err != nil {
		log.Printf("[아마란스 업로드 작업 다운로드] 파일 열기 실패: %v", err)
		response.RespondError(w, http.StatusNotFound, "아마란스 업로드 파일을 찾을 수 없습니다")
		return
	}
	defer func() {
		if err := file.Close(); err != nil {
			log.Printf("[아마란스 업로드 작업 다운로드] 파일 닫기 실패: %v", err)
		}
	}()

	w.Header().Set("Content-Type", amaranthXLSXContentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": job.FileName}))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", job.SizeBytes))
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, job.FileName, fileModTime(path), file)
}

// ClaimUploadJob — POST /api/v1/export/amaranth/jobs/{id}/claim
// 비유: RPA 기사가 작업표에 자기 도장을 찍고 가져가는 단계. 이미 누가 가져간 표는 다시 가져가지 않는다.
func (h *ExportHandler) ClaimUploadJob(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	job, ok := h.getUploadJob(w, id)
	if !ok {
		return
	}
	if job.Status != "pending" {
		response.RespondError(w, http.StatusConflict, "이미 처리 중이거나 완료된 아마란스 업로드 작업입니다")
		return
	}

	now := time.Now().Format(time.RFC3339)
	update := amaranthUploadJobStatusUpdate{
		Status:       "running",
		UpdatedAt:    now,
		Attempts:     job.Attempts + 1,
		RPAStartedAt: &now,
	}

	data, _, err := h.DB.From("amaranth_upload_jobs").
		Update(update, "", "").
		Eq("job_id", id).
		Eq("status", "pending").
		Execute()
	if err != nil {
		log.Printf("[아마란스 업로드 작업 선점] 수정 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 작업 선점에 실패했습니다")
		return
	}

	var updated []model.AmaranthUploadJob
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[아마란스 업로드 작업 선점] 응답 처리 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 작업 선점 결과를 확인할 수 없습니다")
		return
	}
	if len(updated) == 0 {
		response.RespondError(w, http.StatusConflict, "이미 다른 RPA 워커가 가져간 작업입니다")
		return
	}

	redactUploadJob(&updated[0])
	response.RespondJSON(w, http.StatusOK, model.AmaranthUploadJobClaimResponse{Job: updated[0]})
}

// UpdateUploadJobStatus — PUT /api/v1/export/amaranth/jobs/{id}/status
func (h *ExportHandler) UpdateUploadJobStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	job, ok := h.getUploadJob(w, id)
	if !ok {
		return
	}

	var req model.UpdateAmaranthUploadJobStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	now := time.Now().Format(time.RFC3339)
	update := amaranthUploadJobStatusUpdate{
		Status:        req.Status,
		UploadMessage: req.UploadMessage,
		LastError:     req.LastError,
		UpdatedAt:     now,
		Attempts:      job.Attempts,
	}
	if req.Status == "running" {
		update.RPAStartedAt = &now
		update.Attempts = job.Attempts + 1
	}
	if req.Status == "uploaded" {
		update.UploadedAt = &now
	}

	data, _, err := h.DB.From("amaranth_upload_jobs").
		Update(update, "", "").
		Eq("job_id", id).
		Execute()
	if err != nil {
		log.Printf("[아마란스 업로드 작업 상태] 수정 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 작업 상태 수정에 실패했습니다")
		return
	}

	var updated []model.AmaranthUploadJob
	if err := json.Unmarshal(data, &updated); err != nil || len(updated) == 0 {
		log.Printf("[아마란스 업로드 작업 상태] 응답 처리 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 작업 상태 수정 결과를 확인할 수 없습니다")
		return
	}

	redactUploadJob(&updated[0])
	response.RespondJSON(w, http.StatusOK, updated[0])
}

type amaranthUploadJobStatusUpdate struct {
	Status        string  `json:"status"`
	UploadMessage *string `json:"upload_message,omitempty"`
	LastError     *string `json:"last_error,omitempty"`
	RPAStartedAt  *string `json:"rpa_started_at,omitempty"`
	UploadedAt    *string `json:"uploaded_at,omitempty"`
	UpdatedAt     string  `json:"updated_at"`
	Attempts      int     `json:"attempts"`
}

func (h *ExportHandler) findUploadJobByHash(jobType, fileHash string) (*model.AmaranthUploadJob, error) {
	data, _, err := h.DB.From("amaranth_upload_jobs").
		Select("*", "exact", false).
		Eq("job_type", jobType).
		Eq("file_sha256", fileHash).
		Execute()
	if err != nil {
		return nil, err
	}

	var jobs []model.AmaranthUploadJob
	if err := json.Unmarshal(data, &jobs); err != nil {
		return nil, err
	}
	if len(jobs) == 0 {
		return nil, nil
	}
	return &jobs[0], nil
}

func (h *ExportHandler) getUploadJob(w http.ResponseWriter, id string) (model.AmaranthUploadJob, bool) {
	if _, err := uuid.Parse(id); err != nil {
		response.RespondError(w, http.StatusBadRequest, "작업 ID가 올바르지 않습니다")
		return model.AmaranthUploadJob{}, false
	}

	data, _, err := h.DB.From("amaranth_upload_jobs").
		Select("*", "exact", false).
		Eq("job_id", id).
		Execute()
	if err != nil {
		log.Printf("[아마란스 업로드 작업] 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 작업 조회에 실패했습니다")
		return model.AmaranthUploadJob{}, false
	}

	var jobs []model.AmaranthUploadJob
	if err := json.Unmarshal(data, &jobs); err != nil {
		log.Printf("[아마란스 업로드 작업] 디코딩 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "아마란스 업로드 작업 처리에 실패했습니다")
		return model.AmaranthUploadJob{}, false
	}
	if len(jobs) == 0 {
		response.RespondError(w, http.StatusNotFound, "아마란스 업로드 작업을 찾을 수 없습니다")
		return model.AmaranthUploadJob{}, false
	}
	return jobs[0], true
}

func parseAmaranthJobFilters(w http.ResponseWriter, r *http.Request) (*string, *string, *string, bool) {
	companyID := strings.TrimSpace(r.URL.Query().Get("company_id"))
	fromDate := strings.TrimSpace(r.URL.Query().Get("from"))
	toDate := strings.TrimSpace(r.URL.Query().Get("to"))

	var companyPtr *string
	if companyID != "" && companyID != "all" {
		if _, err := uuid.Parse(companyID); err != nil {
			response.RespondError(w, http.StatusBadRequest, "company_id는 UUID 형식이어야 합니다")
			return nil, nil, nil, false
		}
		companyPtr = &companyID
	}

	fromPtr, ok := parseOptionalDateParam(w, fromDate, "from")
	if !ok {
		return nil, nil, nil, false
	}
	toPtr, ok := parseOptionalDateParam(w, toDate, "to")
	if !ok {
		return nil, nil, nil, false
	}
	if fromPtr != nil && toPtr != nil && *fromPtr > *toPtr {
		response.RespondError(w, http.StatusBadRequest, "from은 to보다 늦을 수 없습니다")
		return nil, nil, nil, false
	}
	return companyPtr, fromPtr, toPtr, true
}

func parseOptionalDateParam(w http.ResponseWriter, value string, field string) (*string, bool) {
	if value == "" {
		return nil, true
	}
	if _, err := time.Parse("2006-01-02", value); err != nil {
		response.RespondError(w, http.StatusBadRequest, field+"은 YYYY-MM-DD 형식이어야 합니다")
		return nil, false
	}
	return &value, true
}

func redactUploadJob(job *model.AmaranthUploadJob) {
	job.StoredPath = ""
	job.StoredName = ""
}

func amaranthUploadRoot() string {
	return filepath.Join(attachmentRoot(), "amaranth_upload_jobs")
}

func amaranthDefaultSalespersonCode() string {
	if code := strings.TrimSpace(os.Getenv("AMARANTH_DEFAULT_PLN_CD")); code != "" {
		return code
	}
	return "A001"
}

func amaranthDefaultOutboundMgmtCode() string {
	if code := strings.TrimSpace(os.Getenv("AMARANTH_OUTBOUND_MGMT_CD")); code != "" {
		return code
	}
	if code := strings.TrimSpace(os.Getenv("AMARANTH_DEFAULT_MGMT_CD")); code != "" {
		return code
	}
	return "LS10"
}

func closeWorkbook(label string, f *excelize.File) {
	if err := f.Close(); err != nil {
		log.Printf("[%s] 엑셀 파일 닫기 실패: %v", label, err)
	}
}

func applyAmaranthWorkbookProperties(f *excelize.File, title string) {
	if err := f.SetDocProps(&excelize.DocProperties{
		Creator:        "SolarFlow",
		LastModifiedBy: "SolarFlow",
		Created:        "2000-01-01T00:00:00Z",
		Modified:       "2000-01-01T00:00:00Z",
		Title:          title,
	}); err != nil {
		log.Printf("[아마란스 엑셀 속성] 문서 속성 설정 실패: %v", err)
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
