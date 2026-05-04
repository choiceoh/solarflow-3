package handler

// AI 어시스턴트 — 한국 태양광 산업 도메인 지식 조회 도구.
// DB 가 아니라 정적 마크다운(assets/solar_domain_kr.md)을 H2 섹션 번호 단위로 슬라이스해 반환.
// LLM 이 RPS/REC/SMP/PPA, 전기사업법, 발전사업 절차, 모듈·인버터 기술, 글로벌·국내 제조사 같은
// 도메인 용어를 사용자 질문에서 만났을 때 호출한다.
//
// 정본은 worktree 루트의 knowledge/DOMAIN_SOLAR_KR.md (graphify 지식 그래프 대상).
// 이 파일의 assets/solar_domain_kr.md 는 Go embed 용 사본이므로, 정본을 수정하면 함께 갱신해야 한다.

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
)

//go:embed assets/solar_domain_kr.md
var solarDomainKRRaw string

var (
	solarDomainOnce sync.Once
	solarDomainTOC  string         // 토픽 목차 (LLM 가 처음 호출 시 받는 안내)
	solarDomainSecs map[int]string // 토픽 번호 → 섹션 마크다운 본문
)

var solarDomainH2Re = regexp.MustCompile(`^## (\d+)\. (.+)$`)

// parseSolarDomainKR — 마크다운을 H2 번호 섹션 단위로 분할.
// 첫 H2 이전(H1·인트로)은 무시하고, 번호 매겨진 H2(`## 1. ...`) 부터 다음 같은 패턴까지를 한 섹션으로 본다.
func parseSolarDomainKR() {
	solarDomainSecs = map[int]string{}
	var (
		curNum  int
		curBody []string
		toc     []string
	)
	flush := func() {
		if curNum > 0 {
			solarDomainSecs[curNum] = strings.Join(curBody, "\n")
		}
	}
	for _, line := range strings.Split(solarDomainKRRaw, "\n") {
		if m := solarDomainH2Re.FindStringSubmatch(line); m != nil {
			flush()
			n, err := strconv.Atoi(m[1])
			if err != nil {
				continue
			}
			curNum = n
			curBody = []string{line}
			toc = append(toc, fmt.Sprintf("%d. %s", n, strings.TrimSpace(m[2])))
			continue
		}
		if curNum > 0 {
			curBody = append(curBody, line)
		}
	}
	flush()
	solarDomainTOC = "한국 태양광 산업 도메인 지식 — 토픽 목차\n" + strings.Join(toc, "\n")
}

type solarDomainInput struct {
	Topic int `json:"topic,omitempty"`
}

func toolGetSolarDomainKnowledge() assistantTool {
	return assistantTool{
		name: "get_solar_domain_knowledge",
		description: "한국 태양광 산업 일반 지식 사전. 사용자가 RPS/REC/SMP/PPA, 전기사업법, 발전사업 허가 절차, 모듈·인버터 기술 분류, 글로벌·국내 제조사처럼 도메인 용어/제도/절차/플레이어를 물으면 호출. " +
			"DB 검색이 아니라 정적 도메인 사전이라 회사 데이터(거래처·주문 등)에는 쓰지 말 것. " +
			"토픽 번호: 1=산업 가치사슬, 2=사업 형태, 3=핵심 제도(RPS/REC/SMP/PPA/RE100/분산법), 4=전기사업법 기초, 5=발전사업 절차, 6=모듈 기술, 7=인버터 기술, 8=글로벌 시장 구조, 9=한국 주요 플레이어, 10=REC 가중치 개념, 11=약어집, 12=헷갈리는 구분, 13=시점 정보 조회처. " +
			"topic 생략(또는 0)이면 목차만 반환 — 처음에는 목차로 호출하고, 필요한 토픽 번호로 재호출하는 것이 토큰 효율적.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"topic": {"type": "integer", "minimum": 0, "maximum": 13, "description": "토픽 번호 1~13. 0 또는 생략 시 목차."}
			}
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(_ context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			solarDomainOnce.Do(parseSolarDomainKR)

			var args solarDomainInput
			if len(input) > 0 {
				if err := json.Unmarshal(input, &args); err != nil {
					return "", fmt.Errorf("입력 파싱 실패: %w", err)
				}
			}

			if args.Topic <= 0 {
				out, _ := json.Marshal(map[string]any{
					"toc":  solarDomainTOC,
					"hint": "topic 번호로 다시 호출하면 해당 섹션의 마크다운 본문을 반환합니다. 사용자 질문이 여러 토픽에 걸치면 토픽별로 각각 호출하세요.",
				})
				return string(out), nil
			}

			body, ok := solarDomainSecs[args.Topic]
			if !ok {
				return "", fmt.Errorf("토픽 %d 없음 — topic=0 으로 목차를 먼저 확인하세요", args.Topic)
			}
			out, _ := json.Marshal(map[string]any{
				"topic":   args.Topic,
				"content": body,
			})
			return string(out), nil
		},
	}
}

