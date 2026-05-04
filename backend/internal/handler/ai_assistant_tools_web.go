package handler

// AI assistant — 외부 웹 검색·fetch 도구.
//
// web_search: Tavily API 호출 (TAVILY_API_KEY 환경변수). 사내 데이터(거래처/PO 등)는
//   다른 search_* 도구로 조회 — 본 도구는 외부 시세·뉴스·규제·외부 회사 정보용.
// fetch_url: 임의 URL fetch. SSRF 방지를 위해 hostname → IP 해석 후 internal/loopback/
//   link-local IP 는 차단. 응답 1MB / 15s 제한. Google Sheets /edit URL 은 자동으로
//   /export?format=csv 로 변환하여 link-share public 시트 조회 지원.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	supa "github.com/supabase-community/supabase-go"
)

// --- web_search (Tavily) ---

type webSearchInput struct {
	Query      string `json:"query"`
	MaxResults int    `json:"max_results,omitempty"`
}

type tavilyResultItem struct {
	Title   string  `json:"title"`
	URL     string  `json:"url"`
	Content string  `json:"content"`
	Score   float64 `json:"score"`
}

type tavilyResponse struct {
	Answer  string             `json:"answer"`
	Results []tavilyResultItem `json:"results"`
}

func toolWebSearch() assistantTool {
	return assistantTool{
		name:        "web_search",
		description: "외부 웹 검색 (Tavily). 사내 데이터(거래처/수주/PO/면장 등)는 본 도구가 아닌 search_* 도구로 조회하세요. 본 도구는 시세·시장 동향·뉴스·규제 변경·외부 회사 정보 등 사내 DB 에 없는 정보용. 한국어 검색어 정상 작동. 결과 형식: {query, answer, results:[{title,url,content,score}], count}.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"query": {"type": "string", "description": "검색어 (한국어/영어). 사내 거래처명·PO 번호 등 내부 식별자 검색 금지."},
				"max_results": {"type": "integer", "description": "최대 결과 수, 기본 5, 최대 10"}
			},
			"required": ["query"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator", "executive") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args webSearchInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			args.Query = strings.TrimSpace(args.Query)
			if args.Query == "" {
				return "", fmt.Errorf("query 는 필수입니다")
			}
			apiKey := strings.TrimSpace(os.Getenv("TAVILY_API_KEY"))
			if apiKey == "" {
				return "", fmt.Errorf("웹 검색 미설정 (TAVILY_API_KEY 부재). 운영자에게 문의하세요.")
			}
			body, _ := json.Marshal(map[string]any{
				"api_key":      apiKey,
				"query":        args.Query,
				"max_results":  clampLimit(args.MaxResults, 5, 10),
				"search_depth": "basic",
			})
			httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.tavily.com/search", bytes.NewReader(body))
			if err != nil {
				return "", fmt.Errorf("요청 생성 실패: %w", err)
			}
			httpReq.Header.Set("Content-Type", "application/json")
			client := &http.Client{Timeout: 15 * time.Second}
			resp, err := client.Do(httpReq)
			if err != nil {
				return "", fmt.Errorf("Tavily 호출 실패: %w", err)
			}
			defer resp.Body.Close()
			if resp.StatusCode/100 != 2 {
				msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
				return "", fmt.Errorf("Tavily HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
			}
			raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
			if err != nil {
				return "", fmt.Errorf("Tavily 응답 읽기 실패: %w", err)
			}
			var parsed tavilyResponse
			if err := json.Unmarshal(raw, &parsed); err != nil {
				return "", fmt.Errorf("Tavily 응답 파싱 실패: %w", err)
			}
			out := map[string]any{
				"query":   args.Query,
				"answer":  parsed.Answer,
				"results": parsed.Results,
				"count":   len(parsed.Results),
			}
			b, _ := json.Marshal(out)
			return string(b), nil
		},
	}
}

// --- fetch_url ---

type fetchURLInput struct {
	URL string `json:"url"`
}

const (
	fetchURLMaxBytes = 1 << 20 // 1MB
	fetchURLTimeout  = 15 * time.Second
)

