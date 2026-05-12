package handler

// AI 어시스턴트 첨부 시트 임시 영역.
// 시트는 ai_attachment_sheets 에, 행은 ai_attachment_rows 에 저장된다.
// 모든 권한 검증은 user_id 비교로 명시 처리 (PostgREST 노출 없음 — RLS 불필요).
// TTL 24시간 — 쿼리 시작 시 lazy DELETE 로 만료된 시트를 함께 정리.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// 시트당 행 cap — 5만행 초과는 거절 + "분할 업로드 권장" 안내.
	maxAttachmentSheetRows = 50000
	// preview 기본 표시 행 수.
	defaultPreviewRows = 20
	// filter/range/search 결과 최대 행 수 — LLM 컨텍스트 보호.
	maxQueryResultRows = 500
)

// ErrAttachmentNotFound — sheet_id 가 없거나 호출자 소유가 아닐 때.
// 도구가 LLM 에 "찾을 수 없음" 으로 통지하도록.
var ErrAttachmentNotFound = errors.New("attachment sheet not found")

// ErrAttachmentTooLarge — 시트 행 수 cap 초과.
var ErrAttachmentTooLarge = fmt.Errorf("시트 행이 %d개를 초과합니다. 시트를 분할해 다시 올려주세요", maxAttachmentSheetRows)

// AttachmentSheetMeta — 시트 저장 결과 메타.
type AttachmentSheetMeta struct {
	SheetID     string     `json:"sheet_id"`
	Filename    string     `json:"filename"`
	SheetName   string     `json:"sheet_name"`
	RowCount    int        `json:"row_count"`
	ColCount    int        `json:"col_count"`
	Headers     []string   `json:"headers"`
	PreviewRows [][]string `json:"preview_rows,omitempty"`
}

