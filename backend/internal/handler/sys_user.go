package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/mail"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/response"

	supa "github.com/supabase-community/supabase-go"
)

// UserProfileResponse — /api/v1/users/me 응답 구조체
// 비유: "내 인사카드" — 로그인한 사용자의 프로필 정보
// 컬럼명은 실제 DB 기준 (D-055 참조)
type UserProfileResponse struct {
	UserID     string  `json:"user_id"`
	Email      string  `json:"email"`
	Name       string  `json:"name"`
	Role       string  `json:"role"`
	Department *string `json:"department"`
	Phone      *string `json:"phone"`
	AvatarURL  *string `json:"avatar_url"`
	IsActive   bool    `json:"is_active"`
}

// UserHandler — 사용자 관련 핸들러
type UserHandler struct {
	DB *supa.Client
}

// NewUserHandler — UserHandler 생성자
func NewUserHandler(db *supa.Client) *UserHandler {
	return &UserHandler{DB: db}
}

// GetMe — 현재 로그인한 사용자의 프로필 조회
// 비유: "사원증 스캔 후 내 인사카드 보기"
func (h *UserHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	// 비유: AuthMiddleware가 context에 넣어둔 사번(user_id)과 이메일을 꺼냄
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증이 필요합니다")
		return
	}
	email := middleware.GetUserEmail(r.Context())

	data, _, err := h.DB.From("user_profiles").
		Select("user_id, email, name, role, department, phone, avatar_url, is_active", "exact", false).
		Eq("user_id", userID).
		Execute()
	if err != nil {
		log.Printf("[users/me] user_profiles 조회 실패: id=%s, err=%v", userID, err)
		response.RespondError(w, http.StatusInternalServerError, "사용자 정보 조회에 실패했습니다")
		return
	}

	var profiles []UserProfileResponse
	if err := json.Unmarshal(data, &profiles); err != nil {
		log.Printf("[users/me] user_profiles 디코딩 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "사용자 정보 처리에 실패했습니다")
		return
	}

	if len(profiles) == 0 {
		// 비유: 인사카드가 없는 신입 → 자동 생성
		name := email
		if at := strings.Index(email, "@"); at > 0 {
			name = email[:at]
		}
		newProfile := userProfileInsert{
			UserID:   userID,
			Email:    email,
			Name:     name,
			Role:     "viewer",
			IsActive: true,
		}
		insertData, _, insertErr := h.DB.From("user_profiles").
			Insert(newProfile, false, "", "", "exact").
			Execute()
		if insertErr != nil {
			log.Printf("[users/me] auto-provision 실패: id=%s, err=%v", userID, insertErr)
			response.RespondError(w, http.StatusInternalServerError, "사용자 프로필 자동 생성에 실패했습니다")
			return
		}

		var created []UserProfileResponse
		if err := json.Unmarshal(insertData, &created); err != nil || len(created) == 0 {
			log.Printf("[users/me] auto-provision 응답 파싱 실패: %v", err)
			response.RespondError(w, http.StatusInternalServerError, "사용자 프로필 생성 후 조회에 실패했습니다")
			return
		}
		log.Printf("[users/me] auto-provision 완료: id=%s, email=%s", userID, email)
		response.RespondJSON(w, http.StatusOK, created[0])
		return
	}

	response.RespondJSON(w, http.StatusOK, profiles[0])
}

// validRoles — 허용된 역할 목록
var validRoles = map[string]bool{
	"admin": true, "operator": true, "executive": true, "manager": true, "viewer": true,
}

// CreateUserRequest — 관리자 사용자 생성 요청
// 비유: 새 사원 계정과 인사카드를 한 번에 발급하는 신청서
type CreateUserRequest struct {
	Email      string  `json:"email"`
	Password   string  `json:"password"`
	Name       string  `json:"name"`
	Role       string  `json:"role"`
	Department *string `json:"department"`
	IsActive   *bool   `json:"is_active"`
}

// ResetPasswordRequest — 관리자 임시 비밀번호 재설정 요청
// 비유: 비밀번호를 잊은 사원에게 임시 출입증을 다시 발급하는 신청서
type ResetPasswordRequest struct {
	Password string `json:"password"`
}

// UpdateProfileRequest — 사용자 정보 수정 요청 (이름·부서·전화)
type UpdateProfileRequest struct {
	Name       string  `json:"name"`
	Department *string `json:"department"`
	Phone      *string `json:"phone"`
}

