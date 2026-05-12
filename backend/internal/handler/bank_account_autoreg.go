package handler

import (
	"encoding/json"
	"log"
	"regexp"
	"strings"

	supa "github.com/supabase-community/supabase-go"
)

// 비유: "자유 입력 통장 메모를 마스터 카드로 옮겨 적는 사무원" — 수금 입력 시
// bank_account 자유 입력 ("신한 110-000-000000" 같은) 을 bank_accounts 마스터에
// 등록(또는 매칭)하고 account_id 를 반환한다.
//
// 파싱 규칙:
//   - 첫 비-숫자 토큰 = bank_name (예: "신한", "신한은행", "국민")
//   - 숫자+하이픈 패턴 시퀀스 중 가장 긴 것 = account_number
//   - 둘 다 추출 못 하면 nil 반환 (자동 등록 스킵, 호출자는 raw 만 저장)
//
// dedup 키:
//   - (company_id, normalized account_number) — 하이픈/공백 제거 후 비교
//
// 자동 등록 row 의 기본값:
//   - account_holder = 회사명 (수금 계좌니까 우리 회사가 예금주)
//   - currency = 'KRW'
//   - memo = '자동 등록 (수금 입력)' — 마스터 목록에서 한눈에 구분되도록

// 숫자 4자리 이상이 하이픈/공백으로 묶인 시퀀스. "110-123-456789" / "12345678" 같은 흔한 계좌 패턴.
var bankAccountNumberRe = regexp.MustCompile(`[0-9]+(?:[-\s][0-9]+){0,5}`)

// parseBankAccountFreeText — 자유 입력에서 (bank_name, account_number) 추출.
// 추출 실패 시 빈 문자열 반환 — 호출자가 자동 등록을 스킵해야 함.
func parseBankAccountFreeText(raw string) (bankName, accountNumber string) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", ""
	}
	loc := bankAccountNumberRe.FindStringIndex(s)
	if loc == nil {
		return "", ""
	}
	accountNumber = strings.TrimSpace(s[loc[0]:loc[1]])
	// 숫자 길이가 4 미만이면 계좌번호로 보기 어려움 (예: "1번", "3시").
	if digitsOnly(accountNumber) < 4 {
		return "", ""
	}
	bankName = strings.TrimSpace(s[:loc[0]])
	// 은행명 토큰 안 보이면 등록 스킵 — "은행 정보 없는 계좌" 마스터는 의미 없음.
	if bankName == "" {
		return "", ""
	}
	// 괄호나 콜론 같은 종결자는 잘라낸다 — "신한은행 ( ", "신한:" 같은 경우.
	if i := strings.IndexAny(bankName, "(:[/"); i >= 0 {
		bankName = strings.TrimSpace(bankName[:i])
	}
	if bankName == "" {
		return "", ""
	}
	return bankName, accountNumber
}

func digitsOnly(s string) int {
	n := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			n++
		}
	}
	return n
}

// normalizeAccountNumber — dedup 비교용 키. 하이픈·공백·기타 구분자 제거한 숫자만.
func normalizeAccountNumber(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

type companyNameRow struct {
	CompanyID   string `json:"company_id"`
	CompanyName string `json:"company_name"`
}

type bankAccountIDRow struct {
	AccountID     string `json:"account_id"`
	AccountNumber string `json:"account_number"`
}

// ensureBankAccountForCompany — 자유 입력 bank_account 문자열을 마스터에 매칭/자동 등록.
// 반환:
//   - accountID(uuid) — 매칭 성공 또는 신규 등록 성공
//   - nil — 파싱 실패 (호출자: raw 만 저장)
//   - error — DB 오류 (호출자: 로그만 남기고 raw 만 저장)
//
// 자동 등록 흐름이 receipts 등록을 망가뜨리지 않도록 모든 실패는 silent 로 처리하고
// nil 반환한다. 마스터 row 가 안 생겨도 receipts 자체는 raw 문자열로 보존된다.
func ensureBankAccountForCompany(db *supa.Client, companyID, rawBankAccount string) *string {
	if companyID == "" || rawBankAccount == "" {
		return nil
	}
	bankName, accountNumber := parseBankAccountFreeText(rawBankAccount)
	if bankName == "" || accountNumber == "" {
		return nil
	}
	normalized := normalizeAccountNumber(accountNumber)
	if normalized == "" {
		return nil
	}

	// 1) 기존 계좌 매칭 — 같은 회사의 모든 계좌를 가져와 정규화 비교.
	// (PostgREST 가 함수형 ilike 를 지원하지 않아 클라이언트 정규화 비교가 가장 안전.)
	data, _, err := db.From("bank_accounts").
		Select("account_id, account_number", "exact", false).
		Eq("company_id", companyID).
		Execute()
	if err != nil {
		log.Printf("[bank_account 자동등록] 마스터 조회 실패 company=%s: %v", companyID, err)
		return nil
	}
	var existing []bankAccountIDRow
	if err := json.Unmarshal(data, &existing); err == nil {
		for _, e := range existing {
			if normalizeAccountNumber(e.AccountNumber) == normalized {
				id := e.AccountID
				return &id
			}
		}
	}

	// 2) 신규 등록 — 회사명 = 예금주 기본값.
	holder := lookupCompanyName(db, companyID)
	if holder == "" {
		holder = "자동등록" // 회사 조회 실패해도 일단 NOT NULL 채워야 함.
	}

	payload := map[string]interface{}{
		"company_id":     companyID,
		"bank_name":      bankName,
		"account_number": accountNumber,
		"account_holder": holder,
		"currency":       "KRW",
		"is_default":     false,
		"is_active":      true,
		"memo":           "자동 등록 (수금 입력)",
	}
	insData, _, err := db.From("bank_accounts").Insert(payload, false, "", "", "").Execute()
	if err != nil {
		// UNIQUE 충돌 가능성 — 동시성 race. 한 번 더 조회로 회수 시도.
		log.Printf("[bank_account 자동등록] INSERT 실패 (race?) bank=%q acct=%q: %v", bankName, accountNumber, err)
		again, _, e2 := db.From("bank_accounts").
			Select("account_id, account_number", "exact", false).
			Eq("company_id", companyID).
			Eq("bank_name", bankName).
			Eq("account_number", accountNumber).
			Execute()
		if e2 == nil {
			var rows []bankAccountIDRow
			if err := json.Unmarshal(again, &rows); err == nil && len(rows) > 0 {
				id := rows[0].AccountID
				return &id
			}
		}
		return nil
	}
	var created []bankAccountIDRow
	if err := json.Unmarshal(insData, &created); err != nil || len(created) == 0 {
		log.Printf("[bank_account 자동등록] INSERT 결과 디코딩 실패: %v", err)
		return nil
	}
	id := created[0].AccountID
	log.Printf("[bank_account 자동등록] 신규 등록 company=%s bank=%s acct=%s id=%s",
		companyID, bankName, accountNumber, id)
	return &id
}

func lookupCompanyName(db *supa.Client, companyID string) string {
	data, _, err := db.From("companies").
		Select("company_id, company_name", "exact", false).
		Eq("company_id", companyID).
		Execute()
	if err != nil {
		return ""
	}
	var rows []companyNameRow
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return ""
	}
	return rows[0].CompanyName
}
