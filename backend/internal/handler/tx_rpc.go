package handler

import (
	"strings"

	supa "github.com/supabase-community/supabase-go"
)

// callRPC — PostgREST RPC를 Execute 경로로 호출해 HTTP/DB 에러를 Go error로 받는다.
func callRPC(db *supa.Client, name string, body interface{}) error {
	_, _, err := db.From("rpc/"+name).
		Insert(body, false, "", "minimal", "").
		Execute()
	return err
}

func isRPCNotFound(err error) bool {
	return err != nil && strings.Contains(err.Error(), "P0002")
}
