package handler

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"

	"solarflow-backend/internal/model"
)

const (
	mimeXLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	mimeCSV  = "text/csv"
	mimeXLS  = "application/vnd.ms-excel"
)

func isSpreadsheetMIME(mime string) bool {
	switch mime {
	case mimeXLSX, mimeCSV:
		return true
	}
	return false
}

// saveSpreadsheetSheets — 업로드된 xlsx/csv 를 시트 단위로 DB 에 저장하고,
// 각 시트의 메타+미리보기를 담은 OCRResult 슬라이스를 반환한다.
// 한 파일에 여러 시트가 있으면 시트마다 별도 OCRResult 항목으로 응답된다.
// 시트당 5만행 cap 초과 시 그 시트만 Error 가 채워지고 다른 시트는 정상 저장.
func saveSpreadsheetSheets(ctx context.Context, pool *pgxpool.Pool, userID string, data []byte, mime, filename string) ([]model.OCRResult, error) {
	switch mime {
	case mimeCSV:
		headers, rows, err := parseCSV(data)
		if err != nil {
			return nil, err
		}
		return []model.OCRResult{saveOneSheet(ctx, pool, userID, filename, "CSV", headers, rows)}, nil

	case mimeXLSX:
		sheets, err := parseXLSXSheets(data)
		if err != nil {
			return nil, err
		}
		if len(sheets) == 0 {
			return []model.OCRResult{{Filename: filename, Error: "엑셀에서 시트를 찾지 못했습니다"}}, nil
		}
		out := make([]model.OCRResult, 0, len(sheets))
		for _, s := range sheets {
			out = append(out, saveOneSheet(ctx, pool, userID, filename, s.name, s.headers, s.rows))
		}
		return out, nil
	}
	return nil, fmt.Errorf("스프레드시트 형식을 인식할 수 없습니다")
}

// saveOneSheet — DB 저장 시도. 행 cap 초과·DB 오류 시 result.Error 만 채워 반환.
func saveOneSheet(ctx context.Context, pool *pgxpool.Pool, userID, filename, sheetName string, headers []string, rows [][]string) model.OCRResult {
	meta, err := SaveAttachmentSheet(ctx, pool, userID, filename, sheetName, headers, rows)
	if err != nil {
		if errors.Is(err, ErrAttachmentTooLarge) || err == ErrAttachmentTooLarge {
			return model.OCRResult{Filename: filename, Error: err.Error()}
		}
		return model.OCRResult{Filename: filename, Error: fmt.Sprintf("시트 저장 실패: %v", err)}
	}
	return model.OCRResult{
		Filename: filename,
		Sheet: &model.SheetMeta{
			SheetID:     meta.SheetID,
			SheetName:   meta.SheetName,
			RowCount:    meta.RowCount,
			ColCount:    meta.ColCount,
			Headers:     meta.Headers,
			PreviewRows: meta.PreviewRows,
		},
	}
}

type parsedSheet struct {
	name    string
	headers []string
	rows    [][]string
}

// parseXLSXSheets — 모든 시트의 (헤더, 데이터행) 을 추출.
// 첫 행을 헤더로 가정. 빈 시트는 헤더만 빈 슬라이스로 반환.
func parseXLSXSheets(data []byte) ([]parsedSheet, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("XLSX 열기: %w", err)
	}
	defer f.Close()

	var out []parsedSheet
	for _, name := range f.GetSheetList() {
		rows, err := f.GetRows(name)
		if err != nil {
			return nil, fmt.Errorf("시트 %q 읽기: %w", name, err)
		}
		headers, body := splitHeaderAndRows(rows)
		out = append(out, parsedSheet{name: name, headers: headers, rows: body})
	}
	return out, nil
}

// parseCSV — 첫 행을 헤더로, 나머지를 데이터 행으로 분리.
func parseCSV(data []byte) ([]string, [][]string, error) {
	r := csv.NewReader(bytes.NewReader(data))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true

	var all [][]string
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, nil, fmt.Errorf("CSV 파싱: %w", err)
		}
		all = append(all, rec)
	}
	headers, body := splitHeaderAndRows(all)
	return headers, body, nil
}

func splitHeaderAndRows(rows [][]string) ([]string, [][]string) {
	if len(rows) == 0 {
		return []string{}, [][]string{}
	}
	headers := trimTrailingEmpty(rows[0])
	body := make([][]string, 0, len(rows)-1)
	for _, r := range rows[1:] {
		body = append(body, trimTrailingEmpty(r))
	}
	return headers, body
}

func trimTrailingEmpty(row []string) []string {
	out := append([]string(nil), row...)
	for len(out) > 0 && out[len(out)-1] == "" {
		out = out[:len(out)-1]
	}
	return out
}
