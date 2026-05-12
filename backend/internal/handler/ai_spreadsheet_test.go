package handler

import (
	"bytes"
	"strings"
	"testing"

	"github.com/xuri/excelize/v2"
)

func TestParseCSVSplitsHeaderAndRows(t *testing.T) {
	csvData := "코드,수량,단가\nM-001,10,1200\nM-002,5,1450\n"
	headers, rows, err := parseCSV([]byte(csvData))
	if err != nil {
		t.Fatalf("parseCSV() error = %v", err)
	}
	if got, want := strings.Join(headers, "|"), "코드|수량|단가"; got != want {
		t.Fatalf("headers = %q, want %q", got, want)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(rows))
	}
	if got, want := strings.Join(rows[0], "|"), "M-001|10|1200"; got != want {
		t.Fatalf("row[0] = %q, want %q", got, want)
	}
}

func TestParseCSVHandlesRaggedRows(t *testing.T) {
	csvData := "a,b,c\n1,2\n3,4,5,6\n"
	headers, rows, err := parseCSV([]byte(csvData))
	if err != nil {
		t.Fatalf("parseCSV() error = %v", err)
	}
	if len(headers) != 3 {
		t.Fatalf("headers len = %d, want 3", len(headers))
	}
	if len(rows[0]) != 2 || len(rows[1]) != 4 {
		t.Fatalf("ragged row preservation: %v", rows)
	}
}

func TestParseXLSXSheetsMultiple(t *testing.T) {
	f := excelize.NewFile()
	defer f.Close()
	_ = f.SetCellValue("Sheet1", "A1", "이름")
	_ = f.SetCellValue("Sheet1", "B1", "수량")
	_ = f.SetCellValue("Sheet1", "A2", "모듈A")
	_ = f.SetCellValue("Sheet1", "B2", 100)

	_, _ = f.NewSheet("재고")
	_ = f.SetCellValue("재고", "A1", "창고")
	_ = f.SetCellValue("재고", "B1", "위치")
	_ = f.SetCellValue("재고", "A2", "본사")
	_ = f.SetCellValue("재고", "B2", "1열")

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("Write: %v", err)
	}

	sheets, err := parseXLSXSheets(buf.Bytes())
	if err != nil {
		t.Fatalf("parseXLSXSheets() error = %v", err)
	}
	if len(sheets) != 2 {
		t.Fatalf("sheet count = %d, want 2", len(sheets))
	}
	if got := strings.Join(sheets[0].headers, "|"); got != "이름|수량" {
		t.Fatalf("Sheet1 headers = %q", got)
	}
	if got := strings.Join(sheets[0].rows[0], "|"); got != "모듈A|100" {
		t.Fatalf("Sheet1 row[0] = %q", got)
	}
	if got := strings.Join(sheets[1].headers, "|"); got != "창고|위치" {
		t.Fatalf("재고 headers = %q", got)
	}
}

func TestTrimTrailingEmptyHandlesEdgeCases(t *testing.T) {
	if got := trimTrailingEmpty([]string{"a", "b", "", ""}); strings.Join(got, "|") != "a|b" {
		t.Fatalf("trim mid = %v", got)
	}
	if got := trimTrailingEmpty([]string{"", ""}); len(got) != 0 {
		t.Fatalf("trim all empty = %v", got)
	}
	if got := trimTrailingEmpty([]string{"a"}); strings.Join(got, "|") != "a" {
		t.Fatalf("trim single = %v", got)
	}
}

func TestIsSpreadsheetMIME(t *testing.T) {
	for _, mime := range []string{mimeXLSX, mimeCSV} {
		if !isSpreadsheetMIME(mime) {
			t.Errorf("isSpreadsheetMIME(%q) = false, want true", mime)
		}
	}
	for _, mime := range []string{mimeXLS, "application/pdf", "image/png", ""} {
		if isSpreadsheetMIME(mime) {
			t.Errorf("isSpreadsheetMIME(%q) = true, want false", mime)
		}
	}
}