// ─── graphify-style 그래프 질의 도구 3종 ─────────────────────────────────────────
// solar_query, solar_explain, solar_path. 내부 그래프는 ai_assistant_knowledge_graph.go 에서
// 임베드 마크다운으로 빌드. 같은 graph.json 을 디스크에 출력하면 graphify CLI 와도 호환.

type solarQueryInput struct {
	Keyword string `json:"keyword"`
	Limit   int    `json:"limit,omitempty"`
}

func toolSolarQuery() assistantTool {
	return assistantTool{
		name: "solar_query",
		description: "한국 태양광 도메인 지식 그래프 키워드 검색. keyword 와 부분일치하는 노드(label·정의 본문) 를 찾고, 각 매칭 노드의 인접 엣지(엣지 1단계 이웃)를 함께 반환. " +
			"RPS·REC·PPA·TOPCon·HJT 같은 영문 약어, 또는 '전기사업법'·'발전사업'·'헷갈리는' 같은 한국어 부분일치 모두 가능. " +
			"결과의 노드 id 로 solar_explain 을 호출해 정의 본문을 받거나, solar_path 로 두 노드 간 의미 관계를 추적.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"keyword": {"type": "string", "description": "검색할 약어/용어/토픽 부분일치 (대소문자 무시)"},
				"limit":   {"type": "integer", "description": "최대 매칭 노드 수, 기본 5, 최대 20"}
			},
			"required": ["keyword"]
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(_ context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args solarQueryInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			args.Keyword = strings.TrimSpace(args.Keyword)
			if args.Keyword == "" {
				return "", fmt.Errorf("keyword 는 필수입니다")
			}
			limit := clampLimit(args.Limit, 5, 20)

			g := loadSolarKnowledgeGraph()
			ids := g.search(args.Keyword)
			if len(ids) > limit {
				ids = ids[:limit]
			}

			type neighborOut struct {
				ID       string `json:"id"`
				Label    string `json:"label"`
				Type     string `json:"type"`
				Relation string `json:"relation"`
			}
			type matchOut struct {
				ID        string        `json:"id"`
				Label     string        `json:"label"`
				Type      string        `json:"type"`
				Neighbors []neighborOut `json:"neighbors"`
			}
			matches := make([]matchOut, 0, len(ids))
			for _, id := range ids {
				n := g.nodeByID[id]
				if n == nil {
					continue
				}
				neighbors := []neighborOut{}
				for _, e := range g.adjacency[id] {
					nb := g.nodeByID[e.Target]
					if nb == nil {
						continue
					}
					neighbors = append(neighbors, neighborOut{
						ID: nb.ID, Label: nb.Label, Type: nb.Type, Relation: e.Relation,
					})
				}
				matches = append(matches, matchOut{
					ID: n.ID, Label: n.Label, Type: n.Type, Neighbors: neighbors,
				})
			}

			res := map[string]any{
				"keyword": args.Keyword,
				"matches": matches,
				"count":   len(matches),
			}
			if len(matches) == 0 {
				res["hint"] = "매칭 노드 없음. 약어 풀이로 검색하거나 get_solar_domain_knowledge 의 토픽 목차로 폴백하세요."
			}
			out, _ := json.Marshal(res)
			return string(out), nil
		},
	}
}

