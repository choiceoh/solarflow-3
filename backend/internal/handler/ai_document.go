package handler

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"strings"

	"solarflow-backend/internal/model"
)

const (
	mimeDOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	mimeTXT  = "text/plain"
	mimeDOC  = "application/msword"
)

// 추출 텍스트 안전망 — 거대한 docx/txt 가 LLM 컨텍스트를 휩쓸지 않도록.
const maxDocumentChars = 16 << 20

func isDocumentMIME(mime string) bool {
	switch mime {
	case mimeDOCX, mimeTXT:
		return true
	}
	return false
}

// extractDocument — docx/txt 를 텍스트로 풀어 OCRResult 에 담는다.
// 결과는 OCRResult.RawText 에만 채워지고 Lines/Box 는 비어 있다.
func extractDocument(data []byte, mime, filename string) (model.OCRResult, error) {
	result := model.OCRResult{Filename: filename}
	var (
		raw string
		err error
	)
	switch mime {
	case mimeTXT:
		raw = extractTXT(data)
	case mimeDOCX:
		raw, err = extractDOCX(data)
	default:
		return result, fmt.Errorf("문서 형식을 인식할 수 없습니다")
	}
	if err != nil {
		return result, err
	}
	result.RawText = raw
	return result, nil
}

func extractTXT(data []byte) string {
	// UTF-8 BOM 제거 — 윈도우 메모장이 종종 붙여 보냄.
	s := string(bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF}))
	if len(s) > maxDocumentChars {
		s = s[:maxDocumentChars] + "\n(이후 내용은 용량 한도로 생략됨)"
	}
	return strings.TrimRight(s, "\n")
}

// extractDOCX — docx 는 zip 안에 word/document.xml. <w:t> 노드만 뽑고
// 단락(<w:p>)·줄바꿈(<w:br>)·탭(<w:tab>) 만 가벼운 화이트스페이스로 복원한다.
// 표·이미지·주석·각주 등은 무시 (LLM 한테는 본문 텍스트만 흘려보내면 충분).
func extractDOCX(data []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("DOCX 열기: %w", err)
	}

	var doc *zip.File
	for _, f := range zr.File {
		if f.Name == "word/document.xml" {
			doc = f
			break
		}
	}
	if doc == nil {
		return "", fmt.Errorf("DOCX 구조 오류: word/document.xml 없음")
	}
	rc, err := doc.Open()
	if err != nil {
		return "", fmt.Errorf("document.xml 열기: %w", err)
	}
	defer rc.Close()

	raw, err := io.ReadAll(rc)
	if err != nil {
		return "", fmt.Errorf("document.xml 읽기: %w", err)
	}

	dec := xml.NewDecoder(bytes.NewReader(raw))
	var b strings.Builder
	truncated := false
	inText := false
	for {
		if b.Len() >= maxDocumentChars {
			truncated = true
			break
		}
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fmt.Errorf("XML 파싱: %w", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Local == "t" {
				inText = true
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "t":
				inText = false
			case "p":
				b.WriteByte('\n')
			case "br":
				b.WriteByte('\n')
			case "tab":
				b.WriteByte('\t')
			}
		case xml.CharData:
			if inText {
				b.Write(t)
			}
		}
	}
	if truncated {
		b.WriteString("\n(이후 내용은 용량 한도로 생략됨)")
	}
	return strings.TrimRight(b.String(), "\n"), nil
}