func toolFetchURL() assistantTool {
	return assistantTool{
		name:        "fetch_url",
		description: "지정한 URL 의 콘텐츠를 가져옵니다 (HTML/JSON/CSV/TXT). 응답 1MB·15s 제한. 내부 IP(loopback/private/link-local)·*.local·*.internal·localhost 차단. Google Sheets 의 /edit URL 은 자동으로 /export?format=csv 로 변환합니다 (link-share public 시트 한정 — 비공개 시트는 401/403). 결과 형식: {url, status, content_type, body, truncated}.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"url": {"type": "string", "description": "가져올 URL (http/https). 내부 호스트는 차단됨."}
			},
			"required": ["url"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator", "executive") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args fetchURLInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			target := strings.TrimSpace(args.URL)
			if target == "" {
				return "", fmt.Errorf("url 은 필수입니다")
			}
			target = normalizeFetchURL(target)
			u, err := url.Parse(target)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
				return "", fmt.Errorf("http/https URL 만 허용됩니다")
			}
			if err := guardFetchURL(u); err != nil {
				return "", err
			}
			client := &http.Client{
				Timeout: fetchURLTimeout,
				CheckRedirect: func(req *http.Request, via []*http.Request) error {
					if len(via) >= 5 {
						return fmt.Errorf("리다이렉트 5회 초과")
					}
					return guardFetchURL(req.URL)
				},
			}
			httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
			if err != nil {
				return "", fmt.Errorf("요청 생성 실패: %w", err)
			}
			httpReq.Header.Set("User-Agent", "SolarFlow-Assistant/1.0")
			resp, err := client.Do(httpReq)
			if err != nil {
				return "", fmt.Errorf("URL 호출 실패: %w", err)
			}
			defer resp.Body.Close()
			limited := io.LimitReader(resp.Body, int64(fetchURLMaxBytes)+1)
			raw, err := io.ReadAll(limited)
			if err != nil {
				return "", fmt.Errorf("응답 읽기 실패: %w", err)
			}
			truncated := len(raw) > fetchURLMaxBytes
			if truncated {
				raw = raw[:fetchURLMaxBytes]
			}
			out := map[string]any{
				"url":          target,
				"status":       resp.StatusCode,
				"content_type": resp.Header.Get("Content-Type"),
				"body":         string(raw),
				"truncated":    truncated,
			}
			b, _ := json.Marshal(out)
			return string(b), nil
		},
	}
}

// normalizeFetchURL — Google Sheets /edit URL 을 CSV export URL 로 변환.
// /spreadsheets/d/{id}/edit?gid=N   →  /spreadsheets/d/{id}/export?format=csv&gid=N
// /spreadsheets/d/{id}/edit#gid=N   →  /spreadsheets/d/{id}/export?format=csv&gid=N
// 그 외 URL 은 변형 없이 반환.
func normalizeFetchURL(target string) string {
	u, err := url.Parse(target)
	if err != nil || u.Host != "docs.google.com" {
		return target
	}
	if !strings.Contains(u.Path, "/spreadsheets/d/") {
		return target
	}
	parts := strings.Split(u.Path, "/")
	var sheetID string
	for i, p := range parts {
		if p == "d" && i+1 < len(parts) {
			sheetID = parts[i+1]
			break
		}
	}
	if sheetID == "" {
		return target
	}
	gid := u.Query().Get("gid")
	if gid == "" {
		// /edit#gid=N 형태도 지원
		if strings.HasPrefix(u.Fragment, "gid=") {
			gid = strings.TrimPrefix(u.Fragment, "gid=")
		}
	}
	out := "https://docs.google.com/spreadsheets/d/" + sheetID + "/export?format=csv"
	if gid != "" {
		out += "&gid=" + gid
	}
	return out
}

// guardFetchURL — SSRF 방지. hostname 키워드 차단 + DNS 해석 후 internal IP 차단.
// CheckRedirect 에서도 호출 — 리다이렉트마다 재검증.
func guardFetchURL(u *url.URL) error {
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("호스트가 없습니다")
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".local") || strings.HasSuffix(lower, ".internal") {
		return fmt.Errorf("내부 호스트 차단: %s", host)
	}
	// 호스트가 IP literal 인 경우도 처리
	if ip := net.ParseIP(host); ip != nil {
		if isPrivateOrLoopback(ip) {
			return fmt.Errorf("내부 IP 차단: %s", ip.String())
		}
		return nil
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("DNS 해석 실패: %w", err)
	}
	if len(ips) == 0 {
		return fmt.Errorf("DNS 결과 없음: %s", host)
	}
	for _, ip := range ips {
		if isPrivateOrLoopback(ip) {
			return fmt.Errorf("내부 IP 차단: %s (%s)", host, ip.String())
		}
	}
	return nil
}

// isPrivateOrLoopback — RFC 1918/4193 (private) + loopback + link-local + multicast + unspecified 차단.
func isPrivateOrLoopback(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsInterfaceLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified()
}
