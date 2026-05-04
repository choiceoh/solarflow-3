package handler

// AI 어시스턴트 — 도메인 지식 그래프(graphify-style).
// 임베드된 한국 태양광 도메인 마크다운(assets/solar_domain_kr.md)을 H2 섹션·약어집 표·헷갈리는 구분 패턴으로
// 파싱해 노드/엣지 그래프를 메모리에 1회 빌드한다. 어시스턴트 도구가 BFS 탐색·노드 설명·최단경로 질의에 활용하고,
// graphify CLI 호환 graph.json 으로 디스크 출력도 가능 — 별도 cmd `cmd/build-knowledge-graph` 가 그 진입점.
//
// 노드 종류 (type 필드):
//   topic — H2 섹션 13개 (1.산업 가치사슬 ~ 13.조회처)
//   term  — 약어집(11.) 표 행 + 헷갈리는 구분(12.) "X vs Y" 의 한국어 용어
//
// 엣지 relation:
//   part_of    — TERM → topic_11 (약어집 소속)
//   defined_in — TERM → 본문 첫 등장 TOPIC
//   mentions   — TOPIC → TERM (본문에 등장)
//   contrasts  — TERM ↔ TERM (헷갈리는 구분 쌍, 양방향)
//
// 인접리스트(adjacency)는 모든 엣지를 양방향으로 보유 — BFS·shortestPath 가 의미 관계를 자유롭게 추적하도록.
// 표면 엣지(g.Edges)는 단방향만 보존 — graph.json 출력 시 중복 방지.

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
)

type solarKnowledgeNode struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Type  string `json:"type"`
	Body  string `json:"body,omitempty"`
}

type solarKnowledgeEdge struct {
	Source   string `json:"source"`
	Target   string `json:"target"`
	Relation string `json:"relation"`
}

type solarKnowledgeGraph struct {
	Nodes []solarKnowledgeNode
	Edges []solarKnowledgeEdge

	nodeByID    map[string]*solarKnowledgeNode
	nodeByLabel map[string]string              // lower(label) → id
	adjacency   map[string][]solarKnowledgeEdge // 양방향
}

var (
	solarKGOnce sync.Once
	solarKG     *solarKnowledgeGraph

	solarKGH2Re        = regexp.MustCompile(`^## (\d+)\. (.+)$`)
	solarKGAbbrTableRe = regexp.MustCompile(`^\|\s*([A-Za-z][A-Za-z0-9/&\-]{0,15})\s*\|\s*(.+?)\s*\|$`)
	solarKGContrastRe  = regexp.MustCompile(`\*\*([^*]+?)\s+vs\s+([^*]+?)\*\*`)
)

// loadSolarKnowledgeGraph — 임베드된 도메인 md 로 그래프를 1회 빌드 후 캐시 반환.
func loadSolarKnowledgeGraph() *solarKnowledgeGraph {
	solarKGOnce.Do(func() {
		solarKG = buildSolarKnowledgeGraph(solarDomainKRRaw)
	})
	return solarKG
}