// SaveAttachmentSheet — 시트와 행을 트랜잭션으로 저장.
// rows 는 헤더 행을 제외한 데이터 행만. headers 가 비어 있으면 빈 JSON 배열로 저장.
// 결과로 sheet_id 와 미리보기 처음 5행을 반환 (프론트가 곧장 LLM 컨텍스트로 전달).
func SaveAttachmentSheet(ctx context.Context, pool *pgxpool.Pool, userID, filename, sheetName string, headers []string, rows [][]string) (AttachmentSheetMeta, error) {
	if len(rows) > maxAttachmentSheetRows {
		return AttachmentSheetMeta{}, ErrAttachmentTooLarge
	}

	colCount := len(headers)
	for _, r := range rows {
		if len(r) > colCount {
			colCount = len(r)
		}
	}

	headersJSON, err := json.Marshal(headers)
	if err != nil {
		return AttachmentSheetMeta{}, fmt.Errorf("headers marshal: %w", err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return AttachmentSheetMeta{}, fmt.Errorf("tx begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var sheetID string
	err = tx.QueryRow(ctx, `
		INSERT INTO ai_attachment_sheets (user_id, filename, sheet_name, row_count, col_count, headers)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING sheet_id::text
	`, userID, filename, sheetName, len(rows), colCount, headersJSON).Scan(&sheetID)
	if err != nil {
		return AttachmentSheetMeta{}, fmt.Errorf("insert sheet: %w", err)
	}

	if len(rows) > 0 {
		batch := &pgx.Batch{}
		for i, row := range rows {
			rowJSON, jerr := json.Marshal(row)
			if jerr != nil {
				return AttachmentSheetMeta{}, fmt.Errorf("row %d marshal: %w", i+1, jerr)
			}
			batch.Queue(`INSERT INTO ai_attachment_rows (sheet_id, row_num, data) VALUES ($1, $2, $3)`,
				sheetID, i+1, rowJSON)
		}
		br := tx.SendBatch(ctx, batch)
		for i := 0; i < len(rows); i++ {
			if _, ferr := br.Exec(); ferr != nil {
				_ = br.Close()
				return AttachmentSheetMeta{}, fmt.Errorf("insert row %d: %w", i+1, ferr)
			}
		}
		if cerr := br.Close(); cerr != nil {
			return AttachmentSheetMeta{}, fmt.Errorf("batch close: %w", cerr)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return AttachmentSheetMeta{}, fmt.Errorf("tx commit: %w", err)
	}

	preview := make([][]string, 0, 5)
	for i, r := range rows {
		if i >= 5 {
			break
		}
		preview = append(preview, r)
	}

	return AttachmentSheetMeta{
		SheetID:     sheetID,
		Filename:    filename,
		SheetName:   sheetName,
		RowCount:    len(rows),
		ColCount:    colCount,
		Headers:     headers,
		PreviewRows: preview,
	}, nil
}

// fetchSheetOwner — sheet_id 소유자 user_id 와 headers/row_count/col_count 메타 반환.
// 없거나 만료된 시트는 ErrAttachmentNotFound.
func fetchSheetOwner(ctx context.Context, pool *pgxpool.Pool, sheetID string) (ownerID string, headers []string, rowCount, colCount int, sheetName string, filename string, err error) {
	var headersJSON []byte
	err = pool.QueryRow(ctx, `
		SELECT user_id::text, filename, sheet_name, row_count, col_count, headers
		FROM ai_attachment_sheets
		WHERE sheet_id = $1::uuid AND expires_at > NOW()
	`, sheetID).Scan(&ownerID, &filename, &sheetName, &rowCount, &colCount, &headersJSON)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil, 0, 0, "", "", ErrAttachmentNotFound
		}
		return "", nil, 0, 0, "", "", fmt.Errorf("fetch sheet: %w", err)
	}
	if uerr := json.Unmarshal(headersJSON, &headers); uerr != nil {
		return "", nil, 0, 0, "", "", fmt.Errorf("headers unmarshal: %w", uerr)
	}
	return ownerID, headers, rowCount, colCount, sheetName, filename, nil
}

// cleanupExpiredSheets — 만료된 시트를 한 번 정리. 호출 실패해도 본 작업은 진행.
func cleanupExpiredSheets(ctx context.Context, pool *pgxpool.Pool) {
	_, _ = pool.Exec(ctx, `DELETE FROM ai_attachment_sheets WHERE expires_at < NOW()`)
}

// fetchRows — sheet_id 의 행을 row_num 오름차순으로 가져온다.
// rowStart/rowEnd 가 0 이면 전체. cap 은 호출자가 LIMIT 으로 적용.
func fetchRows(ctx context.Context, pool *pgxpool.Pool, sheetID string, rowStart, rowEnd, limit int) ([][]string, []int, error) {
	q := `SELECT row_num, data FROM ai_attachment_rows WHERE sheet_id = $1::uuid`
	args := []any{sheetID}
	idx := 2
	if rowStart > 0 {
		q += fmt.Sprintf(" AND row_num >= $%d", idx)
		args = append(args, rowStart)
		idx++
	}
	if rowEnd > 0 {
		q += fmt.Sprintf(" AND row_num <= $%d", idx)
		args = append(args, rowEnd)
		idx++
	}
	q += " ORDER BY row_num"
	if limit > 0 {
		q += fmt.Sprintf(" LIMIT $%d", idx)
		args = append(args, limit)
	}

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("query rows: %w", err)
	}
	defer rows.Close()

	var out [][]string
	var nums []int
	for rows.Next() {
		var rowNum int
		var data []byte
		if serr := rows.Scan(&rowNum, &data); serr != nil {
			return nil, nil, fmt.Errorf("scan row: %w", serr)
		}
		var values []string
		if uerr := json.Unmarshal(data, &values); uerr != nil {
			return nil, nil, fmt.Errorf("row %d unmarshal: %w", rowNum, uerr)
		}
		out = append(out, values)
		nums = append(nums, rowNum)
	}
	return out, nums, rows.Err()
}

// columnIndex — 컬럼명을 헤더에서 찾아 0-based 인덱스 반환. 없으면 -1.
// 대소문자·공백 차이를 흡수해 LLM 이 헤더를 약간 다르게 적어도 매칭.
func columnIndex(headers []string, name string) int {
	target := strings.TrimSpace(strings.ToLower(name))
	for i, h := range headers {
		if strings.TrimSpace(strings.ToLower(h)) == target {
			return i
		}
	}
	return -1
}
