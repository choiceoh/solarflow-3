package handler

// AI assistant — 외부 웹 검색·fetch 도구.
//
// web_search: Serper API 호출 (SERPER_API_KEY 환경변수). 사내 데이터(거래처/PO 등)는
//   다른 search_* 도구로 조회 — 본 도구는 외부 시세·뉴스·규제·외부 회사 정보용.
//   PR 45: Tavily → Serper 전환. PR 46: time_window(tbs) + peopleAlsoAsk +
//   relatedSearches + 검색 연산자 (site/before/after/filetype) 노출.
// web_scrape: PR 46 신설. Serper scrape (scrape.serper.dev) 로 외부 페이지 본문을
//   markdown 으로 추출. fetch_url 이 raw HTML 을 반환하는 반면 본 도구는 본문만
//   정제된 markdown — vLLM 토큰 효율 ↑. 외부 정적 페이지·뉴스·블로그·리포트 추출용.
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

// --- web_search (Serper / Google) ---
// PR 45: Tavily → Serper 전환. Google 검색 결과 직접.
// PR 46: time_window(tbs), 검색 연산자 (site/before/after/filetype), peopleAlsoAsk,
//        relatedSearches 노출.

type webSearchInput struct {
	Query      string `json:"query"`
	MaxResults int    `json:"max_results,omitempty"`
	// PR 46: 시간 필터. "day"|"week"|"month"|"year" → tbs=qdr:d/w/m/y. ""은 미적용.
	TimeWindow string `json:"time_window,omitempty"`
	// PR 46: site 한정 (e.g. "ir.jinkosolar.com").
	Site string `json:"site,omitempty"`
	// PR 46: 날짜 하한/상한 (YYYY-MM-DD). before/after Google 연산자.
	After  string `json:"after,omitempty"`
	Before string `json:"before,omitempty"`
	// PR 46: 파일 타입 필터 (pdf, doc, xlsx 등).
	FileType string `json:"filetype,omitempty"`
}

// serperOrganicItem — Serper API 의 organic 결과.
type serperOrganicItem struct {
	Title    string `json:"title"`
	Link     string `json:"link"`
	Snippet  string `json:"snippet"`
	Date     string `json:"date,omitempty"`     // PR 46
	Position int    `json:"position,omitempty"` // PR 46
}

// serperPeopleAlsoAsk — PR 46.
type serperPeopleAlsoAsk struct {
	Question string `json:"question"`
	Snippet  string `json:"snippet"`
	Title    string `json:"title,omitempty"`
	Link     string `json:"link,omitempty"`
}

// serperRelatedSearch — PR 46.
type serperRelatedSearch struct {
	Query string `json:"query"`
}

type serperResponse struct {
	Organic   []serperOrganicItem `json:"organic"`
	AnswerBox *struct {
		Answer  string `json:"answer"`
		Snippet string `json:"snippet"`
	} `json:"answerBox,omitempty"`
	KnowledgeGraph *struct {
		Title       string            `json:"title"`
		Type        string            `json:"type,omitempty"`
		Website     string            `json:"website,omitempty"`
		Description string            `json:"description"`
		Attributes  map[string]string `json:"attributes,omitempty"`
	} `json:"knowledgeGraph,omitempty"`
	PeopleAlsoAsk   []serperPeopleAlsoAsk `json:"peopleAlsoAsk,omitempty"`   // PR 46
	RelatedSearches []serperRelatedSearch `json:"relatedSearches,omitempty"` // PR 46
}

// webSearchResultItem — 외부 노출 형태 (기존 Tavily 호환 유지).
// 다른 모듈 (가격예측 등) 이 같은 shape 를 기대하므로 변경 없이 유지.
type webSearchResultItem struct {
	Title   string  `json:"title"`
	URL     string  `json:"url"`
	Content string  `json:"content"`
	Score   float64 `json:"score"`
	Date    string  `json:"date,omitempty"` // PR 46: news/뉴스성 결과의 게시 날짜
}

// timeWindowToTBS — PR 46. "day"|"week"|"month"|"year" → Google tbs.
// 빈 값/미지원 값은 "" 반환 (필터 미적용).
func timeWindowToTBS(w string) string {
	switch strings.ToLower(strings.TrimSpace(w)) {
	case "hour", "h":
		return "qdr:h"
	case "day", "d":
		return "qdr:d"
	case "week", "w":
		return "qdr:w"
	case "month", "m":
		return "qdr:m"
	case "year", "y":
		return "qdr:y"
	default:
		return ""
	}
}

