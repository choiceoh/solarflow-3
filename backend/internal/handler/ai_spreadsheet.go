package handler

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"io"
	"strings"

	"github.com/xuri/excelize/v2"

	"solarflow-backend/internal/model"
)

// 추출 텍스트가 LLM 컨텍스트를 넘기지 않도록 한 단계 더 잘라두는 안전망.
// 업로드 파일 한도와는 별개 — 작은 xlsx 도 풀면 텍스트가 수십 배로 늘어날 수 있다.
const (
	maxSpreadsheetSheetChars = 8 << 20  // 시트당 8MB
	maxSpreadsheetFileChars  = 16 << 20 // 파일당 16MB
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

// extractSpreadsheet — xlsx/csv 를 시트별 텍스트로 풀어 OCRResult 에 담는다.
// LLM 한테 "원본 표" 임을 알 수 있도록 시트 헤더(`[시트: 이름]`) + 파이프 구분 행으로 직렬화.
// OCR 결과와 동일한 RawText 슬롯에 채워 프론트 합성 흐름을 그대로 재사용한다.
func extractSpreadsheet(data []byte, mime, filename string) (model.OCRResult, error) {
	result := model.OCRResult{Filename: filename}
	var (
		raw string
		err error
	)
	switch mime {
	case mimeCSV:
		raw, err = extractCSV(data)
	case mimeXLSX:
		raw, err = extractXLSX(data)
	default:
		return result, fmt.Errorf("스프레드시트 형식을 인식할 수 없습니다")
	}
	if err != nil {
		return result, err
	}
	result.RawText = raw
	return result, nil
}

func extractCSV(data []byte) (string, error) {
	r := csv.NewReader(bytes.NewReader(data))
	r.FieldsPerRecord = -1 // 행마다 컬럼 수가 달라도 통과
	r.LazyQuotes = true

	var b strings.Builder
	skipped := 0
	for {
		record, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fmt.Errorf("CSV 파싱: %w", err)
		}
		if b.Len() >= maxSpreadsheetSheetChars {
			skipped++
			continue
		}
		b.WriteString(strings.Join(record, " | "))
		b.WriteByte('\n')
	}
	if skipped > 0 {
		fmt.Fprintf(&b, "(이후 %d행은 용량 한도로 생략됨)\n", skipped)
	}
	return strings.TrimRight(b.String(), "\n"), nil
}

func extractXLSX(data []byte) (string, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("XLSX 파싱: %w", err)
	}
	defer f.Close()

	var out strings.Builder
	sheets := f.GetSheetList()
	for si, sheet := range sheets {
		if out.Len() >= maxSpreadsheetFileChars {
			fmt.Fprintf(&out, "\n(이후 %d개 시트는 용량 한도로 생략됨)", len(sheets)-si)
			break
		}
		if si > 0 {
			out.WriteString("\n\n")
		}
		fmt.Fprintf(&out, "[시트: %s]\n", sheet)

		rows, err := f.GetRows(sheet)
		if err != nil {
			fmt.Fprintf(&out, "(시트 읽기 실패: %v)\n", err)
			continue
		}
		writeSheetRows(&out, rows)
	}
	return strings.TrimRight(out.String(), "\n"), nil
}

func writeSheetRows(out *strings.Builder, rows [][]string) {
	sheetStart := out.Len()
	skipped := 0
	for _, row := range rows {
		if out.Len()-sheetStart >= maxSpreadsheetSheetChars || out.Len() >= maxSpreadsheetFileChars {
			skipped++
			continue
		}
		// trailing 빈 셀 제거 — excelize 는 시트 최대 컬럼까지 채워서 반환.
		for len(row) > 0 && strings.TrimSpace(row[len(row)-1]) == "" {
			row = row[:len(row)-1]
		}
		if len(row) == 0 {
			out.WriteByte('\n')
			continue
		}
		out.WriteString(strings.Join(row, " | "))
		out.WriteByte('\n')
	}
	if skipped > 0 {
		fmt.Fprintf(out, "(이후 %d행은 용량 한도로 생략됨)\n", skipped)
	}
}
