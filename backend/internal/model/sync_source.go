package model

// ExternalSyncSource — 외부 소스(구글 시트 등) 단방향 동기화 대상 (D-059).
// cron worker (1시간 ticker) 가 enabled=true + schedule='hourly' 행을 fetch → 변환 → idempotent INSERT.
type ExternalSyncSource struct {
	SyncID            string  `json:"sync_id"`
	Name              string  `json:"name"`
	SourceKind        string  `json:"source_kind"`
	SpreadsheetID     string  `json:"spreadsheet_id"`
	SheetGid          int64   `json:"sheet_gid"`
	ExternalFormatID  string  `json:"external_format_id"`
	Schedule          string  `json:"schedule"`
	Enabled           bool    `json:"enabled"`
	LastSyncedAt      *string `json:"last_synced_at"`
	LastSyncCount     *int    `json:"last_sync_count"`
	LastSkippedCount  *int    `json:"last_skipped_count"`
	LastError         *string `json:"last_error"`
	DefaultWarehouseID *string `json:"default_warehouse_id"`
	CreatedAt         string  `json:"created_at"`
	CreatedBy         *string `json:"created_by,omitempty"`
}

type CreateExternalSyncSourceRequest struct {
	Name             string `json:"name"`
	SourceKind       string `json:"source_kind"`
	SpreadsheetID    string `json:"spreadsheet_id"`
	SheetGid         int64  `json:"sheet_gid"`
	ExternalFormatID string `json:"external_format_id"`
	Schedule         string `json:"schedule"`
	Enabled          *bool  `json:"enabled"`
}

func (r *CreateExternalSyncSourceRequest) Validate() string {
	if r.Name == "" {
		return "name은 필수 항목입니다"
	}
	if r.SourceKind == "" {
		r.SourceKind = "google_sheet"
	}
	if r.SourceKind != "google_sheet" {
		return "source_kind는 현재 'google_sheet'만 지원합니다"
	}
	if r.SpreadsheetID == "" {
		return "spreadsheet_id는 필수 항목입니다"
	}
	if r.ExternalFormatID == "" {
		return "external_format_id는 필수 항목입니다"
	}
	if r.Schedule == "" {
		r.Schedule = "hourly"
	}
	if r.Schedule != "hourly" && r.Schedule != "manual" {
		return "schedule은 'hourly' 또는 'manual'이어야 합니다"
	}
	return ""
}

type UpdateExternalSyncSourceRequest struct {
	Name               *string `json:"name,omitempty"`
	Schedule           *string `json:"schedule,omitempty"`
	Enabled            *bool   `json:"enabled,omitempty"`
	DefaultWarehouseID *string `json:"default_warehouse_id,omitempty"`
}

func (r *UpdateExternalSyncSourceRequest) Validate() string {
	if r.Schedule != nil && *r.Schedule != "hourly" && *r.Schedule != "manual" {
		return "schedule은 'hourly' 또는 'manual'이어야 합니다"
	}
	return ""
}
