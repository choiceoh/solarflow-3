package handler

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"solarflow-backend/internal/ocr"
)

func TestReadOCRUploadAcceptsImageData(t *testing.T) {
	pngHeader := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	data, mimeType, err := readOCRUpload(io.NopCloser(bytes.NewReader(pngHeader)), "", "module.png")
	if err != nil {
		t.Fatalf("readOCRUpload() error = %v", err)
	}
	if !bytes.Equal(data, pngHeader) {
		t.Fatalf("data = %v", data)
	}
	if mimeType != "image/png" {
		t.Fatalf("mimeType = %q, want image/png", mimeType)
	}
}

func TestReadOCRUploadAcceptsPDF(t *testing.T) {
	data, mimeType, err := readOCRUpload(io.NopCloser(strings.NewReader("%PDF-1.7")), "application/pdf", "document.pdf")
	if err != nil {
		t.Fatalf("readOCRUpload() error = %v", err)
	}
	if string(data) != "%PDF-1.7" {
		t.Fatalf("data = %q", string(data))
	}
	if mimeType != "application/pdf" {
		t.Fatalf("mimeType = %q, want application/pdf", mimeType)
	}
}

func TestReadOCRUploadRejectsUnsupportedData(t *testing.T) {
	_, _, err := readOCRUpload(io.NopCloser(strings.NewReader("plain text")), "text/plain", "memo.txt")
	if err == nil {
		t.Fatal("readOCRUpload() error = nil, want error")
	}
	if !strings.Contains(err.Error(), "PDF") {
		t.Fatalf("error = %q, want supported file message", err.Error())
	}
}

func TestBuildOCRResultJoinsRawTextAndKeepsBoxes(t *testing.T) {
	got := buildOCRResult("spec.png", []ocr.Result{
		{Text: "  SolarFlow  ", Score: 0.98, X0: 1, Y0: 2, X1: 30, Y1: 12},
		{Text: "", Score: 0.25, X0: 3, Y0: 4, X1: 5, Y1: 6},
		{Text: "Module", Score: 0.95, X0: 8, Y0: 9, X1: 40, Y1: 20},
	})
	if got.Filename != "spec.png" {
		t.Fatalf("Filename = %q", got.Filename)
	}
	if got.RawText != "SolarFlow\nModule" {
		t.Fatalf("RawText = %q", got.RawText)
	}
	if len(got.Lines) != 3 {
		t.Fatalf("len(Lines) = %d", len(got.Lines))
	}
	if got.Lines[0].Box.X0 != 1 || got.Lines[0].Box.Y1 != 12 {
		t.Fatalf("first box = %+v", got.Lines[0].Box)
	}
}

func TestOCRHealthReportsNotConfigured(t *testing.T) {
	h := NewOCRHandler(ocr.New(""))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ocr/health", nil).WithContext(context.Background())
	rec := httptest.NewRecorder()

	h.Health(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"status":"not_configured"`) {
		t.Fatalf("body = %s", rec.Body.String())
	}
}
