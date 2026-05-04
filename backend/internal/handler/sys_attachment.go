package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
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

const (
	maxAttachmentBytes        int64 = 25 << 20  // 25MB — PO/LC/BL 등 일반 업무 첨부 기본 한도
	libraryMaxAttachmentBytes int64 = 500 << 20 // 500MB — 자료실 전용 (대용량 매뉴얼/영상 등)
	attachmentAccessTTL             = 24 * time.Hour
)

// attachmentBytesLimit — entity_type 별 첨부 용량 상한.
// 자료실(library_posts)만 500MB 까지 허용하고, 그 외 업무 도메인은 기존 25MB 유지.
func attachmentBytesLimit(entityType string) int64 {
	if entityType == "library_posts" {
		return libraryMaxAttachmentBytes
	}
	return maxAttachmentBytes
}

var allowedAttachmentEntities = map[string]bool{
	"purchase_orders": true,
	"lc_records":      true,
	"bl_shipments":    true,
	"declarations":    true,
	"library_posts":   true,
	"outbounds":       true,
	"sales":           true,
	"orders":          true,
	"receipts":        true,
}

var allowedAttachmentExtensions = map[string]string{
	".pdf":  "application/pdf",
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".doc":  "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xls":  "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".ppt":  "application/vnd.ms-powerpoint",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".txt":  "text/plain; charset=utf-8",
	".csv":  "text/csv; charset=utf-8",
	".zip":  "application/zip",
}

// AttachmentHandler — 업무 데이터에 연결되는 첨부파일 처리
// D-064: PDF 원문 보관/조회에서 시작했고, 자료실은 일반 업무 첨부 확장자까지 허용한다.
// TODO: Phase 5(D-064) — PDF 자동 데이터 입력은 파싱→미리보기→확정등록 흐름으로 별도 구현.
type AttachmentHandler struct {
	DB *supa.Client
}

func NewAttachmentHandler(db *supa.Client) *AttachmentHandler {
	return &AttachmentHandler{DB: db}
}

type attachmentAccessResponse struct {
	URL       string `json:"url"`
	ExpiresAt int64  `json:"expires_at"`
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

// Access — GET /api/v1/attachments/{id}/access?disposition=inline|attachment
func (h *AttachmentHandler) Access(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := uuid.Parse(id); err != nil {
		response.RespondError(w, http.StatusBadRequest, "첨부파일 ID가 올바르지 않습니다")
		return
	}

	disposition := normalizeDisposition(r.URL.Query().Get("disposition"))
	expiresAt := time.Now().Add(attachmentAccessTTL).Unix()
	token, err := signAttachmentToken(id, disposition, expiresAt)
	if err != nil {
		log.Printf("[첨부파일 접근 토큰 생성 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 접근 링크를 만들 수 없습니다")
		return
	}

	url := fmt.Sprintf("/api/v1/attachments/%s/file?disposition=%s&expires=%d&token=%s", id, disposition, expiresAt, token)
	response.RespondJSON(w, http.StatusOK, attachmentAccessResponse{URL: url, ExpiresAt: expiresAt})
}

// Create — POST /api/v1/attachments — multipart/form-data 첨부파일 업로드
func (h *AttachmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}

	// entity_type 을 알기 전이라 가장 큰 한도(자료실)를 기준으로 본문을 받고,
	// 실제 한도 검사는 entity_type 파싱 직후에 수행한다.
	r.Body = http.MaxBytesReader(w, r.Body, libraryMaxAttachmentBytes+1<<20)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
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
		originalName = "attachment.pdf"
	}
	ext, msg := validateAttachmentExtension(originalName)
	if msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	limitBytes := attachmentBytesLimit(entityType)
	if header.Size > limitBytes {
		response.RespondError(w, http.StatusBadRequest, fmt.Sprintf("첨부파일은 %dMB 이하만 업로드할 수 있습니다", limitBytes>>20))
		return
	}

	fileID := uuid.NewString()
	storedName := fileID + ext
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

	size, copyErr := io.Copy(out, io.LimitReader(file, limitBytes+1))
	closeErr := out.Close()
	if copyErr != nil || closeErr != nil {
		removeStoredFile(storedPath)
		log.Printf("[첨부파일 저장 실패] copy=%v close=%v", copyErr, closeErr)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 저장 중 오류가 발생했습니다")
		return
	}
	if size > limitBytes {
		removeStoredFile(storedPath)
		response.RespondError(w, http.StatusBadRequest, fmt.Sprintf("첨부파일은 %dMB 이하만 업로드할 수 있습니다", limitBytes>>20))
		return
	}

	contentType := normalizeAttachmentContentType(header.Header.Get("Content-Type"), ext)

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
		removeStoredFile(storedPath)
		log.Printf("[첨부파일 메타데이터 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 정보를 저장할 수 없습니다")
		return
	}

	var created []model.DocumentFile
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		removeStoredFile(storedPath)
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

	h.serveFile(w, r, file, "attachment")
}

