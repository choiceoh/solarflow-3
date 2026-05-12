package handler

// query_attached_sheet — AI 어시스턴트가 업로드된 엑셀/CSV 의 임시 저장본을
// preview/range/filter/aggregate/search 모드로 조회하는 read 도구.
// 시트 전체를 LLM 컨텍스트에 박지 않고 도구로 풀어내는 패턴.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
)

// 패키지 레벨 풀 — NewAssistantHandler 가 한 번 set. catalog 함수 시그니처를 건드리지 않기 위한 의도적 선택.
// 다른 도구는 execute 의 db 인자(supa.Client) 만 쓰므로 이 변수는 첨부 시트 도구 전용.
var attachmentPool *pgxpool.Pool

func setAttachmentPool(p *pgxpool.Pool) { attachmentPool = p }

func toolQueryAttachedSheet() assistantTool {
	return assistantTool{
		name: "query_attached_sheet",
		description: "사용자가 어시스턴트에 첨부한 엑셀(xlsx)/CSV 시트를 모드별로 조회합니다. " +
			"시트 메타(sheet_id, 헤더, 행수)는 [첨부파일 표] 블록에 표시됩니다. " +
			"mode: preview(처음 N행), range(행 범위), filter(컬럼 다중 AND 조건), " +
			"aggregate(컬럼 SUM/COUNT/AVG/MAX/MIN), search(전체 컬럼 텍스트 검색).",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"required": ["sheet_id", "mode"],
			"properties": {
				"sheet_id": {"type": "string", "description": "[첨부파일 표] 블록의 sheet_id"},
				"mode": {"type": "string", "enum": ["preview", "range", "filter", "aggregate", "search"]},
				"limit": {"type": "integer", "minimum": 1, "maximum": 500, "description": "preview/filter/search 결과 최대 행 수 (기본 preview=20, 그 외 100)"},
				"row_start": {"type": "integer", "minimum": 1, "description": "range 모드 — 시작 행(1-based, 포함)"},
				"row_end": {"type": "integer", "minimum": 1, "description": "range 모드 — 끝 행(1-based, 포함)"},
				"conditions": {
					"type": "array",
					"description": "filter 모드 — 다중 AND 조건",
					"items": {
						"type": "object",
						"additionalProperties": false,
						"required": ["column", "value"],
						"properties": {
							"column": {"type": "string", "description": "헤더명 (대소문자·공백 흡수 매칭)"},
							"op": {"type": "string", "enum": ["eq", "contains"], "description": "기본 eq"},
							"value": {"type": "string"}
						}
					}
				},
				"column": {"type": "string", "description": "aggregate 모드 — 집계 대상 컬럼명 (count 는 생략 가능 — 전체 행 수)"},
				"op": {"type": "string", "enum": ["SUM", "COUNT", "AVG", "MAX", "MIN", "COUNT_DISTINCT"], "description": "aggregate 모드 연산자"},
				"q": {"type": "string", "description": "search 모드 — 전체 컬럼에서 부분일치 검색할 텍스트"}
			}
		}`),
		allow: func(ctx context.Context) bool { return middleware.GetUserID(ctx) != "" && attachmentPool != nil },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			return executeQueryAttachedSheet(ctx, attachmentPool, input)
		},
	}
}

// queryAttachedSheetInput — 도구 인자 — LLM 이 호출할 때 들고 오는 모든 필드.
type queryAttachedSheetInput struct {
	SheetID    string             `json:"sheet_id"`
	Mode       string             `json:"mode"`
	Limit      int                `json:"limit,omitempty"`
	RowStart   int                `json:"row_start,omitempty"`
	RowEnd     int                `json:"row_end,omitempty"`
	Conditions []filterCondition  `json:"conditions,omitempty"`
	Column     string             `json:"column,omitempty"`
	Op         string             `json:"op,omitempty"`
	Q          string             `json:"q,omitempty"`
}

type filterCondition struct {
	Column string `json:"column"`
	Op     string `json:"op,omitempty"`
	Value  string `json:"value"`
}

func executeQueryAttachedSheet(ctx context.Context, pool *pgxpool.Pool, raw json.RawMessage) (string, error) {
	if pool == nil {
		return "", fmt.Errorf("첨부 시트 저장소가 비활성 상태입니다")
	}
	var in queryAttachedSheetInput
	if err := json.Unmarshal(raw, &in); err != nil {
		return "", fmt.Errorf("입력 파싱: %w", err)
	}
	if in.SheetID == "" || in.Mode == "" {
		return "", fmt.Errorf("sheet_id 와 mode 가 필요합니다")
	}

	// 만료된 시트를 함께 정리 — 호출이 들어오는 만큼만 자연스럽게 청소.
	cleanupExpiredSheets(ctx, pool)

	owner, headers, rowCount, colCount, sheetName, filename, err := fetchSheetOwner(ctx, pool, in.SheetID)
	if err != nil {
		if errors.Is(err, ErrAttachmentNotFound) {
			return marshalToolPayload(map[string]any{
				"hint": "시트를 찾을 수 없거나 24시간이 지나 만료됐습니다. 사용자에게 다시 업로드 요청하세요.",
			}), nil
		}
		return "", err
	}
	caller := middleware.GetUserID(ctx)
	if owner != caller {
		return marshalToolPayload(map[string]any{"hint": "이 시트는 본인 첨부물이 아닙니다."}), nil
	}

	switch in.Mode {
	case "preview":
		limit := in.Limit
		if limit <= 0 {
			limit = defaultPreviewRows
		}
		if limit > maxQueryResultRows {
			limit = maxQueryResultRows
		}
		rows, nums, qerr := fetchRows(ctx, pool, in.SheetID, 0, 0, limit)
		if qerr != nil {
			return "", qerr
		}
		return marshalToolPayload(rowsPayload(filename, sheetName, headers, rowCount, colCount, rows, nums)), nil

	case "range":
		if in.RowStart <= 0 || in.RowEnd <= 0 || in.RowEnd < in.RowStart {
			return "", fmt.Errorf("range 모드는 row_start ≤ row_end 양수 필요")
		}
		// 최대 행 수 cap — 사용자 의도 범위가 넓어도 한 번에 500행까지.
		limit := in.RowEnd - in.RowStart + 1
		if limit > maxQueryResultRows {
			limit = maxQueryResultRows
		}
		rows, nums, qerr := fetchRows(ctx, pool, in.SheetID, in.RowStart, in.RowEnd, limit)
		if qerr != nil {
			return "", qerr
		}
		return marshalToolPayload(rowsPayload(filename, sheetName, headers, rowCount, colCount, rows, nums)), nil

	case "filter":
		return runFilter(ctx, pool, in, headers, rowCount, colCount, filename, sheetName)

	case "aggregate":
		return runAggregate(ctx, pool, in, headers, rowCount, colCount, filename, sheetName)

	case "search":
		return runSearch(ctx, pool, in, headers, rowCount, colCount, filename, sheetName)
	}

	return "", fmt.Errorf("알 수 없는 mode: %s", in.Mode)
}

// runFilter — 다중 AND 조건. 컬럼명을 헤더 인덱스로 매핑하고 jsonb 배열의 해당 위치를 비교.
// eq 는 정확 매칭(대소문자 무시), contains 는 부분 매칭. 결과는 limit 행까지.
func runFilter(ctx context.Context, pool *pgxpool.Pool, in queryAttachedSheetInput, headers []string, rowCount, colCount int, filename, sheetName string) (string, error) {
	if len(in.Conditions) == 0 {
		return "", fmt.Errorf("filter 모드는 conditions 가 1개 이상 필요")
	}
	limit := in.Limit
	if limit <= 0 || limit > maxQueryResultRows {
		limit = 100
	}

	var clauses []string
	args := []any{in.SheetID}
	idx := 2
	for _, c := range in.Conditions {
		ci := columnIndex(headers, c.Column)
		if ci < 0 {
			return marshalToolPayload(map[string]any{
				"hint": fmt.Sprintf("컬럼 %q 를 헤더에서 찾을 수 없습니다. 헤더: %v", c.Column, headers),
			}), nil
		}
		// jsonb 배열 위치 접근: data->>idx — 문자열로 꺼냄.
		switch strings.ToLower(c.Op) {
		case "contains":
			clauses = append(clauses, fmt.Sprintf("LOWER(data->>%d) LIKE $%d", ci, idx))
			args = append(args, "%"+strings.ToLower(c.Value)+"%")
		default: // eq 기본
			clauses = append(clauses, fmt.Sprintf("LOWER(data->>%d) = $%d", ci, idx))
			args = append(args, strings.ToLower(c.Value))
		}
		idx++
	}
	args = append(args, limit)

	q := fmt.Sprintf(`SELECT row_num, data FROM ai_attachment_rows
		WHERE sheet_id = $1::uuid AND %s
		ORDER BY row_num LIMIT $%d`, strings.Join(clauses, " AND "), idx)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return "", fmt.Errorf("filter query: %w", err)
	}
	defer rows.Close()

	var out [][]string
	var nums []int
	for rows.Next() {
		var rowNum int
		var data []byte
		if serr := rows.Scan(&rowNum, &data); serr != nil {
			return "", fmt.Errorf("scan: %w", serr)
		}
		var values []string
		if uerr := json.Unmarshal(data, &values); uerr != nil {
			continue
		}
		out = append(out, values)
		nums = append(nums, rowNum)
	}
	return marshalToolPayload(rowsPayload(filename, sheetName, headers, rowCount, colCount, out, nums)), nil
}

// runAggregate — 단일 컬럼 SUM/AVG/MAX/MIN/COUNT_DISTINCT 또는 전체 COUNT.
// 숫자 변환은 PostgreSQL 의 NULLIF + ::numeric 캐스팅 — 비숫자 값은 NULL 로 떨어져 평균/합계에서 자동 제외.
func runAggregate(ctx context.Context, pool *pgxpool.Pool, in queryAttachedSheetInput, headers []string, rowCount, colCount int, filename, sheetName string) (string, error) {
	op := strings.ToUpper(in.Op)
	if op == "" {
		return "", fmt.Errorf("aggregate 모드는 op 필요")
	}

	// COUNT 만 컬럼 없이 전체 행 수 반환 가능.
	if op == "COUNT" && in.Column == "" {
		var n int
		if err := pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM ai_attachment_rows WHERE sheet_id = $1::uuid`, in.SheetID,
		).Scan(&n); err != nil {
			return "", err
		}
		return marshalToolPayload(map[string]any{
			"filename": filename, "sheet_name": sheetName, "op": "COUNT", "value": n,
		}), nil
	}

	if in.Column == "" {
		return "", fmt.Errorf("aggregate %s 는 column 필요", op)
	}
	ci := columnIndex(headers, in.Column)
	if ci < 0 {
		return marshalToolPayload(map[string]any{
			"hint": fmt.Sprintf("컬럼 %q 를 헤더에서 찾을 수 없습니다. 헤더: %v", in.Column, headers),
		}), nil
	}

	var sqlExpr string
	switch op {
	case "SUM", "AVG", "MAX", "MIN":
		// 셀에서 천단위·공백 제거 후 numeric 캐스팅. 실패하면 NULL.
		sqlExpr = fmt.Sprintf(
			`%s(NULLIF(REGEXP_REPLACE(data->>%d, '[, ]', '', 'g'), '')::numeric)`,
			op, ci)
	case "COUNT":
		sqlExpr = fmt.Sprintf(`COUNT(NULLIF(data->>%d, ''))`, ci)
	case "COUNT_DISTINCT":
		sqlExpr = fmt.Sprintf(`COUNT(DISTINCT NULLIF(data->>%d, ''))`, ci)
	default:
		return "", fmt.Errorf("지원하지 않는 op: %s", op)
	}

	q := fmt.Sprintf(`SELECT %s FROM ai_attachment_rows WHERE sheet_id = $1::uuid`, sqlExpr)
	var raw any
	if err := pool.QueryRow(ctx, q, in.SheetID).Scan(&raw); err != nil {
		return "", fmt.Errorf("aggregate query: %w", err)
	}

	value := formatAggregateValue(raw)
	return marshalToolPayload(map[string]any{
		"filename":   filename,
		"sheet_name": sheetName,
		"column":     headers[ci],
		"op":         op,
		"value":      value,
	}), nil
}