// userProfileUpdate — user_profiles UPDATE payload (이름·부서·전화)
type userProfileUpdate struct {
	Name       string  `json:"name"`
	Department *string `json:"department"`
	Phone      *string `json:"phone"`
}

// authAdminUserResponse — Supabase Auth Admin 사용자 응답 중 필요한 필드
type authAdminUserResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

// createAuthUserPayload — Supabase Auth Admin 사용자 생성 payload
type createAuthUserPayload struct {
	Email        string `json:"email"`
	Password     string `json:"password"`
	EmailConfirm bool   `json:"email_confirm"`
}

// updateAuthUserPayload — Supabase Auth Admin 사용자 수정 payload
type updateAuthUserPayload struct {
	Password string `json:"password"`
}

// simpleStatusResponse — 단순 성공 응답
type simpleStatusResponse struct {
	Status string `json:"status"`
}

// userProfileInsert — user_profiles INSERT payload
type userProfileInsert struct {
	UserID     string  `json:"user_id"`
	Email      string  `json:"email"`
	Name       string  `json:"name"`
	Role       string  `json:"role"`
	Department *string `json:"department,omitempty"`
	IsActive   bool    `json:"is_active"`
}

// userListItem — ListUsers 응답 행
type userListItem struct {
	UserID     string  `json:"user_id"`
	Email      string  `json:"email"`
	Name       string  `json:"name"`
	Role       string  `json:"role"`
	Department *string `json:"department"`
	Phone      *string `json:"phone"`
	IsActive   bool    `json:"is_active"`
	CreatedAt  string  `json:"created_at"`
}

// userRoleUpdate — 역할 변경 UPDATE payload
type userRoleUpdate struct {
	Role string `json:"role"`
}

// userActiveUpdate — 활성화 변경 UPDATE payload
type userActiveUpdate struct {
	IsActive bool `json:"is_active"`
}

// statusOKResponse — 단순 상태 응답 ({"status":"ok"})
type statusOKResponse struct {
	Status string `json:"status"`
}

func requireAdmin(r *http.Request) bool {
	return middleware.GetUserRole(r.Context()) == "admin"
}

func validatePassword(password string) string {
	if utf8.RuneCountInString(password) < 8 {
		return "비밀번호는 8자 이상이어야 합니다"
	}
	return ""
}

func validateUserRole(role string) string {
	if !validRoles[role] {
		return "유효하지 않은 역할입니다"
	}
	return ""
}

func cleanOptionalText(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}

func authAdminConfig() (string, string, error) {
	url := strings.TrimRight(os.Getenv("SUPABASE_AUTH_ADMIN_URL"), "/")
	url = strings.TrimSuffix(url, "/auth/v1")
	if url == "" {
		if jwksURL := os.Getenv("SUPABASE_JWKS_URL"); strings.Contains(jwksURL, "/auth/v1/") {
			url = strings.SplitN(jwksURL, "/auth/v1/", 2)[0]
		}
	}
	if url == "" {
		url = strings.TrimRight(os.Getenv("SUPABASE_URL"), "/")
	}

	// 관리자 Auth API는 service_role 키만 사용 — anon 키(SUPABASE_KEY)로 fallback하면
	// /auth/v1/admin/* 호출이 권한 부족으로 실패하거나 의도치 않은 권한으로 동작할 수 있음.
	// 운영에서는 SUPABASE_SERVICE_ROLE_KEY를 반드시 별도로 등록해야 함.
	key := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	if url == "" || key == "" {
		return "", "", fmt.Errorf("Supabase 관리자 설정이 없습니다 (SUPABASE_SERVICE_ROLE_KEY 필수)")
	}
	return url, key, nil
}

