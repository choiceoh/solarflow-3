package engine

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"
)

// HealthResponse — Rust 엔진 /health/ready 응답 구조체
// 비유: "설비 점검 결과서" — DB 연결 상태를 확인한 결과
type HealthResponse struct {
	Status string `json:"status"`
	DB     string `json:"db"`
}

// EngineClient — Rust 계산엔진 HTTP 클라이언트
// 비유: "계산실 연락 담당" — Go에서 Rust 계산엔진에 요청을 보내는 전담 직원
type EngineClient struct {
	BaseURL    string
	HTTPClient *http.Client
}

// NewEngineClient — EngineClient 생성자
// 비유: 계산실 연락 담당 직원을 배치하고 전화번호(BaseURL)를 등록하는 것
func NewEngineClient(baseURL string) *EngineClient {
	// 비유: 전화번호 끝에 / 있으면 제거 — 중복 방지
	baseURL = strings.TrimRight(baseURL, "/")

	return &EngineClient{
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// retryBackoff — doWithRetry 의 시도별 사전 대기 시간.
// 길이 N = 총 N번 시도. 첫 시도는 즉시, 나머지는 backoff 후 재시도.
// 누적 ~400ms 추가 — Rust 엔진 graceful restart 의 listener 단절 창(보통 0~1초) 을
// 가리는 게 목적. POST 라도 retry 안전한 이유: 엔진 핸들러는 모두 read-only 계산.
var retryBackoff = []time.Duration{0, 100 * time.Millisecond, 300 * time.Millisecond}

// transientErr — 서버에 도달조차 못 한 dial 오류 / 연결 리셋만 true.
// 응답을 받기 시작한 뒤 끊긴 경우는 핸들러가 부분 실행했을 수 있으므로 재시도하지 않는다.
func transientErr(err error) bool {
	if err == nil {
		return false
	}
	var nopErr *net.OpError
	if errors.As(err, &nopErr) && nopErr.Op == "dial" {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "no such host")
}

// retriableStatus — 5xx 중 재시도 가능한 코드. 게이트웨이/오버로드/타임아웃만.
// 500 (앱 에러) 은 재시도해도 같은 결과이므로 제외.
func retriableStatus(s int) bool {
	return s == http.StatusBadGateway ||
		s == http.StatusServiceUnavailable ||
		s == http.StatusGatewayTimeout
}

// doWithRetry — transient 실패에 대해 짧은 backoff 으로 자동 재시도.
// body 가 nil 이면 GET, 아니면 POST application/json. 성공 시 (응답 바이트, status, nil).
// 모든 시도 실패 시 마지막 오류 또는 5xx 응답을 그대로 반환.
func (c *EngineClient) doWithRetry(method, url string, body []byte) ([]byte, int, error) {
	var lastErr error
	var lastBody []byte
	var lastStatus int
	for attempt, wait := range retryBackoff {
		if wait > 0 {
			time.Sleep(wait)
		}
		var bodyReader io.Reader
		if body != nil {
			bodyReader = bytes.NewReader(body)
		}
		req, err := http.NewRequest(method, url, bodyReader)
		if err != nil {
			return nil, 0, err
		}
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			lastErr = err
			lastBody = nil
			lastStatus = 0
			if transientErr(err) && attempt < len(retryBackoff)-1 {
				log.Printf("[엔진 transient 오류 — 재시도 %d/%d] url=%s err=%v", attempt+1, len(retryBackoff)-1, url, err)
				continue
			}
			return nil, 0, err
		}
		respBody, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return nil, resp.StatusCode, readErr
		}
		if retriableStatus(resp.StatusCode) && attempt < len(retryBackoff)-1 {
			log.Printf("[엔진 5xx — 재시도 %d/%d] url=%s status=%d", attempt+1, len(retryBackoff)-1, url, resp.StatusCode)
			lastErr = nil
			lastBody = respBody
			lastStatus = resp.StatusCode
			continue
		}
		return respBody, resp.StatusCode, nil
	}
	if lastErr != nil {
		return nil, lastStatus, lastErr
	}
	return lastBody, lastStatus, nil
}

