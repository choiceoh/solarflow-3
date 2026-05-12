package handler

import (
	"bytes"
	"strings"
	"testing"

	"github.com/xuri/excelize/v2"
)

func TestExtractCSV(t *testing.T) {
	csvData := "코드,수량,단가\nM-001,10,1200\nM-002,5,1450\n"
	got, err := extractCSV([]byte(csvData))
	if err != nil {
		t.Fatalf("extractCSV() error = %v", err)
	}
	want := "코드 | 수량 | 단가\nM-001 | 10 | 1200\nM-002 | 5 | 1450"
	if got != want {
		t.Fatalf("extractCSV() = %q, want %q", got, want)
	}
}

func TestExtractCSVHandlesRaggedRows(t *testing.T) {
	csvData := "a,b,c\n1,2\n3,4,5,6\n"
	got, err := extractCSV([]byte(csvData))
	if err != nil {
		t.Fatalf("extractCSV() error = %v", err)
	}
	if !strings.Contains(got, "1 | 2") || !strings.Contains(got, "3 | 4 | 5 | 6") {
		t.Fatalf("extractCSV() ragged-row output = %q", got)
	}
}

func TestExtractXLSXMultipleSheets(t *testing.T) {
	f := excelize.NewFile()
	defer f.Close()
	// 기본 시트 Sheet1
	_ = f.SetCellValue("Sheet1", "A1", "이름")
	_ = f.SetCellValue("Sheet1", "B1", "수량")
	_ = f.SetCellValue("Sheet1", "A2", "모듈A")
	_ = f.SetCellValue("Sheet1", "B2", 100)

	idx, err := f.NewSheet("재고")
	if err != nil {
		t.Fatalf("NewSheet: %v", err)
	}
	_ = idx
	_ = f.SetCellValue("재고", "A1", "창고")
	_ = f.SetCellValue("재고", "B1", "위치")
	_ = f.SetCellValue("재고", "A2", "본사")
	_ = f.SetCellValue("재고", "B2", "1열")

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("Write: %v", err)
	}

	got, err := extractXLSX(buf.Bytes())
	if err != nil {
		t.Fatalf("extractXLSX() error = %v", err)
	}
	if !strings.Contains(got, "[시트: Sheet1]") {
		t.Fatalf("missing Sheet1 header in %q", got)
	}
	if !strings.Contains(got, "[시트: 재고]") {
		t.Fatalf("missing 재고 sheet header in %q", got)
	}
	if !strings.Contains(got, "이름 | 수량") || !strings.Contains(got, "모듈A | 100") {
		t.Fatalf("missing Sheet1 rows in %q", got)
	}
	if !strings.Contains(got, "창고 | 위치") || !strings.Contains(got, "본사 | 1열") {
		t.Fatalf("missing 재고 rows in %q", got)
	}
}

func TestExtractSpreadsheetRejectsUnknownMIME(t *testing.T) {
	_, err := extractSpreadsheet([]byte("plain"), "text/plain", "memo.txt")
	if err == nil {
		t.Fatal("extractSpreadsheet() error = nil, want error")
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
