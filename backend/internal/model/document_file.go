package model

// DocumentFile — 업무 데이터에 연결된 파일 메타데이터
type DocumentFile struct {
	FileID       string  `json:"file_id"`
	EntityType   string  `json:"entity_type"`
	EntityID     string  `json:"entity_id"`
	FileType     string  `json:"file_type"`
	OriginalName string  `json:"original_name"`
	StoredName   string  `json:"stored_name"`
	StoredPath   string  `json:"stored_path,omitempty"`
	ContentType  *string `json:"content_type"`
	SizeBytes    int64   `json:"size_bytes"`
	UploadedBy   *string `json:"uploaded_by"`
	CreatedAt    string  `json:"created_at"`
}

// CreateDocumentFileRequest — document_files INSERT payload
type CreateDocumentFileRequest struct {
	EntityType   string  `json:"entity_type"`
	EntityID     string  `json:"entity_id"`
	FileType     string  `json:"file_type"`
	OriginalName string  `json:"original_name"`
	StoredName   string  `json:"stored_name"`
	StoredPath   string  `json:"stored_path"`
	ContentType  *string `json:"content_type,omitempty"`
	SizeBytes    int64   `json:"size_bytes"`
	UploadedBy   *string `json:"uploaded_by,omitempty"`
}