// CheckHealth — Rust 엔진 상태 확인 (/health/ready 호출)
// 비유: "계산실 전화해서 설비 정상인지 확인하는 것"
func (c *EngineClient) CheckHealth() (HealthResponse, error) {
	url := c.BaseURL + "/health/ready"
	var result HealthResponse

	body, status, err := c.doWithRetry(http.MethodGet, url, nil)
	if err != nil {
		log.Printf("[Rust 엔진 헬스체크 실패] url=%s, err=%v", url, err)
		return result, fmt.Errorf("Rust 엔진 연결 실패: %w", err)
	}

	if status != http.StatusOK {
		log.Printf("[Rust 엔진 헬스체크 비정상] status=%d, body=%s", status, string(body))
		return result, fmt.Errorf("Rust 엔진 비정상 상태: %d", status)
	}

	if err := json.Unmarshal(body, &result); err != nil {
		log.Printf("[Rust 엔진 헬스체크 파싱 실패] %v", err)
		return result, fmt.Errorf("Rust 엔진 응답 파싱 실패: %w", err)
	}

	return result, nil
}

// CallCalc — Rust 계산엔진에 계산 요청을 보냄
// 비유: "계산실에 계산 요청서를 보내고 결과를 받아오는 것"
//
// 엔진 graceful restart / 일시적 502·503 에 대해 doWithRetry 가 짧은 backoff 으로 자동 재시도.
// Rust 핸들러는 모두 read-only 계산이라 재시도가 안전하다.
func (c *EngineClient) CallCalc(path string, reqBody interface{}) ([]byte, error) {
	url := c.BaseURL + "/api/calc/" + path

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		log.Printf("[Rust 엔진 요청 직렬화 실패] path=%s, err=%v", path, err)
		return nil, fmt.Errorf("요청 데이터 직렬화 실패: %w", err)
	}

	body, status, err := c.doWithRetry(http.MethodPost, url, jsonData)
	if err != nil {
		log.Printf("[Rust 엔진 호출 실패] path=%s, err=%v", path, err)
		return nil, fmt.Errorf("Rust 엔진 호출 실패: %w", err)
	}

	if status != http.StatusOK {
		log.Printf("[Rust 엔진 계산 실패] path=%s, status=%d, body=%s", path, status, string(body))
		return nil, fmt.Errorf("Rust 엔진 계산 실패: status=%d, body=%s", status, string(body))
	}

	return body, nil
}

// CallCalcRaw — Rust 계산엔진에 프론트 요청 바이트를 그대로 전달 (프록시 전용)
// 비유: "계산실에 서류 봉투를 열지 않고 그대로 전달하고, 답변도 그대로 가져오는 것"
// 기존 타입 안전 메서드(GetInventory, CalcLandedCost 등)와 별개로,
// 프론트엔드→Go→Rust 바이트 중계용.
func (c *EngineClient) CallCalcRaw(path string, body []byte) ([]byte, int, error) {
	url := c.BaseURL + "/api/calc/" + path

	respBody, status, err := c.doWithRetry(http.MethodPost, url, body)
	if err != nil {
		log.Printf("[Rust 프록시 호출 실패] path=%s, err=%v", path, err)
		return nil, 0, fmt.Errorf("Rust 엔진 호출 실패: %w", err)
	}

	return respBody, status, nil
}

// CallCalcRawGet — Rust 계산엔진에 GET 요청 전달 (health, ready 등)
// 비유: "계산실 상태만 확인하고 돌아오는 것"
func (c *EngineClient) CallCalcRawGet(path string) ([]byte, int, error) {
	url := c.BaseURL + path

	body, status, err := c.doWithRetry(http.MethodGet, url, nil)
	if err != nil {
		log.Printf("[Rust 프록시 GET 실패] path=%s, err=%v", path, err)
		return nil, 0, fmt.Errorf("Rust 엔진 호출 실패: %w", err)
	}

	return body, status, nil
}

