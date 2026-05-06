package handler

import (
	"encoding/json"
	"fmt"

	supa "github.com/supabase-community/supabase-go"
)

// PostgRESTMaxRows — Supabase Cloud 의 db-max-rows=1000 cap.
// 단일 Range 호출은 첫 1000행만 응답하므로, 1000행 초과 테이블은
// 반드시 fetchAllFromTable 헬퍼로 청크 페이지네이션해야 한다.
//
// 회귀 이력 (D-064 PR 36):
//   - 2026-05-05  fix: enrichSales 페이지네이션으로 PostgREST 1000건 제한 우회
//   - 2026-05-06  perf: migrate 4 sales drilldowns → 청크 헬퍼 회귀 (Range(0, 99999) 단일 호출)
//   - 2026-05-06  fix(PR 35): outbounds 만 청크 재적용 (인라인)
//   - 2026-05-06  PR 36: 5 enrich 테이블 모두 공통 헬퍼로 통합 + 회귀 방지
const PostgRESTMaxRows = 1000

// fetchAllFromTable — Supabase Cloud db-max-rows=1000 cap 우회.
// 1000건씩 청크로 나눠 모든 행을 수집해 단일 JSON 배열로 반환.
//
// 가드:
//   - 페이지 50 cap (총 50,000 행) — 비현실적인 대용량 폭주 방지
//   - 첫 페이지 실패는 에러 반환, 이후 실패는 부분 결과 반환
//
// 비유: "큰 책장에서 책을 1000권씩 카트로 옮기기" — 한 번에 다 못 들어 여러 번 왕복.
func fetchAllFromTable(db *supa.Client, table, columns string) ([]byte, error) {
	const pageSize = PostgRESTMaxRows
	const maxPages = 50

	var all []json.RawMessage
	for page := 0; page < maxPages; page++ {
		offset := page * pageSize
		data, _, err := db.From(table).
			Select(columns, "exact", false).
			Range(offset, offset+pageSize-1, "").Execute()
		if err != nil {
			if page == 0 {
				return nil, fmt.Errorf("fetchAllFromTable %s page=0: %w", table, err)
			}
			break // 부분 결과 반환
		}
		var batch []json.RawMessage
		if err := json.Unmarshal(data, &batch); err != nil {
			if page == 0 {
				return nil, fmt.Errorf("fetchAllFromTable %s page=0 unmarshal: %w", table, err)
			}
			break
		}
		all = append(all, batch...)
		if len(batch) < pageSize {
			break // 마지막 페이지
		}
	}

	if all == nil {
		return []byte("[]"), nil
	}
	return json.Marshal(all)
}
