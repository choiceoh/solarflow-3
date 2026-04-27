package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

const maxAttachmentBytes int64 = 25 << 20 // 25MB

var allowedAttachmentEntities = map[string]bool{
	"purchase_orders": true,
	"lc_records":      true,
	"bl_shipments":    true,
	"declarations":    true,
	"outbounds":       true,
	"sales":           true,
	"orders":          true,
	"receipts":        true,
}

// AttachmentHandler — 업무 데이터에 연결되는 PDF 첨부파일 처리
type AttachmentHandler struct {
	DB *supa.Client
}

func NewAttachmentHandler(db *supa.Client) *AttachmentHandler {
	return &AttachmentHandler{DB: db}
}

// List — GET /api/v1/attachments?entity_type=lc_records&entity_id=...
func (h *AttachmentHandler) List(w http.ResponseWriter, r *http.Request) {
	entityType := strings.TrimSpace(r.URL.Query().Get("entity_type"))
	entityID := strings.TrimSpace(r.URL.Query().Get("entity_id"))
	if msg := validateAttachmentTarget(entityType, entityID); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("document_files").
		Select("*", "exact", false).
		Eq("entity_type", entityType).
		Eq("entity_id", entityID).
		Order("created_at", &postgrest.OrderOpts{Ascending: false}).
		Execute()
	if err != nil {
		log.Printf("[첨부파일 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 목록 조회에 실패했습니다")
		return
	}

	var files []model.DocumentFile
	if err := json.Unmarshal(data, &files); err != nil {
		log.Printf("[첨부파일 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	for i := range files {
		files[i].StoredPath = ""
		files[i].StoredName = ""
	}
	response.RespondJSON(w, http.StatusOK, files)
}

// Create — POST /api/v1/attachments — multipart/form-data PDF 업로드
func (h *AttachmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAttachmentBytes+1<<20)
	if err := r.ParseMultipartForm(maxAttachmentBytes + 1<<20); err != nil {
		response.RespondError(w, http.StatusBadRequest, "파일 크기가 너무 크거나 요청 형식이 올바르지 않습니다")
		return
	}

	entityType := strings.TrimSpace(r.FormValue("entity_type"))
	entityID := strings.TrimSpace(r.FormValue("entity_id"))
	fileType := strings.TrimSpace(r.FormValue("file_type"))
	if fileType == "" {
		fileType = "other"
	}
	if msg := validateAttachmentTarget(entityType, entityID); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		response.RespondError(w, http.StatusBadRequest, "업로드할 파일을 선택해주세요")
		return
	}
	defer file.Close()

	originalName := sanitizeDisplayFileName(header.Filename)
	if originalName == "" {
		originalName = "document.pdf"
	}
	if !strings.EqualFold(filepath.Ext(originalName), ".pdf") {
		response.RespondError(w, http.StatusBadRequest, "PDF 파일만 업로드할 수 있습니다")
		return
	}
	if header.Size > maxAttachmentBytes {
		response.RespondError(w, http.StatusBadRequest, "첨부파일은 25MB 이하만 업로드할 수 있습니다")
		return
	}

	fileID := uuid.NewString()
	storedName := fileID + ".pdf"
	dir := filepath.Join(attachmentRoot(), entityType, entityID)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		log.Printf("[첨부파일 디렉터리 생성 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 저장 폴더를 만들 수 없습니다")
		return
	}

	storedPath := filepath.Join(dir, storedName)
	out, err := os.OpenFile(storedPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		log.Printf("[첨부파일 생성 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일을 저장할 수 없습니다")
		return
	}

	size, copyErr := io.Copy(out, io.LimitReader(file, maxAttachmentBytes+1))
	closeErr := out.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(storedPath)
		log.Printf("[첨부파일 저장 실패] copy=%v close=%v", copyErr, closeErr)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 저장 중 오류가 발생했습니다")
		return
	}
	if size > maxAttachmentBytes {
		_ = os.Remove(storedPath)
		response.RespondError(w, http.StatusBadRequest, "첨부파일은 25MB 이하만 업로드할 수 있습니다")
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/pdf"
	}

	req := model.CreateDocumentFileRequest{
		EntityType:   entityType,
		EntityID:     entityID,
		FileType:     fileType,
		OriginalName: originalName,
		StoredName:   storedName,
		StoredPath:   storedPath,
		ContentType:  &contentType,
		SizeBytes:    size,
		UploadedBy:   &userID,
	}

	data, _, err := h.DB.From("document_files").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		_ = os.Remove(storedPath)
		log.Printf("[첨부파일 메타데이터 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 정보를 저장할 수 없습니다")
		return
	}

	var created []model.DocumentFile
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		_ = os.Remove(storedPath)
		log.Printf("[첨부파일 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 등록 결과를 확인할 수 없습니다")
		return
	}

	created[0].StoredPath = ""
	created[0].StoredName = ""
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Download — GET /api/v1/attachments/{id}/download
func (h *AttachmentHandler) Download(w http.ResponseWriter, r *http.Request) {
	file, ok := h.getFile(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	path, err := safeStoredPath(file.StoredPath)
	if err != nil {
		log.Printf("[첨부파일 경로 검증 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 경로가 올바르지 않습니다")
		return
	}

	f, err := os.Open(path)
	if err != nil {
		log.Printf("[첨부파일 열기 실패] %v", err)
		response.RespondError(w, http.StatusNotFound, "첨부파일을 찾을 수 없습니다")
		return
	}
	defer f.Close()

	contentType := "application/pdf"
	if file.ContentType != nil && *file.ContentType != "" {
		contentType = *file.ContentType
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": file.OriginalName}))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", file.SizeBytes))
	http.ServeContent(w, r, file.OriginalName, fileModTime(path), f)
}