// inventoryRequest — Rust 재고 집계 요청 구조체
// 비유: "재고 조회 신청서" — Go에서 Rust로 보내는 요청
type inventoryRequest struct {
	CompanyID      string  `json:"company_id"`
	ProductID      *string `json:"product_id,omitempty"`
	ManufacturerID *string `json:"manufacturer_id,omitempty"`
}

// GetInventory — Rust 재고 집계 API 호출
// 비유: "계산실에 재고 현황판 요청서를 보내고 결과를 받아오는 것"
func (c *EngineClient) GetInventory(companyID string, productID, manufacturerID *string) (InventoryResponse, error) {
	req := inventoryRequest{
		CompanyID:      companyID,
		ProductID:      productID,
		ManufacturerID: manufacturerID,
	}

	data, err := c.CallCalc("inventory", req)
	if err != nil {
		return InventoryResponse{}, err
	}

	var result InventoryResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[재고 집계 응답 파싱 실패] %v", err)
		return InventoryResponse{}, fmt.Errorf("재고 집계 응답 파싱 실패: %w", err)
	}

	return result, nil
}

// InventoryResponse — Rust 재고 집계 응답 (engine 패키지 내부 사용)
type InventoryResponse struct {
	Items        []InventoryItem  `json:"items"`
	Summary      InventorySummary `json:"summary"`
	CalculatedAt string           `json:"calculated_at"`
}

// InventoryItem — 품번별 재고 상세
type InventoryItem struct {
	ProductID          string  `json:"product_id"`
	ProductCode        string  `json:"product_code"`
	ProductName        string  `json:"product_name"`
	ManufacturerName   string  `json:"manufacturer_name"`
	SpecWP             int     `json:"spec_wp"`
	ModuleWidthMM      int     `json:"module_width_mm"`
	ModuleHeightMM     int     `json:"module_height_mm"`
	PhysicalKW         float64 `json:"physical_kw"`
	ReservedKW         float64 `json:"reserved_kw"`
	AllocatedKW        float64 `json:"allocated_kw"`
	AvailableKW        float64 `json:"available_kw"`
	IncomingKW         float64 `json:"incoming_kw"`
	IncomingReservedKW float64 `json:"incoming_reserved_kw"`
	AvailableIncomingKW float64 `json:"available_incoming_kw"`
	TotalSecuredKW     float64 `json:"total_secured_kw"`
	LongTermStatus     string  `json:"long_term_status"`
}

// InventorySummary — 전체 합계
type InventorySummary struct {
	TotalPhysicalKW  float64 `json:"total_physical_kw"`
	TotalAvailableKW float64 `json:"total_available_kw"`
	TotalIncomingKW  float64 `json:"total_incoming_kw"`
	TotalSecuredKW   float64 `json:"total_secured_kw"`
}

// === Landed Cost ===

// landedCostCalcRequest — Rust Landed Cost 요청 구조체
type landedCostCalcRequest struct {
	DeclarationID *string `json:"declaration_id,omitempty"`
	CompanyID     *string `json:"company_id,omitempty"`
	BLID          *string `json:"bl_id,omitempty"`
	Save          bool    `json:"save"`
}

// LandedCostCalcResponse — Rust Landed Cost 응답 (engine 패키지)
type LandedCostCalcResponse struct {
	Items        []LandedCostCalcItem `json:"items"`
	Saved        bool                 `json:"saved"`
	CalculatedAt string               `json:"calculated_at"`
}

