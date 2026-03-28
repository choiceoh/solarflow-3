package handler

import (
	"encoding/json"
	"net/http"
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