// runSearch — 전체 컬럼에서 부분일치(대소문자 무시) 검색. jsonb 전체를 text 로 캐스팅해 ILIKE.
func runSearch(ctx context.Context, pool *pgxpool.Pool, in queryAttachedSheetInput, headers []string, rowCount, colCount int, filename, sheetName string) (string, error) {
	if strings.TrimSpace(in.Q) == "" {
		return "", fmt.Errorf("search 모드는 q 필요")
	}
	limit := in.Limit
	if limit <= 0 || limit > maxQueryResultRows {
		limit = 100
	}

	rows, err := pool.Query(ctx, `
		SELECT row_num, data FROM ai_attachment_rows
		WHERE sheet_id = $1::uuid AND data::text ILIKE $2
		ORDER BY row_num LIMIT $3`, in.SheetID, "%"+in.Q+"%", limit)
	if err != nil {
		return "", fmt.Errorf("search query: %w", err)
	}
	defer rows.Close()

	var out [][]string
	var nums []int
	for rows.Next() {
		var rowNum int
		var data []byte
		if serr := rows.Scan(&rowNum, &data); serr != nil {
			return "", err
		}
		var values []string
		if uerr := json.Unmarshal(data, &values); uerr != nil {
			continue
		}
		out = append(out, values)
		nums = append(nums, rowNum)
	}
	return marshalToolPayload(rowsPayload(filename, sheetName, headers, rowCount, colCount, out, nums)), nil
}

