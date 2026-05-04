package handler

// AI 어시스턴트 — 메타 config 편집 도구 (Phase 3 ui_configs 테이블).
// 운영자(전무 등 admin)가 자연어로 "거래처 화면 컬럼 순서 바꿔줘" 와 같은 변경을 요청하면
// LLM 이 read_ui_config 로 현재 상태를 조회한 뒤 propose_ui_config_update 로 통째 교체를
// 제안한다. 사용자가 [저장] 카드에서 승인해야 ui_configs 에 반영된다.
//
// 통째 교체 정책:
//   sys_ui_config.go 의 PUT /api/v1/ui-configs/{scope}/{config_id} 와 동일하게
//   config 객체를 그대로 upsert. 부분 patch (RFC 7396) 머지는 1차 PR 에서 도입 안 함.

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
)

type readUIConfigInput struct {
	Scope    string `json:"scope"`
	ConfigID string `json:"config_id"`
}

func toolReadUIConfig() assistantTool {
	return assistantTool{
		name:        "read_ui_config",
		description: "운영자 GUI 메타 편집기의 ui_configs 테이블에서 화면/폼/상세 config 의 override 단건 조회. (scope, config_id) 한 쌍으로 단일 행. scope 는 'screen'|'form'|'detail'. override 가 없으면 빈 결과 — frontend 가 코드 default 로 폴백 중임을 의미.",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"scope": {"type": "string", "enum": ["screen", "form", "detail"], "description": "메타 config 카테고리"},
				"config_id": {"type": "string", "description": "config id (예: 'partners', 'partner_form_v2'). 현재 화면의 config_id 가 시스템 프롬프트의 [현재 화면] 섹션에 있으면 그것을 사용"}
			},
			"required": ["scope", "config_id"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin") },
		execute: func(ctx context.Context, db *supa.Client, input json.RawMessage) (string, error) {
			var args readUIConfigInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			args.Scope = strings.TrimSpace(args.Scope)
			args.ConfigID = strings.TrimSpace(args.ConfigID)
			if !validScope(args.Scope) {
				return "", fmt.Errorf("scope 는 'screen'|'form'|'detail' 중 하나여야 합니다 (받음: %q)", args.Scope)
			}
			if args.ConfigID == "" {
				return "", fmt.Errorf("config_id 는 필수입니다")
			}

			data, _, err := db.From("ui_configs").
				Select("scope,config_id,config,updated_at,updated_by", "exact", false).
				Eq("scope", args.Scope).
				Eq("config_id", args.ConfigID).
				Execute()
			if err != nil {
				return "", fmt.Errorf("ui_configs 조회 실패: %w", err)
			}

			var rows []map[string]interface{}
			if err := json.Unmarshal(data, &rows); err != nil {
				return "", fmt.Errorf("ui_configs 디코딩 실패: %w", err)
			}

			if len(rows) == 0 {
				out, _ := json.Marshal(map[string]interface{}{
					"scope":     args.Scope,
					"config_id": args.ConfigID,
					"override":  nil,
					"note":      "ui_configs override 미존재 — frontend 는 코드 default config 사용 중. propose_ui_config_update 로 첫 override 를 만들 수 있음.",
				})
				return string(out), nil
			}

			out, _ := json.Marshal(rows[0])
			return string(out), nil
		},
	}
}

type proposeUIConfigUpdateInput struct {
	Scope    string                 `json:"scope"`
	ConfigID string                 `json:"config_id"`
	Config   map[string]interface{} `json:"config"`
	Summary  string                 `json:"summary"`
}

