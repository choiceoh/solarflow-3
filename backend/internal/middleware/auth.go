package middleware

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/golang-jwt/jwt/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/response"
)

// jwksCache — Supabase JWKS 공개키 캐시 (서버 시작 시 1회 로드, 1시간마다 갱신)
var (
	jwksOnce sync.Once
	jwksFunc *keyfunc.JWKS
)

// getJWKS — Supabase JWKS 엔드포인트에서 공개키를 가져옴 (lazy init + 자동 갱신)
func getJWKS() *keyfunc.JWKS {
	jwksOnce.Do(func() {
		jwksURL := os.Getenv("SUPABASE_JWKS_URL")
		if jwksURL == "" {
			supaURL := os.Getenv("SUPABASE_URL")
			if supaURL != "" {
				jwksURL = strings.TrimRight(supaURL, "/") + "/auth/v1/.well-known/jwks.json"
			}
		}
		if jwksURL == "" {
			log.Printf("[인증 미들웨어] JWKS URL을 결정할 수 없습니다 (SUPABASE_JWKS_URL 또는 SUPABASE_URL 필요)")
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		opts := keyfunc.Options{
			Ctx:               ctx,
			RefreshInterval:   time.Hour,
			RefreshRateLimit:  5 * time.Minute,
			RefreshUnknownKID: true,
		}

		var err error
		jwksFunc, err = keyfunc.Get(jwksURL, opts)
		if err != nil {
			log.Printf("[인증 미들웨어] JWKS 로드 실패: %v", err)
			jwksFunc = nil
		} else {
			log.Printf("[인증 미들웨어] JWKS 로드 성공: %s", jwksURL)
		}
	})
	return jwksFunc
}

// UserProfile — user_profiles 테이블에서 조회한 사용자 프로필
// 비유: 사원 인사카드 — 역할, 활성 여부, 소속 앱이 적혀 있음
// 컬럼명은 실제 DB 기준 (D-055, D-108 참조)
type UserProfile struct {
	ID          string `json:"user_id"`
	Role        string `json:"role"`
	Email       string `json:"email"`
	IsActive    bool   `json:"is_active"`
	TenantScope string `json:"tenant_scope"`
}

// autoProvisionInsert — 신규 사용자 자동 프로비저닝 INSERT payload
// 신규 자동 생성은 항상 topsolar 스코프로 시작한다.
// 바로(주) 사용자는 admin이 user_profiles.tenant_scope을 'baro'로 명시 변경한다.
type autoProvisionInsert struct {
	UserID      string `json:"user_id"`
	Email       string `json:"email"`
	Name        string `json:"name"`
	Role        string `json:"role"`
	IsActive    bool   `json:"is_active"`
	TenantScope string `json:"tenant_scope"`
}

// AuthMiddleware — JWT 토큰을 검증하고 사용자 정보를 context에 저장하는 미들웨어
// 비유: 건물 출입 게이트 — 사원증(JWT)을 스캔하고, 인사카드를 확인한 뒤 통과시킴
func AuthMiddleware(db *supa.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if authenticateAmaranthRPA(r) {
				ctx := SetUserContext(r.Context(), "amaranth-rpa", "operator", "amaranth-rpa@solarflow.local", TenantScopeTopsolar, nil)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// 비유: 사원증(Authorization 헤더)을 꺼내 달라고 요청
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				response.RespondError(w, http.StatusUnauthorized, "인증이 필요합니다")
				return
			}

			// 비유: "Bearer {토큰}" 형식에서 토큰 부분만 분리
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				response.RespondError(w, http.StatusUnauthorized, "인증이 필요합니다")
				return
			}
			tokenString := parts[1]

			// 비유: JWT 서명 검증 — ES256(ECDSA) 우선, HMAC 폴백
			jwtSecret := os.Getenv("SUPABASE_JWT_SECRET")
			jwks := getJWKS()

			if jwtSecret == "" && jwks == nil {
				log.Printf("[인증 미들웨어] JWT 검증 수단 없음 (JWKS 실패 + SUPABASE_JWT_SECRET 미설정)")
				response.RespondError(w, http.StatusInternalServerError, "서버 인증 설정 오류입니다")
				return
			}

			token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
				switch token.Method.(type) {
				case *jwt.SigningMethodECDSA:
					// ES256: JWKS 공개키로 검증
					if jwks == nil {
						return nil, jwt.ErrSignatureInvalid
					}
					return jwks.Keyfunc(token)
				case *jwt.SigningMethodHMAC:
					// HMAC 폴백: JWT Secret으로 검증
					if jwtSecret == "" {
						return nil, jwt.ErrSignatureInvalid
					}
					return []byte(jwtSecret), nil
				default:
					return nil, jwt.ErrSignatureInvalid
				}
			})
			if err != nil || !token.Valid {
				// ES256 실패 시 HMAC 폴백 시도 (토큰 자체는 동일, 알고리즘만 다를 수 있음)
				if jwtSecret != "" {
					token, err = jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
						if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
							return nil, jwt.ErrSignatureInvalid
						}
						return []byte(jwtSecret), nil
					})
				}
				if err != nil || !token.Valid {
					response.RespondError(w, http.StatusUnauthorized, "유효하지 않은 토큰입니다")
					return
				}
			}

			// 비유: 사원증에서 사번(sub 클레임)을 읽음
			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				response.RespondError(w, http.StatusUnauthorized, "유효하지 않은 토큰입니다")
				return
			}

			userID, ok := claims["sub"].(string)
			if !ok || userID == "" {
				response.RespondError(w, http.StatusUnauthorized, "유효하지 않은 토큰입니다")
				return
			}

			// 비유: 이메일도 토큰에서 꺼냄 (Supabase JWT에 email 클레임 포함)
			// 신규 사용자 자동 프로비저닝(아래 INSERT)에서 사용되므로 누락 시 진단 로그 남김
			email, _ := claims["email"].(string)
			if email == "" {
				log.Printf("[인증 미들웨어] JWT에 email 클레임 누락 또는 비문자열: user_id=%s — 자동 프로비저닝 시 빈 email로 INSERT 시도됨", userID)
			}

			// 비유: 인사카드(user_profiles)에서 해당 사번의 역할, 활성 여부, 소속 앱 조회
			data, _, err := db.From("user_profiles").
				Select("user_id, role, email, is_active, tenant_scope", "exact", false).
				Eq("user_id", userID).
				Execute()
			if err != nil {
				log.Printf("[인증 미들웨어] user_profiles 조회 실패: %v", err)
				response.RespondError(w, http.StatusInternalServerError, "사용자 정보 조회에 실패했습니다")
				return
			}

			var profiles []UserProfile
			if err := json.Unmarshal(data, &profiles); err != nil {
				log.Printf("[인증 미들웨어] user_profiles 디코딩 실패: %v", err)
				response.RespondError(w, http.StatusInternalServerError, "사용자 정보 처리에 실패했습니다")
				return
			}

			var profile UserProfile
			if len(profiles) == 0 {
				// 비유: 사원증은 있지만 인사카드가 없는 신입 → 자동으로 인사카드 생성
				name := email
				if at := strings.Index(email, "@"); at > 0 {
					name = email[:at]
				}
				newProfile := autoProvisionInsert{
					UserID:      userID,
					Email:       email,
					Name:        name,
					Role:        "viewer",
					IsActive:    true,
					TenantScope: TenantScopeTopsolar,
				}
				insertData, _, insertErr := db.From("user_profiles").
					Insert(newProfile, false, "", "", "exact").
					Execute()
				if insertErr != nil {
					log.Printf("[인증 미들웨어] auto-provision 실패: id=%s, err=%v", userID, insertErr)
					response.RespondError(w, http.StatusInternalServerError, "사용자 프로필 자동 생성에 실패했습니다")
					return
				}

				var created []UserProfile
				if err := json.Unmarshal(insertData, &created); err != nil || len(created) == 0 {
					// INSERT 성공했지만 응답 파싱 실패 시 기본값 사용
					profile = UserProfile{ID: userID, Email: email, Role: "viewer", IsActive: true, TenantScope: TenantScopeTopsolar}
				} else {
					profile = created[0]
				}
				log.Printf("[인증 미들웨어] auto-provision 완료: id=%s, email=%s, role=viewer", userID, email)
			} else {
				profile = profiles[0]
			}

			// 비유: 인사카드에 "퇴사" 도장이 찍혀 있으면 출입 거부
			if !profile.IsActive {
				response.RespondError(w, http.StatusForbidden, "비활성화된 계정입니다")
				return
			}

			// 비유: 프로필에 이메일이 있으면 프로필 것을 우선 사용
			if profile.Email != "" {
				email = profile.Email
			}

			// 비유: 사원증에 역할, 이메일, 소속 앱, 허용 구역을 기록하고 통과시킴
			// allowed_modules는 Phase 확장 시 추가 (D-055)
			// tenant_scope이 비면 SetUserContext 내부에서 topsolar로 보정 (D-108)
			ctx := SetUserContext(r.Context(), userID, profile.Role, email, profile.TenantScope, nil)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func authenticateAmaranthRPA(r *http.Request) bool {
	expected := strings.TrimSpace(os.Getenv("SOLARFLOW_AMARANTH_RPA_TOKEN"))
	if expected == "" {
		return false
	}
	if !strings.HasPrefix(r.URL.Path, "/api/v1/export/amaranth/") {
		return false
	}

	presented := strings.TrimSpace(r.Header.Get("X-SolarFlow-RPA-Token"))
	if presented == "" || len(presented) != len(expected) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(presented), []byte(expected)) == 1
}

// RoleMiddleware — 특정 역할만 접근을 허용하는 미들웨어
// 비유: 특정 층의 출입문 — "임원 전용", "관리자 전용" 같은 제한
func RoleMiddleware(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role := GetUserRole(r.Context())

			for _, allowed := range allowedRoles {
				if role == allowed {
					next.ServeHTTP(w, r)
					return
				}
			}

			response.RespondError(w, http.StatusForbidden, "접근 권한이 없습니다")
		})
	}
}
