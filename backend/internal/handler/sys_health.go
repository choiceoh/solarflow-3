package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/mount"
)

// HealthCheck은 서버가 살아있는지 확인하는 엔드포인트
// 비유: 건물 입구의 "OPEN" 간판
func HealthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "solarflow-backend",
		"version": "3.0.0",
	})
}

// init — D-20260512-090000 feature self-mounting.
// /health 는 라우터 루트에 직접 마운트 (인증·게이트 없음, unrestrictedAllowlist 등재).
func init() {
	mount.Register(mount.Spec{
		Auth: mount.AuthRoot,
		Mount: func(_ *mount.Deps, r chi.Router) {
			r.Get("/health", HealthCheck)
		},
	})
}