// LandedCostCalcItem — Landed Cost 라인아이템
type LandedCostCalcItem struct {
	CostID            string             `json:"cost_id"`
	DeclarationID     string             `json:"declaration_id"`
	DeclarationNumber string             `json:"declaration_number"`
	ProductID         string             `json:"product_id"`
	ProductCode       string             `json:"product_code"`
	ProductName       string             `json:"product_name"`
	ManufacturerName  string             `json:"manufacturer_name"`
	Quantity          int                `json:"quantity"`
	CapacityKW        float64            `json:"capacity_kw"`
	ExchangeRate      float64            `json:"exchange_rate"`
	AllocatedExpenses map[string]float64 `json:"allocated_expenses"`
	TotalExpenseKRW   float64            `json:"total_expense_krw"`
	LandedTotalKRW    float64            `json:"landed_total_krw"`
	LandedWpKRW       float64            `json:"landed_wp_krw"`
}

// CalcLandedCost — Rust Landed Cost 계산 API 호출
// 비유: "계산실에 원가 계산 요청서를 보내고 결과를 받아오는 것"
func (c *EngineClient) CalcLandedCost(declarationID, companyID, blID *string, save bool) (LandedCostCalcResponse, error) {
	req := landedCostCalcRequest{
		DeclarationID: declarationID,
		CompanyID:     companyID,
		BLID:          blID,
		Save:          save,
	}

	data, err := c.CallCalc("landed-cost", req)
	if err != nil {
		return LandedCostCalcResponse{}, err
	}

	var result LandedCostCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[Landed Cost 응답 파싱 실패] %v", err)
		return LandedCostCalcResponse{}, fmt.Errorf("Landed Cost 응답 파싱 실패: %w", err)
	}

	return result, nil
}

// === 환율 비교 ===

// exchangeCompareCalcRequest — Rust 환율 비교 요청 구조체
type exchangeCompareCalcRequest struct {
	CompanyID      string  `json:"company_id"`
	ProductID      *string `json:"product_id,omitempty"`
	ManufacturerID *string `json:"manufacturer_id,omitempty"`
}

// ExchangeCompareCalcResponse — Rust 환율 비교 응답 (engine 패키지)
type ExchangeCompareCalcResponse struct {
	Items            []ExchangeCompareCalcItem `json:"items"`
	LatestRate       float64                   `json:"latest_rate"`
	LatestRateSource string                    `json:"latest_rate_source"`
	CalculatedAt     string                    `json:"calculated_at"`
}

// ExchangeCompareCalcItem — 환율 비교 라인아이템
type ExchangeCompareCalcItem struct {
	DeclarationNumber string  `json:"declaration_number"`
	DeclarationDate   string  `json:"declaration_date"`
	ProductName       string  `json:"product_name"`
	ContractRate      float64 `json:"contract_rate"`
	CifWpAtContract   float64 `json:"cif_wp_at_contract"`
	CifWpAtLatest     float64 `json:"cif_wp_at_latest"`
	RateImpactKRW     float64 `json:"rate_impact_krw"`
}

// CompareExchangeRates — Rust 환율 비교 API 호출
// 비유: "계산실에 환율 비교 요청서를 보내고 결과를 받아오는 것"
func (c *EngineClient) CompareExchangeRates(companyID string, productID, manufacturerID *string) (ExchangeCompareCalcResponse, error) {
	req := exchangeCompareCalcRequest{
		CompanyID:      companyID,
		ProductID:      productID,
		ManufacturerID: manufacturerID,
	}

	data, err := c.CallCalc("exchange-compare", req)
	if err != nil {
		return ExchangeCompareCalcResponse{}, err
	}

	var result ExchangeCompareCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[환율 비교 응답 파싱 실패] %v", err)
		return ExchangeCompareCalcResponse{}, fmt.Errorf("환율 비교 응답 파싱 실패: %w", err)
	}

	return result, nil
}

// === LC 수수료/한도/만기 ===

// lcFeeCalcRequest — Rust LC 수수료 요청
type lcFeeCalcRequest struct {
	LCID         *string  `json:"lc_id,omitempty"`
	CompanyID    *string  `json:"company_id,omitempty"`
	StatusFilter []string `json:"status_filter,omitempty"`
}

