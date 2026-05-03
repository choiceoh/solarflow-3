package handler

// AI 어시스턴트 — 메타 config 조회 도구 (Phase 3 ui_configs 테이블).
// AI는 화면/폼/상세 config를 읽고 설명할 수 있지만 변경 제안이나 저장은 수행하지 않는다.

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	supa "github.com/supabase-community/supabase-go"
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
			"properties": {
				"scope": {"type": "string", "enum": ["screen", "form", "detail"], "description": "메타 config 카테고리"},
				"config_id": {"type": "string", "description": "config id (예: 'partners', 'partner_form_v2')"}
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
					"note":      "ui_configs override 미존재 — frontend 는 코드 default config 사용 중. AI는 변경을 저장하지 않음.",
				})
				return string(out), nil
			}

			out, _ := json.Marshal(rows[0])
			return string(out), nil
		},
	}
}
