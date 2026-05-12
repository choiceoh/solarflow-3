// Package rpcutil — PostgREST RPC helper.
//
// PR-D1 에서 분리: 이전엔 backend/internal/handler/tx_rpc.go +
// PR-B 의 po/rpc.go dup. 본 패키지로 통합.
package rpcutil

import (
	"strings"

	supa "github.com/supabase-community/supabase-go"
)

// CallRPC — PostgREST RPC 를 Execute 경로로 호출해 HTTP/DB 에러를 Go error 로 받는다.
func CallRPC(db *supa.Client, name string, body interface{}) error {
	_, _, err := db.From("rpc/"+name).
		Insert(body, false, "", "minimal", "").
		Execute()
	return err
}

// IsRPCNotFound — PostgREST 의 "function not found" 에러 (P0002) 인지.
func IsRPCNotFound(err error) bool {
	return err != nil && strings.Contains(err.Error(), "P0002")
}