// rowsPayload — 도구 응답 표준 형태. count 와 hint 필드는 LLM 이 "전체 vs 표시" 를 구분하도록.
func rowsPayload(filename, sheetName string, headers []string, totalRows, totalCols int, rows [][]string, nums []int) map[string]any {
	items := make([]map[string]any, 0, len(rows))
	for i, r := range rows {
		items = append(items, map[string]any{"row_num": nums[i], "values": r})
	}
	hint := ""
	if len(rows) >= maxQueryResultRows {
		hint = fmt.Sprintf("결과가 최대 %d행에서 잘렸습니다. 더 좁은 조건으로 다시 조회하세요.", maxQueryResultRows)
	}
	return map[string]any{
		"filename":     filename,
		"sheet_name":   sheetName,
		"headers":      headers,
		"total_rows":   totalRows,
		"total_cols":   totalCols,
		"shown_count":  len(rows),
		"rows":         items,
		"hint":         hint,
	}
}

func formatAggregateValue(v any) any {
	switch t := v.(type) {
	case nil:
		return nil
	case []byte:
		// numeric 은 driver 가 []byte 로 반환. 그대로 문자열로.
		return string(t)
	case string:
		return t
	case int64, int32, int:
		return t
	case float64:
		// 정수면 정수로.
		if t == float64(int64(t)) {
			return int64(t)
		}
		return t
	default:
		return fmt.Sprintf("%v", t)
	}
}

func marshalToolPayload(payload any) string {
	b, err := json.Marshal(payload)
	if err != nil {
		return `{"error":"marshal failed"}`
	}
	return string(b)
}

