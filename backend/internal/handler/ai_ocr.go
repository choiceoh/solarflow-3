package handler

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/ocr"
	"solarflow-backend/internal/ocrparse"
	"solarflow-backend/internal/response"
)

const (
	maxOCRUploadBytes int64 = 30 << 20
	maxOCRBatchBytes  int64 = 192 << 20
)

var allowedOCRMIMETypes = map[string]bool{
	"application/pdf": true,
	"image/jpeg":      true,
	"image/png":       true,
	"image/webp":      true,
	"image/gif":       true,
	mimeXLSX:          true,
	mimeCSV:           true,
	mimeDOCX:          true,
	mimeTXT:           true,
}

// OCRHandler — 업무 서류 이미지/PDF에서 원문 텍스트를 추출
// 비유: 종이 서류를 바로 장부에 쓰지 않고, 먼저 판독 원문으로 펼쳐두는 접수창구
//
// Pool — AI 첨부 시트(xlsx/csv) 임시 저장용 pgx 풀. nil 이면 시트 첨부는 503.
type OCRHandler struct {
	Client *ocr.Client
	Pool   *pgxpool.Pool
}

func NewOCRHandler(client *ocr.Client, pool *pgxpool.Pool) *OCRHandler {
	return &OCRHandler{Client: client, Pool: pool}
}

// init — D-20260512-090000 feature self-mounting.
// /ocr/* standalone 라우트 — write 그룹. AssistantHandler 가 /assistant/ocr/* alias 로 위임하는
// 인스턴스는 AssistantHandler 의 Mount 클로저가 별도 생성한다 (둘 다 d.OCR + d.Pool 만 보유,
// stateless). Pool 은 시트 첨부(xlsx/csv) 임시 저장용 — nil 이면 시트 첨부 자체가 503.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDAIOCR,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewOCRHandler(d.OCR, d.Pool)
			g := d.Gates
			r.Route("/ocr", func(r chi.Router) {
				r.Use(g.Write)
				r.Get("/health", h.Health)
				r.Post("/extract", h.Extract)
			})
		},
	})
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

		// 엑셀/CSV 는 시트를 직접 LLM 컨텍스트에 박지 않고 DB 임시 영역에 저장.
		// 응답에는 메타(sheet_id, 행수·열수, 헤더, 샘플 5행) 만 담아 LLM 이 도구로 조회하도록.
		if isSpreadsheetMIME(mimeType) {
			if h.Pool == nil {
				result.Error = "AI 첨부 시트 저장소가 비활성 상태입니다 (서버 설정 누락). 관리자에게 문의해주세요"
				out.Results = append(out.Results, result)
				continue
			}
			userID := middleware.GetUserID(r.Context())
			if userID == "" {
				result.Error = "시트 첨부에는 로그인이 필요합니다"
				out.Results = append(out.Results, result)
				continue
			}
			sheets, err := saveSpreadsheetSheets(r.Context(), h.Pool, userID, data, mimeType, result.Filename)
			if err != nil {
				log.Printf("[스프레드시트 저장 실패] file=%s err=%v", result.Filename, err)
				result.Error = err.Error()
				out.Results = append(out.Results, result)
				continue
			}
			// 한 파일 안 여러 시트 → 여러 OCRResult 항목으로 펼쳐서 응답.
			out.Results = append(out.Results, sheets...)
			continue
		}

		// 워드(docx)/텍스트(txt) 도 Go 측에서 본문만 뽑아 동일 응답 모델에 담는다.
		if isDocumentMIME(mimeType) {
			doc, err := extractDocument(data, mimeType, result.Filename)
			if err != nil {
				log.Printf("[문서 파싱 실패] file=%s err=%v", result.Filename, err)
				result.Error = err.Error()
				out.Results = append(out.Results, result)
				continue
			}
			out.Results = append(out.Results, doc)
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
	// 면장 정형 추출 — documentType 가 명시되면 무조건 시도, 비어 있으면 자동 판단.
	// 자동 판단은 false positive (인보이스/패킹리스트가 면장으로 잘못 라벨링되는 경우) 를
	// 막기 위해 DeclarationNumber 가 잡힌 경우에만 fields 를 채운다 — 면장 고유 시그널.
	forceCustoms := documentType == "customs_declaration"
	if forceCustoms || looksLikeCustomsDeclaration(result.RawText) {
		fields := ocrparse.ParseCustomsDeclaration(filename, result.Lines)
		if fields != nil && (forceCustoms || fields.DeclarationNumber != nil) {
			result.Fields = &model.OCRFields{
				DocumentType:       "customs_declaration",
				CustomsDeclaration: fields,
			}
		}
	}
	return result
}

// looksLikeCustomsDeclaration — 면장 prefilter. 키워드가 보일 때만 정형 파서를 시도해
// 일반 PDF 에 헛수고 + false positive 를 줄인다.
// 비유: 서류 더미에서 "수입신고" 도장이 찍힌 것만 면장 트레이로 분류.
func looksLikeCustomsDeclaration(rawText string) bool {
	lower := strings.ToLower(rawText)
	keywords := []string{"수입신고", "신고번호", "면장", "세관", "관세청", "uni-pass", "unipass"}
	for _, kw := range keywords {
		if strings.Contains(lower, strings.ToLower(kw)) {
			return true
		}
	}
	return false
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
		switch mimeType {
		case mimeXLS:
			return nil, "", fmt.Errorf("구버전 .xls 는 지원하지 않습니다. .xlsx 로 저장 후 다시 올려주세요")
		case mimeDOC:
			return nil, "", fmt.Errorf("구버전 .doc 는 지원하지 않습니다. .docx 로 저장 후 다시 올려주세요")
		}
		return nil, "", fmt.Errorf("현재 PDF, JPG, PNG, WEBP, GIF, XLSX, CSV, DOCX, TXT 파일만 처리합니다")
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
	// 엑셀·DOCX 매직바이트는 application/zip 으로, CSV·TXT 는 text/plain 으로 판정돼
	// 화이트리스트 mime 에 못 닿는다. 확장자가 명시적이면 그 신호를 우선한다.
	if extType := mimeTypeByExt(filename); extType != "" {
		switch extType {
		case mimeXLSX, mimeCSV, mimeXLS, mimeDOCX, mimeDOC, mimeTXT:
			return extType
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
	case ".xlsx":
		return mimeXLSX
	case ".xls":
		return mimeXLS // 의도적으로 화이트리스트엔 없는 mime — readOCRUpload 가 친절한 안내로 거절
	case ".csv":
		return mimeCSV
	case ".docx":
		return mimeDOCX
	case ".doc":
		return mimeDOC // 마찬가지로 친절한 안내로 거절되는 경로
	case ".txt":
		return mimeTXT
	default:
		return ""
	}
}
