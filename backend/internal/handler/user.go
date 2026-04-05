package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/response"
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
		newProfile := map[string]interface{}{
			"user_id":   userID,
			"email":     email,
			"name":      name,
			"role":      "viewer",
			"is_active": true,
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