// LcFeeCalcResponse — Rust LC 수수료 응답 (engine 패키지)
type LcFeeCalcResponse struct {
	Items        []LcFeeCalcItem  `json:"items"`
	Summary      LcFeeCalcSummary `json:"summary"`
	FeeNote      string           `json:"fee_note"`
	CalculatedAt string           `json:"calculated_at"`
}

// LcFeeCalcItem — LC 수수료 라인아이템 (간략)
type LcFeeCalcItem struct {
	LCID        string  `json:"lc_id"`
	LCNumber    *string `json:"lc_number"`
	BankName    string  `json:"bank_name"`
	AmountUSD   float64 `json:"amount_usd"`
	TotalFeeKRW float64 `json:"total_fee_krw"`
}

// LcFeeCalcSummary — 수수료 합계
type LcFeeCalcSummary struct {
	TotalFeeKRW float64 `json:"total_fee_krw"`
}

// CalcLcFees — Rust LC 수수료 API 호출
func (c *EngineClient) CalcLcFees(lcID, companyID *string, statusFilter []string) (LcFeeCalcResponse, error) {
	req := lcFeeCalcRequest{LCID: lcID, CompanyID: companyID, StatusFilter: statusFilter}
	data, err := c.CallCalc("lc-fee", req)
	if err != nil {
		return LcFeeCalcResponse{}, err
	}
	var result LcFeeCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[LC 수수료 응답 파싱 실패] %v", err)
		return LcFeeCalcResponse{}, fmt.Errorf("LC 수수료 응답 파싱 실패: %w", err)
	}
	return result, nil
}

// lcLimitTimelineCalcRequest — Rust 한도 복원 타임라인 요청
type lcLimitTimelineCalcRequest struct {
	CompanyID   *string `json:"company_id,omitempty"`
	MonthsAhead int     `json:"months_ahead"`
}

// LcLimitTimelineCalcResponse — 한도 타임라인 응답 (간략)
type LcLimitTimelineCalcResponse struct {
	Banks        []BankTimelineCalc `json:"banks"`
	CalculatedAt string             `json:"calculated_at"`
}

// BankTimelineCalc — 은행 타임라인 (간략)
type BankTimelineCalc struct {
	BankID              string  `json:"bank_id"`
	BankName            string  `json:"bank_name"`
	LCLimitUSD          float64 `json:"lc_limit_usd"`
	CurrentAvailableUSD float64 `json:"current_available_usd"`
	UsageRate           float64 `json:"usage_rate"`
}

// GetLcLimitTimeline — Rust 한도 복원 타임라인 API 호출
func (c *EngineClient) GetLcLimitTimeline(companyID *string, monthsAhead int) (LcLimitTimelineCalcResponse, error) {
	req := lcLimitTimelineCalcRequest{CompanyID: companyID, MonthsAhead: monthsAhead}
	data, err := c.CallCalc("lc-limit-timeline", req)
	if err != nil {
		return LcLimitTimelineCalcResponse{}, err
	}
	var result LcLimitTimelineCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[한도 타임라인 응답 파싱 실패] %v", err)
		return LcLimitTimelineCalcResponse{}, fmt.Errorf("한도 타임라인 응답 파싱 실패: %w", err)
	}
	return result, nil
}

// lcMaturityAlertCalcRequest — Rust 만기 알림 요청
type lcMaturityAlertCalcRequest struct {
	CompanyID *string `json:"company_id,omitempty"`
	DaysAhead int     `json:"days_ahead"`
}

// LcMaturityAlertCalcResponse — 만기 알림 응답 (간략)
type LcMaturityAlertCalcResponse struct {
	Alerts       []MaturityAlertCalc `json:"alerts"`
	Count        int                 `json:"count"`
	CalculatedAt string              `json:"calculated_at"`
}

