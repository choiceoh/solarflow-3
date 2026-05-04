// build-knowledge-graph — 도메인 지식 마크다운(임베드된 solar_domain_kr.md)을 graphify 호환 graph.json 으로
// 디스크에 출력. backend 서버 startup 과 분리된 별도 cmd 로, 어시스턴트 도구는 메모리 그래프만 쓰고 이 cmd 는
// graphify CLI(`graphify query --graph <path> ...`)와의 호환을 원할 때만 실행.
//
// 사용:
//   go run ./cmd/build-knowledge-graph                            (기본: knowledge/graphify-out/graph.json)
//   go run ./cmd/build-knowledge-graph custom/path/to/graph.json  (출력 경로 지정)
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"solarflow-backend/internal/handler"
)

const defaultOut = "knowledge/graphify-out/graph.json"

func main() {
	out := defaultOut
	if len(os.Args) > 1 {
		out = os.Args[1]
	}

	data, err := handler.ExportSolarKnowledgeGraphJSON()
	if err != nil {
		fmt.Fprintln(os.Stderr, "graph.json 직렬화 실패:", err)
		os.Exit(1)
	}

	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		fmt.Fprintln(os.Stderr, "출력 디렉토리 생성 실패:", err)
		os.Exit(1)
	}
	if err := os.WriteFile(out, data, 0o644); err != nil {
		fmt.Fprintln(os.Stderr, "쓰기 실패:", err)
		os.Exit(1)
	}

	fmt.Printf("knowledge graph → %s (%d bytes)\n", out, len(data))
}