func callAuthAdmin(method string, path string, payload interface{}) (authAdminUserResponse, int, string, error) {
	url, key, err := authAdminConfig()
	if err != nil {
		return authAdminUserResponse{}, http.StatusInternalServerError, err.Error(), err
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return authAdminUserResponse{}, http.StatusInternalServerError, "요청 생성에 실패했습니다", err
	}

	req, err := http.NewRequest(method, url+path, bytes.NewReader(body))
	if err != nil {
		return authAdminUserResponse{}, http.StatusInternalServerError, "인증 서버 요청 생성에 실패했습니다", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", key)
	req.Header.Set("Authorization", "Bearer "+key)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return authAdminUserResponse{}, http.StatusBadGateway, "인증 서버에 연결하지 못했습니다", err
	}
	defer resp.Body.Close()

	raw, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return authAdminUserResponse{}, http.StatusBadGateway, "인증 서버 응답을 읽지 못했습니다", readErr
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := "인증 서버 요청이 실패했습니다"
		var errBody struct {
			Message string `json:"message"`
			Error   string `json:"error"`
			Msg     string `json:"msg"`
		}
		if err := json.Unmarshal(raw, &errBody); err == nil {
			switch {
			case errBody.Message != "":
				message = errBody.Message
			case errBody.Error != "":
				message = errBody.Error
			case errBody.Msg != "":
				message = errBody.Msg
			}
		}
		return authAdminUserResponse{}, resp.StatusCode, message, fmt.Errorf("auth admin failed: status=%d", resp.StatusCode)
	}

	var user authAdminUserResponse
	if err := json.Unmarshal(raw, &user); err != nil {
		return authAdminUserResponse{}, http.StatusBadGateway, "인증 서버 응답 처리에 실패했습니다", err
	}
	return user, resp.StatusCode, "", nil
}

// ListUsers — 전체 사용자 목록 조회 (admin 전용)
func (h *UserHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(r) {
		response.RespondError(w, http.StatusForbidden, "관리자만 접근 가능합니다")
		return
	}

	data, _, err := h.DB.From("user_profiles").
		Select("user_id, email, name, role, department, phone, is_active, created_at", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[users] 목록 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "사용자 목록 조회에 실패했습니다")
		return
	}

	var users []userListItem
	if err := json.Unmarshal(data, &users); err != nil {
		log.Printf("[users] 목록 디코딩 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, users)
}

// CreateUser — 관리자 사용자 생성
func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(r) {
		response.RespondError(w, http.StatusForbidden, "관리자만 접근 가능합니다")
		return
	}

	var body CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.RespondError(w, http.StatusBadRequest, "요청 형식 오류")
		return
	}

	body.Email = strings.TrimSpace(strings.ToLower(body.Email))
	body.Name = strings.TrimSpace(body.Name)
	body.Role = strings.TrimSpace(body.Role)
	body.Department = cleanOptionalText(body.Department)

	if _, err := mail.ParseAddress(body.Email); err != nil {
		response.RespondError(w, http.StatusBadRequest, "유효한 이메일을 입력해 주세요")
		return
	}
	if msg := validatePassword(body.Password); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	if utf8.RuneCountInString(body.Name) < 2 || utf8.RuneCountInString(body.Name) > 50 {
		response.RespondError(w, http.StatusBadRequest, "이름은 2~50자로 입력해 주세요")
		return
	}
	if msg := validateUserRole(body.Role); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}

	authUser, status, message, err := callAuthAdmin(http.MethodPost, "/auth/v1/admin/users", createAuthUserPayload{
		Email:        body.Email,
		Password:     body.Password,
		EmailConfirm: true,
	})
	if err != nil {
		log.Printf("[users] auth 사용자 생성 실패: email=%s, status=%d, err=%v", body.Email, status, err)
		response.RespondError(w, status, message)
		return
	}
	if authUser.ID == "" {
		response.RespondError(w, http.StatusBadGateway, "인증 사용자 ID를 받지 못했습니다")
		return
	}

	profile := userProfileInsert{
		UserID:     authUser.ID,
		Email:      body.Email,
		Name:       body.Name,
		Role:       body.Role,
		Department: body.Department,
		IsActive:   isActive,
	}
	data, _, insertErr := h.DB.From("user_profiles").
		Insert(profile, false, "", "", "exact").
		Execute()
	if insertErr != nil {
		log.Printf("[users] user_profiles 생성 실패: id=%s, email=%s, err=%v", authUser.ID, body.Email, insertErr)
		response.RespondError(w, http.StatusInternalServerError, "인증 계정은 생성되었지만 SolarFlow 프로필 생성에 실패했습니다")
		return
	}

	var created []UserProfileResponse
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		log.Printf("[users] 생성 응답 파싱 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "사용자 생성 응답 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// ResetPassword — 관리자 임시 비밀번호 재설정
func (h *UserHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(r) {
		response.RespondError(w, http.StatusForbidden, "관리자만 접근 가능합니다")
		return
	}

	targetID := chi.URLParam(r, "id")
	if targetID == "" {
		response.RespondError(w, http.StatusBadRequest, "사용자를 선택해 주세요")
		return
	}

	var body ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.RespondError(w, http.StatusBadRequest, "요청 형식 오류")
		return
	}
	if msg := validatePassword(body.Password); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	_, status, message, err := callAuthAdmin(http.MethodPut, "/auth/v1/admin/users/"+targetID, updateAuthUserPayload{
		Password: body.Password,
	})
	if err != nil {
		log.Printf("[users] 비밀번호 재설정 실패: id=%s, status=%d, err=%v", targetID, status, err)
		response.RespondError(w, status, message)
		return
	}

	response.RespondJSON(w, http.StatusOK, simpleStatusResponse{Status: "ok"})
}