// MaturityAlertCalc — 만기 알림 항목 (간략)
type MaturityAlertCalc struct {
	LCID          string  `json:"lc_id"`
	LCNumber      *string `json:"lc_number"`
	BankName      string  `json:"bank_name"`
	AmountUSD     float64 `json:"amount_usd"`
	DaysRemaining int64   `json:"days_remaining"`
	Severity      string  `json:"severity"`
}

// GetLcMaturityAlerts — Rust 만기 알림 API 호출
func (c *EngineClient) GetLcMaturityAlerts(companyID *string, daysAhead int) (LcMaturityAlertCalcResponse, error) {
	req := lcMaturityAlertCalcRequest{CompanyID: companyID, DaysAhead: daysAhead}
	data, err := c.CallCalc("lc-maturity-alert", req)
	if err != nil {
		return LcMaturityAlertCalcResponse{}, err
	}
	var result LcMaturityAlertCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[만기 알림 응답 파싱 실패] %v", err)
		return LcMaturityAlertCalcResponse{}, fmt.Errorf("만기 알림 응답 파싱 실패: %w", err)
	}
	return result, nil
}

// === 마진/거래처/단가 추이 ===

// marginAnalysisCalcRequest — Rust 마진 분석 요청
type marginAnalysisCalcRequest struct {
	CompanyID      string  `json:"company_id"`
	ManufacturerID *string `json:"manufacturer_id,omitempty"`
	ProductID      *string `json:"product_id,omitempty"`
	DateFrom       *string `json:"date_from,omitempty"`
	DateTo         *string `json:"date_to,omitempty"`
	CostBasis      string  `json:"cost_basis"`
}

// MarginCalcResponse — 마진 분석 응답 (engine 간략)
type MarginCalcResponse struct {
	Items        []MarginCalcItem    `json:"items"`
	Summary      MarginCalcSummary   `json:"summary"`
	CalculatedAt string              `json:"calculated_at"`
}
type MarginCalcItem struct {
	ProductCode    string   `json:"product_code"`
	AvgSalePriceWP float64  `json:"avg_sale_price_wp"`
	MarginRate     *float64 `json:"margin_rate"`
	TotalRevenueKRW float64 `json:"total_revenue_krw"`
}
type MarginCalcSummary struct {
	OverallMarginRate float64 `json:"overall_margin_rate"`
	CostBasis         string  `json:"cost_basis"`
}

// GetMarginAnalysis — Rust 마진 분석 API 호출
func (c *EngineClient) GetMarginAnalysis(companyID string, mfgID, prodID, dateFrom, dateTo *string, costBasis string) (MarginCalcResponse, error) {
	if costBasis == "" { costBasis = "cif" }
	req := marginAnalysisCalcRequest{CompanyID: companyID, ManufacturerID: mfgID, ProductID: prodID, DateFrom: dateFrom, DateTo: dateTo, CostBasis: costBasis}
	data, err := c.CallCalc("margin-analysis", req)
	if err != nil { return MarginCalcResponse{}, err }
	var result MarginCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[마진 분석 응답 파싱 실패] %v", err)
		return MarginCalcResponse{}, fmt.Errorf("마진 분석 응답 파싱 실패: %w", err)
	}
	return result, nil
}

// customerAnalysisCalcRequest — Rust 거래처 분석 요청
type customerAnalysisCalcRequest struct {
	CompanyID  string  `json:"company_id"`
	CustomerID *string `json:"customer_id,omitempty"`
	DateFrom   *string `json:"date_from,omitempty"`
	DateTo     *string `json:"date_to,omitempty"`
}

// CustomerCalcResponse — 거래처 분석 응답 (engine 간략)
type CustomerCalcResponse struct {
	Items        []CustomerCalcItem `json:"items"`
	CalculatedAt string             `json:"calculated_at"`
}
type CustomerCalcItem struct {
	CustomerName    string  `json:"customer_name"`
	TotalSalesKRW   float64 `json:"total_sales_krw"`
	OutstandingKRW  float64 `json:"outstanding_krw"`
	Status          string  `json:"status"`
}