// Delete — DELETE /api/v1/attachments/{id}
func (h *AttachmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	file, ok := h.getFile(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	_, _, err := h.DB.From("document_files").
		Delete("", "").
		Eq("file_id", file.FileID).
		Execute()
	if err != nil {
		log.Printf("[첨부파일 삭제 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 삭제에 실패했습니다")
		return
	}

	if path, err := safeStoredPath(file.StoredPath); err == nil {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			log.Printf("[첨부파일 물리 파일 삭제 실패] %v", err)
		}
	}

	response.RespondJSON(w, http.StatusOK, map[string]string{"message": "삭제 완료"})
}

func (h *AttachmentHandler) getFile(w http.ResponseWriter, id string) (model.DocumentFile, bool) {
	data, _, err := h.DB.From("document_files").
		Select("*", "exact", false).
		Eq("file_id", id).
		Execute()
	if err != nil {
		log.Printf("[첨부파일 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 조회에 실패했습니다")
		return model.DocumentFile{}, false
	}

	var files []model.DocumentFile
	if err := json.Unmarshal(data, &files); err != nil {
		log.Printf("[첨부파일 조회 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return model.DocumentFile{}, false
	}
	if len(files) == 0 {
		response.RespondError(w, http.StatusNotFound, "첨부파일을 찾을 수 없습니다")
		return model.DocumentFile{}, false
	}
	return files[0], true
}

func validateAttachmentTarget(entityType, entityID string) string {
	if !allowedAttachmentEntities[entityType] {
		return "지원하지 않는 첨부 대상입니다"
	}
	if _, err := uuid.Parse(entityID); err != nil {
		return "entity_id는 UUID 형식이어야 합니다"
	}
	return ""
}

func attachmentRoot() string {
	if root := strings.TrimSpace(os.Getenv("SOLARFLOW_FILE_ROOT")); root != "" {
		return root
	}
	return "/Users/Shared/SolarFlow/files"
}

func sanitizeDisplayFileName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	name = strings.ReplaceAll(name, "\x00", "")
	return name
}

func safeStoredPath(storedPath string) (string, error) {
	root, err := filepath.Abs(attachmentRoot())
	if err != nil {
		return "", err
	}
	path, err := filepath.Abs(storedPath)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return "", err
	}
	if rel == "." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || rel == ".." {
		return "", fmt.Errorf("path escapes attachment root")
	}
	return path, nil
}

func fileModTime(path string) time.Time {
	info, err := os.Stat(path)
	if err != nil {
		return time.Time{}
	}
	return info.ModTime()
}