type solarExplainInput struct {
	Node string `json:"node"`
}

func toolSolarExplain() assistantTool {
	return assistantTool{
		name: "solar_explain",
		description: "도메인 그래프 노드의 정의 본문 + 인접 엣지를 relation 별로 분류해 반환. " +
			"입력 node 는 노드 id (예: term_rps, topic_3) 또는 label (예: RPS, '3. 핵심 제도·용어') 모두 허용. " +
			"반환: {id, label, type, body, neighbors_by_relation: {part_of:[...], defined_in:[...], mentions:[...], contrasts:[...]}}. " +
			"solar_query 결과를 받은 뒤 흥미로운 노드 1개를 깊이 들여다볼 때 호출.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"node": {"type": "string", "description": "노드 id 또는 label"}
			},
			"required": ["node"]
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(_ context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args solarExplainInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			g := loadSolarKnowledgeGraph()
			id := g.resolveNode(args.Node)
			if id == "" {
				return "", fmt.Errorf("노드 %q 를 찾을 수 없습니다 — solar_query 로 후보를 먼저 검색하세요", args.Node)
			}
			n := g.nodeByID[id]

			byRel := map[string][]map[string]string{}
			for _, e := range g.adjacency[id] {
				nb := g.nodeByID[e.Target]
				if nb == nil {
					continue
				}
				byRel[e.Relation] = append(byRel[e.Relation], map[string]string{
					"id": nb.ID, "label": nb.Label, "type": nb.Type,
				})
			}
			out, _ := json.Marshal(map[string]any{
				"id":                    n.ID,
				"label":                 n.Label,
				"type":                  n.Type,
				"body":                  n.Body,
				"neighbors_by_relation": byRel,
			})
			return string(out), nil
		},
	}
}

type solarPathInput struct {
	From string `json:"from"`
	To   string `json:"to"`
}

func toolSolarPath() assistantTool {
	return assistantTool{
		name: "solar_path",
		description: "도메인 그래프에서 두 노드 간 최단 경로(BFS). 노드 간 의미 관계 추적용 — 예: 'RPS' → 'REC', 'TOPCon' → '한화큐셀'. " +
			"from·to 모두 노드 id 또는 label 가능. 반환: {from, to, path:[{id,label,type,relation_to_prev}], length}. 경로가 없으면 path 가 빈 배열 + 안내.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"from": {"type": "string", "description": "출발 노드 id 또는 label"},
				"to":   {"type": "string", "description": "도착 노드 id 또는 label"}
			},
			"required": ["from", "to"]
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" },
		execute: func(_ context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			var args solarPathInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			g := loadSolarKnowledgeGraph()
			fromID := g.resolveNode(args.From)
			toID := g.resolveNode(args.To)
			if fromID == "" {
				return "", fmt.Errorf("from 노드 %q 를 찾을 수 없습니다", args.From)
			}
			if toID == "" {
				return "", fmt.Errorf("to 노드 %q 를 찾을 수 없습니다", args.To)
			}

			ids := g.shortestPath(fromID, toID)
			type step struct {
				ID             string `json:"id"`
				Label          string `json:"label"`
				Type           string `json:"type"`
				RelationToPrev string `json:"relation_to_prev,omitempty"`
			}
			path := make([]step, 0, len(ids))
			for i, id := range ids {
				n := g.nodeByID[id]
				if n == nil {
					continue
				}
				s := step{ID: n.ID, Label: n.Label, Type: n.Type}
				if i > 0 {
					prev := ids[i-1]
					for _, e := range g.adjacency[prev] {
						if e.Target == id {
							s.RelationToPrev = e.Relation
							break
						}
					}
				}
				path = append(path, s)
			}
			res := map[string]any{
				"from":   fromID,
				"to":     toID,
				"path":   path,
				"length": len(path),
			}
			if len(path) == 0 {
				res["hint"] = "경로 없음 — 두 노드가 도메인 그래프 상 연결돼 있지 않습니다."
			}
			out, _ := json.Marshal(res)
			return string(out), nil
		},
	}
}