// UpdateRole — 사용자 역할 변경 (admin 전용)
func (h *UserHandler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(r) {
		response.RespondError(w, http.StatusForbidden, "관리자만 접근 가능합니다")
		return
	}

	targetID := chi.URLParam(r, "id")
	if middleware.GetUserID(r.Context()) == targetID {
		response.RespondError(w, http.StatusBadRequest, "본인의 역할은 변경할 수 없습니다")
		return
	}

	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !validRoles[body.Role] {
		response.RespondError(w, http.StatusBadRequest, "유효하지 않은 역할입니다")
		return
	}

	_, _, err := h.DB.From("user_profiles").
		Update(userRoleUpdate{Role: body.Role}, "", "exact").
		Eq("user_id", targetID).
		Execute()
	if err != nil {
		log.Printf("[users] 역할 변경 실패: id=%s, role=%s, err=%v", targetID, body.Role, err)
		response.RespondError(w, http.StatusInternalServerError, "역할 변경에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, statusOKResponse{Status: "ok"})
}

// UpdateProfile — 사용자 정보(이름·부서·전화) 수정 (admin 전용)
func (h *UserHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(r) {
		response.RespondError(w, http.StatusForbidden, "관리자만 접근 가능합니다")
		return
	}

	targetID := chi.URLParam(r, "id")
	if targetID == "" {
		response.RespondError(w, http.StatusBadRequest, "사용자를 선택해 주세요")
		return
	}

	var body UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.RespondError(w, http.StatusBadRequest, "요청 형식 오류")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if utf8.RuneCountInString(body.Name) < 2 || utf8.RuneCountInString(body.Name) > 50 {
		response.RespondError(w, http.StatusBadRequest, "이름은 2~50자로 입력해 주세요")
		return
	}

	payload := userProfileUpdate{
		Name:       body.Name,
		Department: cleanOptionalText(body.Department),
		Phone:      cleanOptionalText(body.Phone),
	}

	_, _, err := h.DB.From("user_profiles").
		Update(payload, "", "exact").
		Eq("user_id", targetID).
		Execute()
	if err != nil {
		log.Printf("[users] 정보 수정 실패: id=%s, err=%v", targetID, err)
		response.RespondError(w, http.StatusInternalServerError, "사용자 정보 수정에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, statusOKResponse{Status: "ok"})
}

// UpdateMyProfile — 본인 프로필(이름·부서·전화) 수정 (인증된 모든 사용자)
func (h *UserHandler) UpdateMyProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증이 필요합니다")
		return
	}

	var body UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.RespondError(w, http.StatusBadRequest, "요청 형식 오류")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if utf8.RuneCountInString(body.Name) < 2 || utf8.RuneCountInString(body.Name) > 50 {
		response.RespondError(w, http.StatusBadRequest, "이름은 2~50자로 입력해 주세요")
		return
	}

	payload := userProfileUpdate{
		Name:       body.Name,
		Department: cleanOptionalText(body.Department),
		Phone:      cleanOptionalText(body.Phone),
	}

	_, _, err := h.DB.From("user_profiles").
		Update(payload, "", "exact").
		Eq("user_id", userID).
		Execute()
	if err != nil {
		log.Printf("[users/me] 본인 정보 수정 실패: id=%s, err=%v", userID, err)
		response.RespondError(w, http.StatusInternalServerError, "프로필 저장에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, statusOKResponse{Status: "ok"})
}

// ChangeMyPasswordRequest — 본인 비밀번호 변경 요청
type ChangeMyPasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	Password        string `json:"password"`
}

// signInPayload — Supabase Auth password grant payload
type signInPayload struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// verifyCurrentPassword — Supabase /auth/v1/token?grant_type=password 호출로 현재 비밀번호 검증.
// 비유: 사원증 옆 "본인 확인용 비밀번호" 한 번 더 입력 — 세션 탈취 시 비번 변경까지 즉시 이어지지 않게 막음.
func verifyCurrentPassword(email, currentPassword string) (int, string, error) {
	supaURL := strings.TrimRight(os.Getenv("SUPABASE_URL"), "/")
	anonKey := os.Getenv("SUPABASE_KEY")
	if supaURL == "" || anonKey == "" {
		return http.StatusInternalServerError, "Supabase 설정이 없습니다", fmt.Errorf("SUPABASE_URL/SUPABASE_KEY missing")
	}

	body, err := json.Marshal(signInPayload{Email: email, Password: currentPassword})
	if err != nil {
		return http.StatusInternalServerError, "요청 생성에 실패했습니다", err
	}
	req, err := http.NewRequest(http.MethodPost, supaURL+"/auth/v1/token?grant_type=password", bytes.NewReader(body))
	if err != nil {
		return http.StatusInternalServerError, "인증 서버 요청 생성에 실패했습니다", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", anonKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return http.StatusBadGateway, "인증 서버에 연결하지 못했습니다", err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode == http.StatusOK {
		return http.StatusOK, "", nil
	}
	if resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusUnauthorized {
		return http.StatusUnauthorized, "현재 비밀번호가 일치하지 않습니다", fmt.Errorf("current password mismatch")
	}
	return http.StatusBadGateway, "인증 서버 응답이 비정상입니다", fmt.Errorf("auth signin status=%d", resp.StatusCode)
}

// ChangeMyPassword — 본인 비밀번호 변경 (인증된 모든 사용자)
// 현재 비밀번호 검증 후 신규 비밀번호로 업데이트.
func (h *UserHandler) ChangeMyPassword(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	email := middleware.GetUserEmail(r.Context())
	if userID == "" || email == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증이 필요합니다")
		return
	}

	var body ChangeMyPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.RespondError(w, http.StatusBadRequest, "요청 형식 오류")
		return
	}
	if body.CurrentPassword == "" {
		response.RespondError(w, http.StatusBadRequest, "현재 비밀번호를 입력해 주세요")
		return
	}
	if msg := validatePassword(body.Password); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	if status, message, err := verifyCurrentPassword(email, body.CurrentPassword); err != nil {
		log.Printf("[users/me] 현재 비밀번호 검증 실패: id=%s, status=%d, err=%v", userID, status, err)
		response.RespondError(w, status, message)
		return
	}

	_, status, message, err := callAuthAdmin(http.MethodPut, "/auth/v1/admin/users/"+userID, updateAuthUserPayload{
		Password: body.Password,
	})
	if err != nil {
		log.Printf("[users/me] 비밀번호 변경 실패: id=%s, status=%d, err=%v", userID, status, err)
		response.RespondError(w, status, message)
		return
	}
	response.RespondJSON(w, http.StatusOK, simpleStatusResponse{Status: "ok"})
}

// UpdateActive — 사용자 활성/비활성 변경 (admin 전용)
func (h *UserHandler) UpdateActive(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(r) {
		response.RespondError(w, http.StatusForbidden, "관리자만 접근 가능합니다")
		return
	}

	targetID := chi.URLParam(r, "id")
	if middleware.GetUserID(r.Context()) == targetID {
		response.RespondError(w, http.StatusBadRequest, "본인 계정은 비활성화할 수 없습니다")
		return
	}

	var body struct {
		IsActive bool `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.RespondError(w, http.StatusBadRequest, "요청 형식 오류")
		return
	}

	_, _, err := h.DB.From("user_profiles").
		Update(userActiveUpdate{IsActive: body.IsActive}, "", "exact").
		Eq("user_id", targetID).
		Execute()
	if err != nil {
		log.Printf("[users] 활성화 변경 실패: id=%s, err=%v", targetID, err)
		response.RespondError(w, http.StatusInternalServerError, "상태 변경에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, statusOKResponse{Status: "ok"})
}