func buildSolarKnowledgeGraph(raw string) *solarKnowledgeGraph {
	g := &solarKnowledgeGraph{
		nodeByID:    map[string]*solarKnowledgeNode{},
		nodeByLabel: map[string]string{},
		adjacency:   map[string][]solarKnowledgeEdge{},
	}

	// 1) H2 섹션 분할
	type sec struct {
		num   int
		title string
		body  string
	}
	var sections []sec
	var (
		curNum   int
		curTitle string
		curBody  []string
	)
	flush := func() {
		if curNum > 0 {
			sections = append(sections, sec{curNum, curTitle, strings.Join(curBody, "\n")})
		}
	}
	for _, line := range strings.Split(raw, "\n") {
		if m := solarKGH2Re.FindStringSubmatch(line); m != nil {
			flush()
			n, _ := strconv.Atoi(m[1])
			curNum = n
			curTitle = strings.TrimSpace(m[2])
			curBody = []string{line}
			continue
		}
		if curNum > 0 {
			curBody = append(curBody, line)
		}
	}
	flush()

	// 2) TOPIC 노드
	for _, s := range sections {
		g.addNode(solarKnowledgeNode{
			ID:    fmt.Sprintf("topic_%d", s.num),
			Label: fmt.Sprintf("%d. %s", s.num, s.title),
			Type:  "topic",
			Body:  s.body,
		})
	}

	// 3) TERM 노드 — 약어집(토픽 11) 표 행
	var topic11Body, topic12Body string
	for _, s := range sections {
		switch s.num {
		case 11:
			topic11Body = s.body
		case 12:
			topic12Body = s.body
		}
	}
	for _, line := range strings.Split(topic11Body, "\n") {
		m := solarKGAbbrTableRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		abbr := strings.TrimSpace(m[1])
		desc := strings.TrimSpace(m[2])
		// 표 헤더/구분선 제외 — 영문 알파벳으로 시작하는 짧은 약어만 통과
		if abbr == "약어" || abbr == "풀이" || strings.HasPrefix(abbr, "-") {
			continue
		}
		id := "term_" + strings.ToLower(abbr)
		g.addNode(solarKnowledgeNode{ID: id, Label: abbr, Type: "term", Body: desc})
		g.addEdge(solarKnowledgeEdge{Source: id, Target: "topic_11", Relation: "part_of"})
	}

	// 4) MENTIONS / DEFINED_IN — 토픽 본문에 약어가 등장
	termFirst := map[string]bool{}
	// 토픽 1→13 순회로 "첫 등장" 정의가 안정적
	sort.SliceStable(sections, func(i, j int) bool { return sections[i].num < sections[j].num })
	for _, s := range sections {
		if s.num == 11 {
			continue
		}
		topicID := fmt.Sprintf("topic_%d", s.num)
		for _, n := range g.Nodes {
			if n.Type != "term" {
				continue
			}
			// 영문 약어만 대상 (한국어 용어는 contrasts 단계에서 별도 추가)
			if !isASCIIAbbr(n.Label) {
				continue
			}
			pat := regexp.MustCompile(`\b` + regexp.QuoteMeta(n.Label) + `\b`)
			if !pat.MatchString(s.body) {
				continue
			}
			if !termFirst[n.ID] {
				termFirst[n.ID] = true
				g.addEdge(solarKnowledgeEdge{Source: n.ID, Target: topicID, Relation: "defined_in"})
			}
			g.addEdge(solarKnowledgeEdge{Source: topicID, Target: n.ID, Relation: "mentions"})
		}
	}

	// 5) CONTRASTS — 헷갈리는 구분(토픽 12) 의 "X vs Y" 양방향
	for _, m := range solarKGContrastRe.FindAllStringSubmatch(topic12Body, -1) {
		a := strings.TrimSpace(m[1])
		b := strings.TrimSpace(m[2])
		aID := g.findOrCreateTermNode(a)
		bID := g.findOrCreateTermNode(b)
		g.addEdge(solarKnowledgeEdge{Source: aID, Target: bID, Relation: "contrasts"})
		g.addEdge(solarKnowledgeEdge{Source: bID, Target: aID, Relation: "contrasts"})
	}

	return g
}

// findOrCreateTermNode — 라벨로 기존 노드 ID 찾고, 없으면 한국어 용어 노드 신규 생성.
func (g *solarKnowledgeGraph) findOrCreateTermNode(label string) string {
	if id, ok := g.nodeByLabel[strings.ToLower(label)]; ok {
		return id
	}
	id := "term_" + slugSolarKG(label)
	g.addNode(solarKnowledgeNode{ID: id, Label: label, Type: "term"})
	return id
}

func (g *solarKnowledgeGraph) addNode(n solarKnowledgeNode) {
	if _, exists := g.nodeByID[n.ID]; exists {
		return
	}
	g.Nodes = append(g.Nodes, n)
	g.nodeByID[n.ID] = &g.Nodes[len(g.Nodes)-1]
	g.nodeByLabel[strings.ToLower(n.Label)] = n.ID
}

// addEdge — 표면 엣지는 단방향(g.Edges), 인접리스트는 양방향(탐색 편의).
func (g *solarKnowledgeGraph) addEdge(e solarKnowledgeEdge) {
	g.Edges = append(g.Edges, e)
	g.adjacency[e.Source] = append(g.adjacency[e.Source], e)
	if e.Source != e.Target {
		rev := solarKnowledgeEdge{Source: e.Target, Target: e.Source, Relation: e.Relation}
		g.adjacency[e.Target] = append(g.adjacency[e.Target], rev)
	}
}