// buildSerperQuery — PR 46. 사용자 query 에 site:/before:/after:/filetype: 연산자 부착.
// 이미 query 안에 동일 연산자가 있으면 중복 추가 안 함.
func buildSerperQuery(q, site, after, before, filetype string) string {
	q = strings.TrimSpace(q)
	if site = strings.TrimSpace(site); site != "" && !strings.Contains(q, "site:") {
		q += " site:" + site
	}
	if after = strings.TrimSpace(after); after != "" && !strings.Contains(q, "after:") {
		q += " after:" + after
	}
	if before = strings.TrimSpace(before); before != "" && !strings.Contains(q, "before:") {
		q += " before:" + before
	}
	if filetype = strings.TrimSpace(filetype); filetype != "" && !strings.Contains(q, "filetype:") {
		q += " filetype:" + filetype
	}
	return q
}

func toolWebSearch() assistantTool {
	return assistantTool{
		name:        "web_search",
		description: "외부 웹 검색 (Serper / Google). 사내 데이터(거래처/수주/PO/면장 등)는 본 도구가 아닌 search_* 도구로 조회하세요. 본 도구는 시세·시장 동향·뉴스·규제 변경·외부 회사 정보 등 사내 DB 에 없는 정보용. 한국어 검색어 정상 작동. PR 46: time_window 로 최근 자료만 필터(예: 'week'), site 로 도메인 한정, after/before 로 날짜 범위, filetype 으로 PDF/DOC 등 한정. 결과 형식: {query, answer, results:[{title,url,content,score,date}], related_questions[], related_searches[], count}.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"query": {"type": "string", "description": "검색어 (한국어/영어). 사내 거래처명·PO 번호 등 내부 식별자 검색 금지."},
				"max_results": {"type": "integer", "description": "최대 결과 수, 기본 5, 최대 10"},
				"time_window": {"type": "string", "enum": ["", "hour", "day", "week", "month", "year"], "description": "최신성 필터. 'week'=지난 7일, 'month'=지난 30일 등. 시세·뉴스 조회 시 권장."},
				"site": {"type": "string", "description": "도메인 한정 (예: 'ir.jinkosolar.com'). Google site: 연산자."},
				"after": {"type": "string", "description": "날짜 하한 YYYY-MM-DD (예: '2026-01-01'). Google after: 연산자."},
				"before": {"type": "string", "description": "날짜 상한 YYYY-MM-DD. Google before: 연산자."},
				"filetype": {"type": "string", "description": "파일 타입 한정 (pdf/doc/xlsx 등). Google filetype: 연산자."}
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
			apiKey := strings.TrimSpace(os.Getenv("SERPER_API_KEY"))
			if apiKey == "" {
				return "", fmt.Errorf("웹 검색 미설정 (SERPER_API_KEY 부재). 운영자에게 문의하세요.")
			}
			finalQuery := buildSerperQuery(args.Query, args.Site, args.After, args.Before, args.FileType)
			reqBody := map[string]any{
				"q":   finalQuery,
				"num": clampLimit(args.MaxResults, 5, 10),
				"gl":  "kr",
				"hl":  "ko",
			}
			if tbs := timeWindowToTBS(args.TimeWindow); tbs != "" {
				reqBody["tbs"] = tbs
			}
			body, _ := json.Marshal(reqBody)
			httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://google.serper.dev/search", bytes.NewReader(body))
			if err != nil {
				return "", fmt.Errorf("요청 생성 실패: %w", err)
			}
			httpReq.Header.Set("Content-Type", "application/json")
			httpReq.Header.Set("X-API-KEY", apiKey)
			client := &http.Client{Timeout: 15 * time.Second}
			resp, err := client.Do(httpReq)
			if err != nil {
				return "", fmt.Errorf("Serper 호출 실패: %w", err)
			}
			defer resp.Body.Close()
			if resp.StatusCode/100 != 2 {
				msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
				return "", fmt.Errorf("Serper HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
			}
			raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
			if err != nil {
				return "", fmt.Errorf("Serper 응답 읽기 실패: %w", err)
			}
			var parsed serperResponse
			if err := json.Unmarshal(raw, &parsed); err != nil {
				return "", fmt.Errorf("Serper 응답 파싱 실패: %w", err)
			}
			answer := ""
			if parsed.AnswerBox != nil {
				if parsed.AnswerBox.Answer != "" {
					answer = parsed.AnswerBox.Answer
				} else {
					answer = parsed.AnswerBox.Snippet
				}
			} else if parsed.KnowledgeGraph != nil && parsed.KnowledgeGraph.Description != "" {
				answer = parsed.KnowledgeGraph.Description
			}
			results := make([]webSearchResultItem, 0, len(parsed.Organic))
			for _, o := range parsed.Organic {
				results = append(results, webSearchResultItem{
					Title:   o.Title,
					URL:     o.Link,
					Content: o.Snippet,
					Score:   0,
					Date:    o.Date,
				})
			}
			// PR 46: peopleAlsoAsk / relatedSearches 압축 노출.
			relatedQuestions := make([]map[string]string, 0, len(parsed.PeopleAlsoAsk))
			for _, p := range parsed.PeopleAlsoAsk {
				relatedQuestions = append(relatedQuestions, map[string]string{
					"question": p.Question,
					"snippet":  p.Snippet,
				})
			}
			relatedSearches := make([]string, 0, len(parsed.RelatedSearches))
			for _, r := range parsed.RelatedSearches {
				if r.Query != "" {
					relatedSearches = append(relatedSearches, r.Query)
				}
			}
			out := map[string]any{
				"query":             args.Query,
				"final_query":       finalQuery, // PR 46: 연산자 부착 후 최종 query (디버깅용)
				"answer":            answer,
				"results":           results,
				"related_questions": relatedQuestions,
				"related_searches":  relatedSearches,
				"count":             len(results),
			}
			b, _ := json.Marshal(out)
			return string(b), nil
		},
	}
}