func toolProposeUIConfigUpdate() assistantTool {
	return assistantTool{
		name:        "propose_ui_config_update",
		description: "화면/폼/상세 메타 config 를 통째로 교체하는 제안. 즉시 적용되지 않고 사용자 [저장] 시 ui_configs 에 반영 — 모든 사용자에게 즉시 영향. config 는 *전체* 객체를 보내야 함 (부분 patch 안 됨) — 먼저 read_ui_config 로 현재 값 조회한 후 원하는 부분만 수정해서 보내세요. summary 는 사용자 카드에 표시될 한 줄 한국어 요약 (예: '거래처 화면 컬럼 순서 변경: 거래처명 → 메모 순').",
		inputSchema: json.RawMessage(`{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"scope": {"type": "string", "enum": ["screen", "form", "detail"], "description": "메타 config 카테고리"},
				"config_id": {"type": "string", "description": "config id (예: 'partners')"},
				"config": {"type": "object", "description": "교체할 *전체* config 객체. 코드 default 또는 read_ui_config 결과를 기반으로 수정한 결과."},
				"summary": {"type": "string", "description": "사용자 카드에 표시될 한 줄 한국어 요약"}
			},
			"required": ["scope", "config_id", "config", "summary"]
		}`),
		allow: func(ctx context.Context) bool { return roleIn(ctx, "admin") },
		execute: func(ctx context.Context, _ *supa.Client, input json.RawMessage) (string, error) {
			userID := middleware.GetUserID(ctx)
			if userID == "" {
				return "", fmt.Errorf("인증 정보 없음")
			}

			var args proposeUIConfigUpdateInput
			if err := json.Unmarshal(input, &args); err != nil {
				return "", fmt.Errorf("입력 파싱 실패: %w", err)
			}
			args.Scope = strings.TrimSpace(args.Scope)
			args.ConfigID = strings.TrimSpace(args.ConfigID)
			args.Summary = strings.TrimSpace(args.Summary)

			if !validScope(args.Scope) {
				return "", fmt.Errorf("scope 는 'screen'|'form'|'detail' 중 하나여야 합니다 (받음: %q)", args.Scope)
			}
			if args.ConfigID == "" {
				return "", fmt.Errorf("config_id 는 필수입니다")
			}
			if len(args.Config) == 0 {
				return "", fmt.Errorf("config 객체는 비어있을 수 없습니다")
			}
			if args.Summary == "" {
				return "", fmt.Errorf("summary 는 필수입니다 (사용자 카드 표시용)")
			}
			// 본문 id 와 config_id 일치 강제 (sys_ui_config.go Upsert 와 동일 정책)
			if bodyID, ok := args.Config["id"].(string); ok && bodyID != args.ConfigID {
				return "", fmt.Errorf("config 본문의 id (%q) 가 config_id (%q) 와 일치하지 않습니다", bodyID, args.ConfigID)
			}

			payload, err := json.Marshal(args)
			if err != nil {
				return "", fmt.Errorf("페이로드 직렬화 실패: %w", err)
			}

			id := uuid.NewString()
			now := time.Now()
			p := &assistantProposal{
				ID:        id,
				UserID:    userID,
				Kind:      "propose_ui_config_update",
				Summary:   args.Summary,
				Payload:   payload,
				CreatedAt: now,
				ExpiresAt: now.Add(proposalTTL),
			}
			globalProposalStore.put(p)

			if c := proposalCollectorFrom(ctx); c != nil {
				c.add(proposalSummary{
					ID: id, Kind: p.Kind, Summary: args.Summary, Payload: payload,
				})
			}

			log.Printf("[assistant write/propose] role=%s user=%s kind=propose_ui_config_update id=%s scope=%s config_id=%s",
				middleware.GetUserRole(ctx), userID, id, args.Scope, args.ConfigID)

			return fmt.Sprintf(
				"메타 config 변경 제안이 생성되었습니다(id=%s, 30분 내 확인 필요). 사용자가 우측 카드에서 [저장]을 눌러야 ui_configs 에 반영되며, 그 즉시 모든 사용자 화면에 적용됩니다. 사용자에게 변경 요지(%s)를 한 번 더 확인해달라고 안내하세요.",
				id, args.Summary,
			), nil
		},
	}
}