// resolveNode — 노드 id 또는 label(대소문자 무시)로 ID 해석. 못 찾으면 빈 문자열.
func (g *solarKnowledgeGraph) resolveNode(query string) string {
	q := strings.TrimSpace(query)
	if _, ok := g.nodeByID[q]; ok {
		return q
	}
	if id, ok := g.nodeByLabel[strings.ToLower(q)]; ok {
		return id
	}
	return ""
}

// shortestPath — BFS 최단 경로(노드 ID 시퀀스). 인접리스트는 양방향이라 단방향 BFS 면 충분.
func (g *solarKnowledgeGraph) shortestPath(from, to string) []string {
	if _, ok := g.nodeByID[from]; !ok {
		return nil
	}
	if _, ok := g.nodeByID[to]; !ok {
		return nil
	}
	if from == to {
		return []string{from}
	}
	parent := map[string]string{from: ""}
	queue := []string{from}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		for _, e := range g.adjacency[id] {
			if _, seen := parent[e.Target]; seen {
				continue
			}
			parent[e.Target] = id
			if e.Target == to {
				var path []string
				for cur := to; cur != ""; cur = parent[cur] {
					path = append([]string{cur}, path...)
				}
				return path
			}
			queue = append(queue, e.Target)
		}
	}
	return nil
}

// search — keyword 부분일치 노드 ID 목록(label 또는 body 매칭).
func (g *solarKnowledgeGraph) search(keyword string) []string {
	kw := strings.ToLower(strings.TrimSpace(keyword))
	if kw == "" {
		return nil
	}
	var hits []string
	for _, n := range g.Nodes {
		if strings.Contains(strings.ToLower(n.Label), kw) ||
			strings.Contains(strings.ToLower(n.Body), kw) {
			hits = append(hits, n.ID)
		}
	}
	return hits
}

// MarshalGraphifyJSON — graphify CLI 호환 NetworkX node-link 형식 graph.json.
// 출력된 파일은 `graphify query --graph <path>` / `path` / `explain` 의 입력으로 그대로 사용 가능.
func (g *solarKnowledgeGraph) MarshalGraphifyJSON() ([]byte, error) {
	typeToCommunity := map[string]int{"topic": 1, "term": 2}
	nodes := make([]map[string]any, 0, len(g.Nodes))
	for _, n := range g.Nodes {
		nodes = append(nodes, map[string]any{
			"id":              n.ID,
			"label":           n.Label,
			"norm_label":      strings.ToLower(n.Label),
			"file_type":       "doc",
			"knowledge_type":  n.Type,
			"source_file":     "knowledge/DOMAIN_SOLAR_KR.md",
			"source_location": "",
			"community":       typeToCommunity[n.Type],
			"body":            n.Body,
		})
	}
	links := make([]map[string]any, 0, len(g.Edges))
	for _, e := range g.Edges {
		links = append(links, map[string]any{
			"source":           e.Source,
			"target":           e.Target,
			"relation":         e.Relation,
			"weight":           1.0,
			"_src":             e.Source,
			"_tgt":             e.Target,
			"confidence":       "EXTRACTED",
			"confidence_score": 1.0,
			"source_file":      "knowledge/DOMAIN_SOLAR_KR.md",
			"source_location":  "—",
		})
	}
	// directed=false 로 두면 graphify(NetworkX) BFS 가 양방향 탐색해 의미 관계 추적이 정확.
	// 표면 엣지(g.Edges)는 단방향이지만 무방향 그래프로 해석되므로 RPS→topic_3→REC 같은 경로가 가능.
	return json.MarshalIndent(map[string]any{
		"directed":   false,
		"multigraph": false,
		"graph":      map[string]any{"name": "solar_kr_knowledge"},
		"nodes":      nodes,
		"links":      links,
		"hyperedges": []any{},
	}, "", "  ")
}

// ExportSolarKnowledgeGraphJSON — 외부 cmd 가 호출하는 진입점 (graphify 호환 graph.json 직렬화).
func ExportSolarKnowledgeGraphJSON() ([]byte, error) {
	return loadSolarKnowledgeGraph().MarshalGraphifyJSON()
}

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

func isASCIIAbbr(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !((r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '/' || r == '-') {
			return false
		}
	}
	return true
}

func slugSolarKG(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r >= '가' && r <= '힣':
			b.WriteRune(r)
		case r == ' ', r == '-', r == '/', r == '·':
			b.WriteRune('_')
		}
	}
	out := b.String()
	if out == "" {
		out = fmt.Sprintf("anon_%x", len(s))
	}
	return out
}