// GetCustomerAnalysis — Rust 거래처 분석 API 호출
func (c *EngineClient) GetCustomerAnalysis(companyID string, customerID, dateFrom, dateTo *string) (CustomerCalcResponse, error) {
	req := customerAnalysisCalcRequest{CompanyID: companyID, CustomerID: customerID, DateFrom: dateFrom, DateTo: dateTo}
	data, err := c.CallCalc("customer-analysis", req)
	if err != nil { return CustomerCalcResponse{}, err }
	var result CustomerCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[거래처 분석 응답 파싱 실패] %v", err)
		return CustomerCalcResponse{}, fmt.Errorf("거래처 분석 응답 파싱 실패: %w", err)
	}
	return result, nil
}

// priceTrendCalcRequest — Rust 단가 추이 요청
type priceTrendCalcRequest struct {
	CompanyID      string  `json:"company_id"`
	ManufacturerID *string `json:"manufacturer_id,omitempty"`
	ProductID      *string `json:"product_id,omitempty"`
	Period         string  `json:"period"`
}

// PriceTrendCalcResponse — 단가 추이 응답 (engine 간략)
type PriceTrendCalcResponse struct {
	Trends       []TrendCalcProduct `json:"trends"`
	CalculatedAt string             `json:"calculated_at"`
}
type TrendCalcProduct struct {
	ManufacturerName string `json:"manufacturer_name"`
	ProductName      string `json:"product_name"`
	SpecWP           int    `json:"spec_wp"`
}

// GetPriceTrend — Rust 단가 추이 API 호출
func (c *EngineClient) GetPriceTrend(companyID string, mfgID, prodID *string, period string) (PriceTrendCalcResponse, error) {
	if period == "" { period = "quarterly" }
	req := priceTrendCalcRequest{CompanyID: companyID, ManufacturerID: mfgID, ProductID: prodID, Period: period}
	data, err := c.CallCalc("price-trend", req)
	if err != nil { return PriceTrendCalcResponse{}, err }
	var result PriceTrendCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[단가 추이 응답 파싱 실패] %v", err)
		return PriceTrendCalcResponse{}, fmt.Errorf("단가 추이 응답 파싱 실패: %w", err)
	}
	return result, nil
}

// === 수급 전망 ===

// forecastCalcRequest — Rust 수급 전망 요청
type forecastCalcRequest struct {
	CompanyID      string  `json:"company_id"`
	ProductID      *string `json:"product_id,omitempty"`
	ManufacturerID *string `json:"manufacturer_id,omitempty"`
	MonthsAhead    int     `json:"months_ahead"`
}

// ForecastCalcResponse — 수급 전망 응답 (engine 간략)
type ForecastCalcResponse struct {
	Products     []ForecastCalcProduct `json:"products"`
	CalculatedAt string                `json:"calculated_at"`
}

// ForecastCalcProduct — 품번별 전망 (간략)
type ForecastCalcProduct struct {
	ProductCode      string `json:"product_code"`
	ManufacturerName string `json:"manufacturer_name"`
	SpecWP           int    `json:"spec_wp"`
}

// GetSupplyForecast — Rust 수급 전망 API 호출
func (c *EngineClient) GetSupplyForecast(companyID string, prodID, mfgID *string, monthsAhead int) (ForecastCalcResponse, error) {
	if monthsAhead <= 0 { monthsAhead = 6 }
	req := forecastCalcRequest{CompanyID: companyID, ProductID: prodID, ManufacturerID: mfgID, MonthsAhead: monthsAhead}
	data, err := c.CallCalc("supply-forecast", req)
	if err != nil { return ForecastCalcResponse{}, err }
	var result ForecastCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[수급 전망 응답 파싱 실패] %v", err)
		return ForecastCalcResponse{}, fmt.Errorf("수급 전망 응답 파싱 실패: %w", err)
	}
	return result, nil
}

// === 수금 매칭 ===

