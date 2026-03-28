#!/bin/bash
# ============================================================
# SolarFlow 3.0 — Step 2: Go 백엔드 프로젝트 구조 셋업
# 터미널 1에서 실행: bash setup_step2.sh
# ============================================================

set -e  # 에러 발생 시 즉시 중단

BACKEND_DIR=~/solarflow-3/backend
cd "$BACKEND_DIR"

echo "🔧 Step 2 시작: Go 백엔드 프로젝트 구조 만들기"
echo "================================================"

# ── 1. 폴더 구조 생성 ──
echo "📁 폴더 생성 중..."
mkdir -p internal/config
mkdir -p internal/router
mkdir -p internal/middleware
mkdir -p internal/handler

# ── 2. config/config.go — 환경변수 + Supabase 설정 ──
echo "📄 config.go 생성..."
cat > internal/config/config.go << 'GOEOF'
package config

import (
	"log"
	"os"
)

// Config는 앱 전체 설정을 담는 구조체
// 비유: 건물의 관리사무소 — 모든 설정 정보가 여기에
type Config struct {
	Port        string
	SupabaseURL string
	SupabaseKey string
}

// Load는 환경변수에서 설정을 읽어옴
func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	supabaseURL := os.Getenv("SUPABASE_URL")
	supabaseKey := os.Getenv("SUPABASE_KEY")

	if supabaseURL == "" || supabaseKey == "" {
		log.Println("⚠️  SUPABASE_URL 또는 SUPABASE_KEY가 설정되지 않았습니다")
	}

	return &Config{
		Port:        port,
		SupabaseURL: supabaseURL,
		SupabaseKey: supabaseKey,
	}
}
GOEOF

# ── 3. middleware/cors.go — CORS 미들웨어 ──
echo "📄 cors.go 생성..."
cat > internal/middleware/cors.go << 'GOEOF'
package middleware

import "net/http"

// CORS는 브라우저의 보안 정책을 처리하는 미들웨어
// 비유: 건물 현관의 보안 게이트 — "이 사람 들어와도 되나요?" 확인
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// OPTIONS = 브라우저가 "이 요청 보내도 돼?" 하고 미리 물어보는 것
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
GOEOF

# ── 4. handler/health.go — 헬스체크 핸들러 ──
echo "📄 health.go 생성..."
cat > internal/handler/health.go << 'GOEOF'
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
GOEOF

# ── 5. handler/company.go — 법인 CRUD 핸들러 ──
echo "📄 company.go 생성..."
cat > internal/handler/company.go << 'GOEOF'
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"
)

// CompanyHandler는 법인(companies) 관련 API를 처리
// 비유: "법인 관리실" — 탑솔라, 디원, 화신 정보를 관리하는 방
type CompanyHandler struct {
	DB *supa.Client
}

// NewCompanyHandler 생성자
func NewCompanyHandler(db *supa.Client) *CompanyHandler {
	return &CompanyHandler{DB: db}
}

// List — GET /api/v1/companies — 법인 목록 조회
func (h *CompanyHandler) List(w http.ResponseWriter, r *http.Request) {
	var result []map[string]interface{}
	data, _, err := h.DB.From("companies").
		Select("*", "exact", false).
		Execute()

	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	json.Unmarshal(data, &result)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetByID — GET /api/v1/companies/{id} — 법인 상세 조회
func (h *CompanyHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var result []map[string]interface{}
	data, _, err := h.DB.From("companies").
		Select("*", "exact", false).
		Eq("company_id", id).
		Execute()

	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	json.Unmarshal(data, &result)
	if len(result) == 0 {
		http.Error(w, `{"error":"법인을 찾을 수 없습니다"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result[0])
}

// Create — POST /api/v1/companies — 법인 등록
func (h *CompanyHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"잘못된 요청입니다"}`, http.StatusBadRequest)
		return
	}

	data, _, err := h.DB.From("companies").
		Insert(body, false, "", "", "").
		Execute()

	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	var result []map[string]interface{}
	json.Unmarshal(data, &result)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if len(result) > 0 {
		json.NewEncoder(w).Encode(result[0])
	}
}

// Update — PUT /api/v1/companies/{id} — 법인 수정
func (h *CompanyHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"잘못된 요청입니다"}`, http.StatusBadRequest)
		return
	}

	data, _, err := h.DB.From("companies").
		Update(body, "", "").
		Eq("company_id", id).
		Execute()

	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	var result []map[string]interface{}
	json.Unmarshal(data, &result)

	w.Header().Set("Content-Type", "application/json")
	if len(result) > 0 {
		json.NewEncoder(w).Encode(result[0])
	}
}

// ToggleStatus — PATCH /api/v1/companies/{id}/status — 활성/비활성 토글
func (h *CompanyHandler) ToggleStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"잘못된 요청입니다"}`, http.StatusBadRequest)
		return
	}

	data, _, err := h.DB.From("companies").
		Update(map[string]interface{}{"is_active": body["is_active"]}, "", "").
		Eq("company_id", id).
		Execute()

	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	var result []map[string]interface{}
	json.Unmarshal(data, &result)

	w.Header().Set("Content-Type", "application/json")
	if len(result) > 0 {
		json.NewEncoder(w).Encode(result[0])
	}
}
GOEOF

# ── 6. handler/manufacturer.go — 제조사 CRUD 핸들러 ──
echo "📄 manufacturer.go 생성..."
cat > internal/handler/manufacturer.go << 'GOEOF'
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"
)

// ManufacturerHandler는 제조사(manufacturers) 관련 API를 처리
type ManufacturerHandler struct {
	DB *supa.Client
}

func NewManufacturerHandler(db *supa.Client) *ManufacturerHandler {
	return &ManufacturerHandler{DB: db}
}

