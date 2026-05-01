package model

import (
	"strings"
	"testing"
)

func TestDispatchRouteCreate_OK(t *testing.T) {
	req := CreateDispatchRouteRequest{RouteDate: "2026-05-01"}
	if msg := req.Validate(); msg != "" {
		t.Fatalf("정상 요청 통과 기대, got: %s", msg)
	}
}

func TestDispatchRouteCreate_MissingDate(t *testing.T) {
	req := CreateDispatchRouteRequest{}
	if msg := req.Validate(); !strings.Contains(msg, "route_date") {
		t.Fatalf("route_date 누락 에러 기대, got: %s", msg)
	}
}

func TestDispatchRouteUpdate_BadStatus(t *testing.T) {
	bad := "shipped"
	req := UpdateDispatchRouteRequest{Status: &bad}
	if msg := req.Validate(); !strings.Contains(msg, "status") {
		t.Fatalf("잘못된 status 에러 기대, got: %s", msg)
	}
}

func TestDispatchRouteUpdate_OKStatus(t *testing.T) {
	ok := "dispatched"
	req := UpdateDispatchRouteRequest{Status: &ok}
	if msg := req.Validate(); msg != "" {
		t.Fatalf("정상 status 통과 기대, got: %s", msg)
	}
}
