// po/rpc.go — PostgREST RPC helper 임시 복사본.
// 출처: backend/internal/handler/tx_rpc.go (handler 패키지에 그대로 유지 — dup).
// PR-D 에서 backend/internal/dbrpc 또는 handlerutil 로 통합.

package po

import (
	"strings"

	supa "github.com/supabase-community/supabase-go"
)

// callRPC — PostgREST RPC 를 Execute 경로로 호출해 HTTP/DB 에러를 Go error 로 받는다.
func callRPC(db *supa.Client, name string, body interface{}) error {
	_, _, err := db.From("rpc/"+name).
		Insert(body, false, "", "minimal", "").
		Execute()
	return err
}

func isRPCNotFound(err error) bool {
	return err != nil && strings.Contains(err.Error(), "P0002")
}