func (h *ManufacturerHandler) List(w http.ResponseWriter, r *http.Request) {
	var result []map[string]interface{}
	data, _, err := h.DB.From("manufacturers").
		Select("*", "exact", false).
		Execute()

	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	json.Unmarshal(data, &result)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *ManufacturerHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var result []map[string]interface{}
	data, _, err := h.DB.From("manufacturers").
		Select("*", "exact", false).
		Eq("manufacturer_id", id).
		Execute()

	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	json.Unmarshal(data, &result)
	if len(result) == 0 {
		http.Error(w, `{"error":"제조사를 찾을 수 없습니다"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result[0])
}

func (h *ManufacturerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"잘못된 요청입니다"}`, http.StatusBadRequest)
		return
	}

	data, _, err := h.DB.From("manufacturers").
		Insert(body, false, "", "", "").
		Execute()

	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	var result []map[string]interface{}
	json.Unmarshal(data, &result)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if len(result) > 0 {
		json.NewEncoder(w).Encode(result[0])
	}
}

func (h *ManufacturerHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"잘못된 요청입니다"}`, http.StatusBadRequest)
		return
	}

	data, _, err := h.DB.From("manufacturers").
		Update(body, "", "").
		Eq("manufacturer_id", id).
		Execute()

	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	var result []map[string]interface{}
	json.Unmarshal(data, &result)

	w.Header().Set("Content-Type", "application/json")
	if len(result) > 0 {
		json.NewEncoder(w).Encode(result[0])
	}
}
GOEOF

# ── 7. router/router.go — chi 라우터 설정 ──
echo "📄 router.go 생성..."
cat > internal/router/router.go << 'GOEOF'
package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/handler"
	"solarflow-backend/internal/middleware"

	supa "github.com/supabase-community/supabase-go"
)

// New는 전체 라우터를 생성하고 모든 경로를 등록
// 비유: 건물 안내판 — 어떤 요청이 어느 방으로 가는지 정해줌
func New(db *supa.Client) http.Handler {
	r := chi.NewRouter()

	// ── 미들웨어 (현관 보안 게이트) ──
	r.Use(middleware.CORS)

	// ── 헬스체크 ──
	r.Get("/health", handler.HealthCheck)

	// ── API v1 ──
	r.Route("/api/v1", func(r chi.Router) {

		// 법인 관리
		companyH := handler.NewCompanyHandler(db)
		r.Route("/companies", func(r chi.Router) {
			r.Get("/", companyH.List)             // GET    /api/v1/companies
			r.Post("/", companyH.Create)           // POST   /api/v1/companies
			r.Get("/{id}", companyH.GetByID)       // GET    /api/v1/companies/{id}
			r.Put("/{id}", companyH.Update)        // PUT    /api/v1/companies/{id}
			r.Patch("/{id}/status", companyH.ToggleStatus) // PATCH  /api/v1/companies/{id}/status
		})

		// 제조사 관리
		mfgH := handler.NewManufacturerHandler(db)
		r.Route("/manufacturers", func(r chi.Router) {
			r.Get("/", mfgH.List)
			r.Post("/", mfgH.Create)
			r.Get("/{id}", mfgH.GetByID)
			r.Put("/{id}", mfgH.Update)
		})

		// TODO: Step 3에서 추가
		// r.Route("/products", ...)
		// r.Route("/partners", ...)
		// r.Route("/warehouses", ...)
		// r.Route("/banks", ...)
	})

	return r
}
GOEOF

# ── 8. main.go 교체 ──
echo "📄 main.go 교체..."
cat > main.go << 'GOEOF'
package main

import (
	"log"
	"net/http"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/config"
	"solarflow-backend/internal/router"
)

func main() {
	// 설정 로드
	cfg := config.Load()

	// Supabase 연결
	db, err := supa.NewClient(cfg.SupabaseURL, cfg.SupabaseKey, &supa.ClientOptions{})
	if err != nil {
		log.Fatalf("❌ Supabase 연결 실패: %v", err)
	}
	log.Println("✅ Supabase 연결 성공")

	// 라우터 생성 (모든 API 경로가 여기서 등록됨)
	r := router.New(db)

	// 서버 시작
	log.Printf("🚀 서버 시작: :%s", cfg.Port)
	log.Printf("📋 API 목록:")
	log.Printf("   GET  /health")
	log.Printf("   GET  /api/v1/companies")
	log.Printf("   POST /api/v1/companies")
	log.Printf("   GET  /api/v1/companies/{id}")
	log.Printf("   PUT  /api/v1/companies/{id}")
	log.Printf("   GET  /api/v1/manufacturers")
	log.Printf("   POST /api/v1/manufacturers")

	log.Fatal(http.ListenAndServe(":"+cfg.Port, r))
}
GOEOF

# ── 9. chi 설치 ──
echo "📦 chi 라우터 설치..."
go get github.com/go-chi/chi/v5

# ── 10. 모듈 정리 ──
echo "📦 go mod tidy..."
go mod tidy

# ── 11. 빌드 테스트 ──
echo "🔨 빌드 테스트..."
if go build -o /dev/null .; then
    echo ""
    echo "================================================"
    echo "✅ Step 2 완료! 빌드 성공!"
    echo "================================================"
    echo ""
    echo "📁 프로젝트 구조:"
    find . -name "*.go" | sort | head -20
    echo ""
    echo "다음: 터미널에서 이 명령어로 커밋하세요:"
    echo '  git add -A'
    echo '  git commit -m "feat: Step 2 — chi 라우터 + 마스터 CRUD 구조"'
    echo '  git push origin main'
else
    echo ""
    echo "❌ 빌드 실패 — 에러 메시지를 Claude에게 보내주세요"
fi