// outstandingListCalcRequest — Rust 미수금 목록 요청
type outstandingListCalcRequest struct {
	CompanyID  string `json:"company_id"`
	CustomerID string `json:"customer_id"`
}

// OutstandingListCalcResponse — 미수금 목록 응답 (engine 간략)
type OutstandingListCalcResponse struct {
	CustomerName     string  `json:"customer_name"`
	TotalOutstanding float64 `json:"total_outstanding"`
	OutstandingCount int     `json:"outstanding_count"`
	CalculatedAt     string  `json:"calculated_at"`
}

// GetOutstandingList — Rust 미수금 목록 API 호출
func (c *EngineClient) GetOutstandingList(companyID, customerID string) (OutstandingListCalcResponse, error) {
	req := outstandingListCalcRequest{CompanyID: companyID, CustomerID: customerID}
	data, err := c.CallCalc("outstanding-list", req)
	if err != nil { return OutstandingListCalcResponse{}, err }
	var result OutstandingListCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[미수금 목록 응답 파싱 실패] %v", err)
		return OutstandingListCalcResponse{}, fmt.Errorf("미수금 목록 응답 파싱 실패: %w", err)
	}
	return result, nil
}

// receiptMatchSuggestCalcRequest — Rust 매칭 추천 요청
type receiptMatchSuggestCalcRequest struct {
	CompanyID     string  `json:"company_id"`
	CustomerID    string  `json:"customer_id"`
	ReceiptAmount float64 `json:"receipt_amount"`
}

// ReceiptMatchSuggestCalcResponse — 매칭 추천 응답 (engine 간략)
type ReceiptMatchSuggestCalcResponse struct {
	ReceiptAmount   float64                 `json:"receipt_amount"`
	Suggestions     []SuggestionCalcItem    `json:"suggestions"`
	UnmatchedAmount float64                 `json:"unmatched_amount"`
	CalculatedAt    string                  `json:"calculated_at"`
}

// SuggestionCalcItem — 추천 조합 (간략)
type SuggestionCalcItem struct {
	MatchType    string  `json:"match_type"`
	TotalMatched float64 `json:"total_matched"`
	Remainder    float64 `json:"remainder"`
	MatchRate    float64 `json:"match_rate"`
}

// SuggestReceiptMatch — Rust 매칭 추천 API 호출
func (c *EngineClient) SuggestReceiptMatch(companyID, customerID string, receiptAmount float64) (ReceiptMatchSuggestCalcResponse, error) {
	req := receiptMatchSuggestCalcRequest{CompanyID: companyID, CustomerID: customerID, ReceiptAmount: receiptAmount}
	data, err := c.CallCalc("receipt-match-suggest", req)
	if err != nil { return ReceiptMatchSuggestCalcResponse{}, err }
	var result ReceiptMatchSuggestCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[매칭 추천 응답 파싱 실패] %v", err)
		return ReceiptMatchSuggestCalcResponse{}, fmt.Errorf("매칭 추천 응답 파싱 실패: %w", err)
	}
	return result, nil
}

// === 자연어 검색 ===

// searchCalcRequest — Rust 검색 요청
type searchCalcRequest struct {
	CompanyID string `json:"company_id"`
	Query     string `json:"query"`
}

// SearchCalcResponse — 검색 응답 (engine 간략)
type SearchCalcResponse struct {
	Query        string `json:"query"`
	Intent       string `json:"intent"`
	CalculatedAt string `json:"calculated_at"`
}

// Search — Rust 검색 API 호출
func (c *EngineClient) Search(companyID, query string) (SearchCalcResponse, error) {
	req := searchCalcRequest{CompanyID: companyID, Query: query}
	data, err := c.CallCalc("search", req)
	if err != nil { return SearchCalcResponse{}, err }
	var result SearchCalcResponse
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("[검색 응답 파싱 실패] %v", err)
		return SearchCalcResponse{}, fmt.Errorf("검색 응답 파싱 실패: %w", err)
	}
	return result, nil
}