// --- web_scrape (Serper scrape) ---
// PR 46 신설. scrape.serper.dev 호출 — 외부 페이지를 markdown 으로 정제 추출.
// fetch_url 과 차이: 본 도구는 본문만 추출 (HTML 노이즈 제거), 토큰 효율 ↑,
// JS 렌더링 처리, 외부 egress 는 Serper 가 담당 (SSRF 가드 불필요 — 단 외부 URL 만).
// 가격 벤치마크 evidence 수집·뉴스 본문·블로그·리포트 추출에 권장.

type webScrapeInput struct {
	URL string `json:"url"`
}

// serperScrapeResponse — Serper scrape 응답.
type serperScrapeResponse struct {
	Text     string            `json:"text"`
	Markdown string            `json:"markdown,omitempty"`
	Metadata map[string]string `json:"metadata,omitempty"`
	JSONLD   any               `json:"jsonld,omitempty"`
	Credits  int               `json:"credits,omitempty"`
}

func toolWebScrape() assistantTool {
	return assistantTool{
		name:        "web_scrape",
		description: "외부 URL 의 본문을 markdown 으로 정제 추출 (Serper scrape). fetch_url 이 raw HTML 을 반환하는 반면 본 도구는 본문만 추출 — 뉴스·블로그·리포트 페이지의 텍스트 분석에 권장. 내부 호스트는 Serper egress 가 닿지 않으므로 외부 URL 전용. 결과 형식: {url, text, markdown, metadata, jsonld, credits}.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"url": {"type": "string", "description": "추출할 외부 URL (http/https). 내부 URL 은 fetch_url 사용."}
			},
			"required": ["url"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin", "operator", "executive") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args webScrapeInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			target := strings.TrimSpace(args.URL)
			if target == "" {
				return "", fmt.Errorf("url 은 필수입니다")
			}
			u, err := url.Parse(target)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
				return "", fmt.Errorf("http/https URL 만 허용됩니다")
			}
			// 외부 도메인만 허용 — Serper egress 가 내부 IP 에 닿진 않지만,
			// 명시적으로 internal hostname 키워드는 거부 (operator 가 실수로 내부 URL 입력 방지).
			if err := guardFetchURL(u); err != nil {
				return "", fmt.Errorf("내부 URL 은 web_scrape 미지원 (fetch_url 사용): %w", err)
			}
			apiKey := strings.TrimSpace(os.Getenv("SERPER_API_KEY"))
			if apiKey == "" {
				return "", fmt.Errorf("스크레이프 미설정 (SERPER_API_KEY 부재). 운영자에게 문의하세요.")
			}
			body, _ := json.Marshal(map[string]any{
				"url":             target,
				"includeMarkdown": true,
			})
			httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://scrape.serper.dev", bytes.NewReader(body))
			if err != nil {
				return "", fmt.Errorf("요청 생성 실패: %w", err)
			}
			httpReq.Header.Set("Content-Type", "application/json")
			httpReq.Header.Set("X-API-KEY", apiKey)
			client := &http.Client{Timeout: 30 * time.Second}
			resp, err := client.Do(httpReq)
			if err != nil {
				return "", fmt.Errorf("Serper scrape 호출 실패: %w", err)
			}
			defer resp.Body.Close()
			if resp.StatusCode/100 != 2 {
				msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
				return "", fmt.Errorf("Serper scrape HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
			}
			raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20)) // 4MB cap (markdown 더 큼)
			if err != nil {
				return "", fmt.Errorf("Serper scrape 응답 읽기 실패: %w", err)
			}
			var parsed serperScrapeResponse
			if err := json.Unmarshal(raw, &parsed); err != nil {
				return "", fmt.Errorf("Serper scrape 응답 파싱 실패: %w", err)
			}
			out := map[string]any{
				"url":      target,
				"text":     parsed.Text,
				"markdown": parsed.Markdown,
				"metadata": parsed.Metadata,
				"jsonld":   parsed.JSONLD,
				"credits":  parsed.Credits,
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