// ServeSigned — GET /api/v1/attachments/{id}/file?disposition=inline|attachment&expires=...&token=...
func (h *AttachmentHandler) ServeSigned(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	disposition := normalizeDisposition(r.URL.Query().Get("disposition"))
	expiresAt, err := strconv.ParseInt(r.URL.Query().Get("expires"), 10, 64)
	if err != nil {
		response.RespondError(w, http.StatusBadRequest, "첨부파일 접근 링크가 올바르지 않습니다")
		return
	}
	if time.Now().Unix() > expiresAt {
		response.RespondError(w, http.StatusUnauthorized, "첨부파일 접근 링크가 만료되었습니다")
		return
	}
	expected, err := signAttachmentToken(id, disposition, expiresAt)
	if err != nil {
		log.Printf("[첨부파일 토큰 검증 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 접근 링크를 확인할 수 없습니다")
		return
	}
	if !hmac.Equal([]byte(expected), []byte(r.URL.Query().Get("token"))) {
		response.RespondError(w, http.StatusUnauthorized, "첨부파일 접근 링크가 올바르지 않습니다")
		return
	}

	file, ok := h.getFile(w, id)
	if !ok {
		return
	}

	h.serveFile(w, r, file, disposition)
}

func (h *AttachmentHandler) serveFile(w http.ResponseWriter, r *http.Request, file model.DocumentFile, disposition string) {
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

	contentType := "application/octet-stream"
	if disposition == "attachment" {
		contentType = "application/octet-stream"
	} else if file.ContentType != nil && *file.ContentType != "" {
		contentType = *file.ContentType
	} else if guessed := mime.TypeByExtension(strings.ToLower(filepath.Ext(file.OriginalName))); guessed != "" {
		contentType = guessed
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": file.OriginalName}))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", file.SizeBytes))
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, file.OriginalName, fileModTime(path), f)
}

// Delete — DELETE /api/v1/attachments/{id}
func (h *AttachmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	file, ok := h.getFile(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	path, err := safeStoredPath(file.StoredPath)
	if err != nil {
		log.Printf("[첨부파일 삭제 경로 검증 실패] file_id=%s err=%v", file.FileID, err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 경로가 올바르지 않습니다")
		return
	}

	deletingPath := path + ".deleting"
	fileMoved := false
	if err := os.Rename(path, deletingPath); err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[첨부파일 삭제 대기 이동 실패] file_id=%s path=%s err=%v", file.FileID, path, err)
			response.RespondError(w, http.StatusInternalServerError, "첨부파일 실제 파일 삭제 준비에 실패했습니다")
			return
		}
	} else {
		fileMoved = true
	}

	_, _, err = h.DB.From("document_files").
		Delete("", "").
		Eq("file_id", file.FileID).
		Execute()
	if err != nil {
		if fileMoved {
			if restoreErr := os.Rename(deletingPath, path); restoreErr != nil {
				log.Printf("[첨부파일 삭제 실패 후 파일 복구 실패] file_id=%s path=%s err=%v", file.FileID, path, restoreErr)
			}
		}
		log.Printf("[첨부파일 DB 레코드 삭제 실패] file_id=%s err=%v", file.FileID, err)
		response.RespondError(w, http.StatusInternalServerError, "첨부파일 삭제에 실패했습니다")
		return
	}

	if fileMoved {
		if err := os.Remove(deletingPath); err != nil && !os.IsNotExist(err) {
			log.Printf("[첨부파일 삭제 완료 후 파일 정리 실패] file_id=%s path=%s err=%v", file.FileID, deletingPath, err)
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

func validateAttachmentExtension(name string) (string, string) {
	ext := strings.ToLower(filepath.Ext(name))
	if ext == "" {
		return "", "첨부파일 확장자를 확인할 수 없습니다"
	}
	if !strings.EqualFold(ext, ".pdf") {
		if _, ok := allowedAttachmentExtensions[ext]; !ok {
			return "", "지원하지 않는 첨부파일 형식입니다"
		}
	}
	return ext, ""
}

func normalizeAttachmentContentType(headerValue, ext string) string {
	headerValue = strings.TrimSpace(headerValue)
	if headerValue != "" && headerValue != "application/octet-stream" {
		return headerValue
	}
	if value := allowedAttachmentExtensions[ext]; value != "" {
		return value
	}
	if value := mime.TypeByExtension(ext); value != "" {
		return value
	}
	return "application/octet-stream"
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

func removeStoredFile(path string) {
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		log.Printf("[첨부파일 임시 파일 정리 실패] path=%s err=%v", path, err)
	}
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

func normalizeDisposition(value string) string {
	if strings.EqualFold(value, "inline") {
		return "inline"
	}
	return "attachment"
}

func signAttachmentToken(fileID, disposition string, expiresAt int64) (string, error) {
	secret := os.Getenv("ATTACHMENT_SIGNING_SECRET")
	if secret == "" {
		secret = os.Getenv("SUPABASE_JWT_SECRET")
	}
	if secret == "" {
		return "", fmt.Errorf("missing attachment signing secret")
	}
	payload := fmt.Sprintf("%s:%s:%d", fileID, disposition, expiresAt)
	mac := hmac.New(sha256.New, []byte(secret))
	if _, err := mac.Write([]byte(payload)); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func fileModTime(path string) time.Time {
	info, err := os.Stat(path)
	if err != nil {
		return time.Time{}
	}
	return info.ModTime()
}
