package handler

import (
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	supa "github.com/supabase-community/supabase-go"
)

// AI Provider 설정 (D-064 PR 40).
//
// system_settings 테이블의 'assistant.providers' key 가 있으면 그 값을 우선 사용.
// 없거나 조회 실패하면 env (ASSISTANT_PROVIDER / ASSISTANT_MODEL / ASSISTANT_FALLBACK_PROVIDER /
// ASSISTANT_FALLBACK_MODEL) 폴백, env 도 비어있으면 hardcoded default.
//
// value 구조:
//   {
//     "primary":  { "provider": "openai",    "model": "qwen3.6-35b-a3b" },
//     "fallback": { "provider": "anthropic", "model": "glm-5.1" }
//   }
//
// 캐시: 60초 TTL — GUI 변경 후 최대 1분 이내 반영. 무거운 hot path 라 매번 DB 조회 회피.

type assistantProviderConfig struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

type assistantProvidersValue struct {
	Primary  *assistantProviderConfig `json:"primary,omitempty"`
	Fallback *assistantProviderConfig `json:"fallback,omitempty"`
}

var (
	assistantProvidersCache    *assistantProvidersValue
	assistantProvidersCachedAt time.Time
	assistantProvidersMu       sync.RWMutex
)

const assistantProvidersCacheTTL = 60 * time.Second

// loadAssistantProvidersFromDB — system_settings 의 'assistant.providers' value 조회.
// nil 반환 시 env 폴백.
func loadAssistantProvidersFromDB(db *supa.Client) *assistantProvidersValue {
	if db == nil {
		return nil
	}

	// 캐시 확인
	assistantProvidersMu.RLock()
	if assistantProvidersCache != nil && time.Since(assistantProvidersCachedAt) < assistantProvidersCacheTTL {
		v := assistantProvidersCache
		assistantProvidersMu.RUnlock()
		return v
	}
	assistantProvidersMu.RUnlock()

	// DB 조회
	data, _, err := db.From("system_settings").
		Select("value", "exact", false).
		Eq("key", "assistant.providers").
		Execute()
	if err != nil {
		log.Printf("[assistant providers] DB 조회 실패 — env 폴백: %v", err)
		return nil
	}

	var rows []struct {
		Value json.RawMessage `json:"value"`
	}
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		// 미설정 — env 폴백
		assistantProvidersMu.Lock()
		assistantProvidersCache = &assistantProvidersValue{}
		assistantProvidersCachedAt = time.Now()
		assistantProvidersMu.Unlock()
		return &assistantProvidersValue{}
	}

	var v assistantProvidersValue
	if err := json.Unmarshal(rows[0].Value, &v); err != nil {
		log.Printf("[assistant providers] value 디코딩 실패: %v", err)
		return nil
	}

	assistantProvidersMu.Lock()
	assistantProvidersCache = &v
	assistantProvidersCachedAt = time.Now()
	assistantProvidersMu.Unlock()
	return &v
}

// invalidateAssistantProvidersCache — system_settings.assistant.providers Upsert 직후 호출.
// 다음 요청부터 즉시 새 값 반영.
func invalidateAssistantProvidersCache() {
	assistantProvidersMu.Lock()
	assistantProvidersCache = nil
	assistantProvidersCachedAt = time.Time{}
	assistantProvidersMu.Unlock()
}

// resolvePrimaryProvider — DB → env → default 순서로 primary provider/model.
func resolvePrimaryProvider(db *supa.Client) (string, string) {
	v := loadAssistantProvidersFromDB(db)
	if v != nil && v.Primary != nil && v.Primary.Provider != "" {
		return strings.ToLower(strings.TrimSpace(v.Primary.Provider)), strings.TrimSpace(v.Primary.Model)
	}
	return "", ""
}

// resolveFallbackProvider — DB → env → "" 순서로 fallback provider/model.
// 빈 문자열 반환 시 env (ASSISTANT_FALLBACK_PROVIDER) 사용.
func resolveFallbackProvider(db *supa.Client) (string, string) {
	v := loadAssistantProvidersFromDB(db)
	if v != nil && v.Fallback != nil && v.Fallback.Provider != "" {
		return strings.ToLower(strings.TrimSpace(v.Fallback.Provider)), strings.TrimSpace(v.Fallback.Model)
	}
	return "", ""
}
