package engine

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
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

// CheckHealth — Rust 엔진 상태 확인 (/health/ready 호출)
// 비유: "계산실 전화해서 설비 정상인지 확인하는 것"
func (c *EngineClient) CheckHealth() (HealthResponse, error) {
	url := c.BaseURL + "/health/ready"
	var result HealthResponse

	resp, err := c.HTTPClient.Get(url)
	if err != nil {
		log.Printf("[Rust 엔진 헬스체크 실패] url=%s, err=%v", url, err)
		return result, fmt.Errorf("Rust 엔진 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[Rust 엔진 헬스체크 응답 읽기 실패] %v", err)
		return result, fmt.Errorf("Rust 엔진 응답 읽기 실패: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("[Rust 엔진 헬스체크 비정상] status=%d, body=%s", resp.StatusCode, string(body))
		return result, fmt.Errorf("Rust 엔진 비정상 상태: %d", resp.StatusCode)
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
// 참고: Rust 엔진은 fly.io auto_stop으로 꺼져 있을 수 있음.
// 첫 요청 시 콜드 스타트 1~3초 지연 가능. 타임아웃 10초로 충분.
// 재시도 로직은 필요 시 추가 (현재 불필요).
func (c *EngineClient) CallCalc(path string, reqBody interface{}) ([]byte, error) {
	url := c.BaseURL + "/api/calc/" + path

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		log.Printf("[Rust 엔진 요청 직렬화 실패] path=%s, err=%v", path, err)
		return nil, fmt.Errorf("요청 데이터 직렬화 실패: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(jsonData))
	if err != nil {
		log.Printf("[Rust 엔진 요청 생성 실패] path=%s, err=%v", path, err)
		return nil, fmt.Errorf("요청 생성 실패: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		log.Printf("[Rust 엔진 호출 실패] path=%s, err=%v", path, err)
		return nil, fmt.Errorf("Rust 엔진 호출 실패: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[Rust 엔진 응답 읽기 실패] path=%s, err=%v", path, err)
		return nil, fmt.Errorf("Rust 엔진 응답 읽기 실패: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("[Rust 엔진 계산 실패] path=%s, status=%d, body=%s", path, resp.StatusCode, string(body))
		return nil, fmt.Errorf("Rust 엔진 계산 실패: status=%d, body=%s", resp.StatusCode, string(body))
	}

	return body, nil
}
