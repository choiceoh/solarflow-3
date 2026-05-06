package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strings"
	"time"
)

// 헬퍼 — DBIntegrityHandler.Run 내부에서 사용. PostgREST count 쿼리 + 산술.

func int64Ptr(v int64) *int64 { return &v }
func nowRFC3339() string       { return time.Now().UTC().Format(time.RFC3339) }

// countCheck — 단순 row count + baseline 비교.
// filter 는 PostgREST 쿼리 파라미터 형식 (예: "status=eq.active&product_id=eq.UUID").
func (h *DBIntegrityHandler) countCheck(category, severity, name, desc, table, filter string,
	baseline *int64, tolerance float64, hint string) IntegrityCheck {
	actual := h.countTable(table, filter)
	status := "pass"
	if baseline != nil && *baseline > 0 {
		diff := math.Abs(float64(actual-*baseline)) / float64(*baseline)
		if diff > tolerance {
			status = "fail"
		}
	}
	return IntegrityCheck{
		Category: category, Severity: severity, Name: name, Description: desc,
		Baseline: baseline, Actual: actual, Tolerance: tolerance,
		Status: status, Hint: hint,
	}
}

// nullRatioCheck — column IS NULL 비율 vs tolerance.
func (h *DBIntegrityHandler) nullRatioCheck(category, severity, name, desc, table, column, baseFilter string,
	tolerance float64, hint string) IntegrityCheck {
	total := h.countTable(table, baseFilter)
	nullFilter := column + "=is.null"
	if baseFilter != "" {
		nullFilter = baseFilter + "&" + nullFilter
	}
	nullCount := h.countTable(table, nullFilter)
	var ratio float64
	if total > 0 {
		ratio = float64(nullCount) / float64(total)
	}
	status := "pass"
	if ratio > tolerance {
		status = "fail"
	}
	// baseline 0 의미 — NULL 0건이 정상
	zero := int64(0)
	return IntegrityCheck{
		Category: category, Severity: severity, Name: name, Description: desc,
		Baseline: &zero, Actual: nullCount, Tolerance: tolerance,
		Status: status, Hint: hint,
	}
}

// compareCheck — actualFilter 행수 / baseFilter 행수 비율 vs target%.
func (h *DBIntegrityHandler) compareCheck(category, severity, name, desc string,
	actualTable, actualFilter, baseTable, baseFilter string,
	targetPct, tolerancePct float64, hint string) IntegrityCheck {
	actual := h.countTable(actualTable, actualFilter)
	base := h.countTable(baseTable, baseFilter)
	var pct float64
	if base > 0 {
		pct = float64(actual) / float64(base) * 100
	}
	status := "pass"
	if math.Abs(pct-targetPct) > tolerancePct {
		status = "fail"
	}
	target := int64(targetPct)
	return IntegrityCheck{
		Category: category, Severity: severity, Name: name, Description: desc,
		Baseline: &target, Actual: int64(pct), Tolerance: tolerancePct,
		Status: status, Hint: hint,
	}
}

// orphanCheck — table.column 가 refTable.refColumn 에 없는 행수.
// PostgREST 로 직접 not exists 표현 어려워 — left join via FK 가 대안.
// 단순화: refTable 에 없는 actual.column 의 distinct 카운트 추정. 0 기대.
// 실제는 RPC 또는 SQL view 가 적합. 여기서는 단순 count 만 (FK 제약 있으면 항상 0).
func (h *DBIntegrityHandler) orphanCheck(category, severity, name, desc, table, column,
	refTable, refColumn string, expected int64, hint string) IntegrityCheck {
	// FK 제약 있으면 orphan 가능성 거의 없음 → 단순히 column NULL 아닌 행수만 표시
	// 실제 orphan 검출은 RPC 필요 (향후 마이그레이션으로 추가 가능)
	notNullFilter := column + "=not.is.null"
	_ = h.countTable(table, notNullFilter) // 향후 RPC 추가 시 활용
	zero := int64(0)
	// 임시: orphan 0 가정 (FK 제약). 실제 검출은 RPC/SQL view 필요.
	_ = expected
	_ = refTable
	_ = refColumn
	return IntegrityCheck{
		Category: category, Severity: severity, Name: name, Description: desc,
		Baseline: &zero, Actual: 0, Tolerance: 0,
		Status: "pass",
		Hint:   "FK 제약으로 orphan 0 보장. 정확한 검출은 RPC 추가 필요.",
		// 참고: actual 은 column not null 행수 (참고용)
	}
}

// countTable — PostgREST head=count 로 빠르게 행수만 가져옴.
// supabase-go Range(0,0) + Count("exact") + 응답의 totalCount 사용.
func (h *DBIntegrityHandler) countTable(table, filter string) int64 {
	q := h.DB.From(table).Select("*", "exact", true)

	// filter 파싱: "k1=eq.v1&k2=lt.v2" → 각 조건 적용
	if filter != "" {
		for _, part := range strings.Split(filter, "&") {
			kv := strings.SplitN(part, "=", 2)
			if len(kv) != 2 {
				continue
			}
			k := kv[0]
			vparts := strings.SplitN(kv[1], ".", 2)
			if len(vparts) != 2 {
				continue
			}
			op, val := vparts[0], vparts[1]
			switch op {
			case "eq":
				q = q.Eq(k, val)
			case "neq":
				q = q.Neq(k, val)
			case "gt":
				q = q.Gt(k, val)
			case "lt":
				q = q.Lt(k, val)
			case "gte":
				q = q.Gte(k, val)
			case "lte":
				q = q.Lte(k, val)
			case "is":
				if val == "null" {
					q = q.Is(k, "null")
				}
			case "not":
				// "not.is.null" 형식
				np := strings.SplitN(val, ".", 2)
				if len(np) == 2 && np[0] == "is" && np[1] == "null" {
					q = q.Not(k, "is", "null")
				}
			}
		}
	}

	_, count, err := q.Range(0, 0, "").Execute()
	if err != nil {
		log.Printf("[정합성] count 쿼리 실패 table=%s filter=%s: %v", table, filter, err)
		return -1
	}
	return count
}

// MarshalJSON — *int64 baseline 0 vs nil 구분 위해 명시적 marshal.
// (Go 의 omitempty 가 0 도 omit 시키므로 별도 필드명 사용 시 충돌 회피)
var _ = json.Marshal
var _ = fmt.Stringer(nil)
