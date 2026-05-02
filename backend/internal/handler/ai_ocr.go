package handler

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/ocr"
	"solarflow-backend/internal/ocrparse"
	"solarflow-backend/internal/response"
)

const (
	maxOCRUploadBytes int64 = 20 << 20
	maxOCRBatchBytes  int64 = 128 << 20
)

var allowedOCRMIMETypes = map[string]bool{
	"application/pdf": true,
	"image/jpeg":      true,
	"image/png":       true,
	"image/webp":      true,
	"image/gif":       true,
}

// OCRHandler — 업무 서류 이미지/PDF에서 원문 텍스트를 추출
// 비유: 종이 서류를 바로 장부에 쓰지 않고, 먼저 판독 원문으로 펼쳐두는 접수창구
type OCRHandler struct {
	Client *ocr.Client
}

func NewOCRHandler(client *ocr.Client) *OCRHandler {
	return &OCRHandler{Client: client}
}

// Health — GET /api/v1/ocr/health — OCR sidecar 설정/준비 상태 확인
func (h *OCRHandler) Health(w http.ResponseWriter, r *http.Request) {
	if h.Client == nil {
		response.RespondJSON(w, http.StatusServiceUnavailable, ocr.Status{
			Status: "error",
			Error:  "OCR 클라이언트가 준비되지 않았습니다",
		})
		return
	}

	warm := r.URL.Query().Get("warm") == "1"
	status := h.Client.Health(r.Context(), warm)
	httpStatus := http.StatusOK
	if warm && !status.Ready {
		httpStatus = http.StatusServiceUnavailable
	}
	response.RespondJSON(w, httpStatus, status)
}

// Extract — POST /api/v1/ocr/extract — multipart images[] 이미지/PDF OCR 미리보기
func (h *OCRHandler) Extract(w http.ResponseWriter, r *http.Request) {
	if h.Client == nil {
		response.RespondError(w, http.StatusInternalServerError, "OCR 클라이언트가 준비되지 않았습니다")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxOCRBatchBytes)
	if err := r.ParseMultipartForm(maxOCRBatchBytes); err != nil {
		response.RespondError(w, http.StatusBadRequest, "파일 크기가 너무 크거나 요청 형식이 올바르지 않습니다")
		return
	}

	files := r.MultipartForm.File["images"]
	if len(files) == 0 {
		response.RespondError(w, http.StatusBadRequest, "OCR로 읽을 이미지 또는 PDF를 선택해주세요")
		return
	}
	documentType := normalizeOCRDocumentType(r.FormValue("document_type"))

	out := model.OCRExtractResponse{Results: make([]model.OCRResult, 0, len(files))}
	for _, header := range files {
		result := model.OCRResult{Filename: sanitizeDisplayFileName(header.Filename)}
		if result.Filename == "" {
			result.Filename = "image"
		}
		if header.Size <= 0 {
			result.Error = "빈 파일은 처리할 수 없습니다"
			out.Results = append(out.Results, result)
			continue
		}
		if header.Size > maxOCRUploadBytes {
			result.Error = fmt.Sprintf("파일은 %dMB 이하만 처리할 수 있습니다", maxOCRUploadBytes/(1024*1024))
			out.Results = append(out.Results, result)
			continue
		}

		file, err := header.Open()
		if err != nil {
			result.Error = fmt.Sprintf("파일을 열 수 없습니다: %v", err)
			out.Results = append(out.Results, result)
			continue
		}
		data, mimeType, err := readOCRUpload(file, header.Header.Get("Content-Type"), result.Filename)
		if err != nil {
			result.Error = err.Error()
			out.Results = append(out.Results, result)
			continue
		}

		lines, err := h.Client.RecognizeBytes(r.Context(), data, mimeType, result.Filename)
		if err != nil {
			log.Printf("[OCR 추출 실패] file=%s err=%v", result.Filename, err)
			result.Error = err.Error()
			out.Results = append(out.Results, result)
			continue
		}
		result = buildOCRResult(result.Filename, lines, documentType)
		out.Results = append(out.Results, result)
	}

	response.RespondJSON(w, http.StatusOK, out)
}

func buildOCRResult(filename string, lines []ocr.Result, documentType string) model.OCRResult {
	result := model.OCRResult{
		Filename: filename,
		Lines:    make([]model.OCRLine, 0, len(lines)),
	}
	raw := make([]string, 0, len(lines))
	for _, line := range lines {
		text := strings.TrimSpace(line.Text)
		if text != "" {
			raw = append(raw, text)
		}
		result.Lines = append(result.Lines, model.OCRLine{
			Text:  line.Text,
			Score: line.Score,
			Box: model.OCRBox{
				X0: line.X0,
				Y0: line.Y0,
				X1: line.X1,
				Y1: line.Y1,
			},
		})
	}
	result.RawText = strings.Join(raw, "\n")
	if documentType == "customs_declaration" {
		fields := ocrparse.ParseCustomsDeclaration(filename, result.Lines)
		if fields != nil {
			result.Fields = &model.OCRFields{
				DocumentType:       documentType,
				CustomsDeclaration: fields,
			}
		}
	}
	return result
}

func normalizeOCRDocumentType(value string) string {
	switch strings.TrimSpace(value) {
	case "customs_declaration":
		return "customs_declaration"
	default:
		return ""
	}
}

func readOCRUpload(file io.ReadCloser, contentType string, filename string) ([]byte, string, error) {
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxOCRUploadBytes+1))
	if err != nil {
		return nil, "", fmt.Errorf("파일을 읽을 수 없습니다: %w", err)
	}
	if int64(len(data)) > maxOCRUploadBytes {
		return nil, "", fmt.Errorf("파일은 %dMB 이하만 처리할 수 있습니다", maxOCRUploadBytes/(1024*1024))
	}

	mimeType := normalizeOCRMIME(contentType, filename, data)
	if !allowedOCRMIMETypes[mimeType] {
		return nil, "", fmt.Errorf("현재 OCR은 PDF, JPG, PNG, WEBP, GIF 파일만 처리합니다")
	}
	return data, mimeType, nil
}

func normalizeOCRMIME(contentType string, filename string, data []byte) string {
	mimeType := strings.TrimSpace(strings.Split(contentType, ";")[0])
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(data)
	}
	if mimeType == "application/octet-stream" {
		if extType := mimeTypeByExt(filename); extType != "" {
			mimeType = extType
		}
	}
	return mimeType
}

func mimeTypeByExt(filename string) string {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".pdf":
		return "application/pdf"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	default:
		return ""
	}
}
