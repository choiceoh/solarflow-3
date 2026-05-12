package handler

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
)

func TestExtractTXTStripsBOMAndTrailingNewline(t *testing.T) {
	data := []byte("\xEF\xBB\xBFhello\nworld\n")
	got := extractTXT(data)
	if got != "hello\nworld" {
		t.Fatalf("extractTXT() = %q, want %q", got, "hello\nworld")
	}
}

func TestExtractTXTPassesPlainContent(t *testing.T) {
	got := extractTXT([]byte("단일 줄 메모"))
	if got != "단일 줄 메모" {
		t.Fatalf("extractTXT() = %q", got)
	}
}

func TestExtractDOCX(t *testing.T) {
	docxBytes := buildTestDOCX(t,
		`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`+
			`<w:body>`+
			`<w:p><w:r><w:t>안녕하세요</w:t></w:r></w:p>`+
			`<w:p><w:r><w:t>두번째 단락</w:t><w:tab/><w:t>탭 뒤</w:t></w:r></w:p>`+
			`<w:p><w:r><w:t>줄</w:t><w:br/><w:t>바꿈</w:t></w:r></w:p>`+
			`</w:body></w:document>`)

	got, err := extractDOCX(docxBytes)
	if err != nil {
		t.Fatalf("extractDOCX() error = %v", err)
	}
	if !strings.Contains(got, "안녕하세요") {
		t.Fatalf("missing first paragraph in %q", got)
	}
	if !strings.Contains(got, "두번째 단락\t탭 뒤") {
		t.Fatalf("missing tab handling in %q", got)
	}
	if !strings.Contains(got, "줄\n바꿈") {
		t.Fatalf("missing br handling in %q", got)
	}
}

func TestExtractDOCXRejectsNonZip(t *testing.T) {
	_, err := extractDOCX([]byte("not a zip"))
	if err == nil {
		t.Fatal("extractDOCX() error = nil, want error")
	}
}

func TestExtractDOCXRequiresDocumentXML(t *testing.T) {
	// zip 이지만 word/document.xml 가 없는 경우
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, _ := zw.Create("other.xml")
	_, _ = w.Write([]byte("<x/>"))
	_ = zw.Close()

	_, err := extractDOCX(buf.Bytes())
	if err == nil || !strings.Contains(err.Error(), "document.xml") {
		t.Fatalf("extractDOCX() error = %v, want document.xml message", err)
	}
}

func TestIsDocumentMIME(t *testing.T) {
	for _, mime := range []string{mimeDOCX, mimeTXT} {
		if !isDocumentMIME(mime) {
			t.Errorf("isDocumentMIME(%q) = false, want true", mime)
		}
	}
	for _, mime := range []string{mimeDOC, mimeXLSX, "application/pdf", ""} {
		if isDocumentMIME(mime) {
			t.Errorf("isDocumentMIME(%q) = true, want false", mime)
		}
	}
}

func buildTestDOCX(t *testing.T, documentXML string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, err := zw.Create("word/document.xml")
	if err != nil {
		t.Fatalf("zip create: %v", err)
	}
	if _, err := w.Write([]byte(documentXML)); err != nil {
		t.Fatalf("zip write: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
	return buf.Bytes()
}
