package mount

import (
	"testing"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/feature"
)

func TestRegisterDuplicateIDPanics(t *testing.T) {
	defer Reset()
	Reset()

	Register(Spec{
		ID:    feature.IDMasterBank,
		Auth:  AuthAuthed,
		Mount: func(*Deps, chi.Router) {},
	})

	defer func() {
		if recover() == nil {
			t.Fatal("중복 FeatureID 등록인데 panic 없음")
		}
	}()
	Register(Spec{
		ID:    feature.IDMasterBank,
		Auth:  AuthAuthed,
		Mount: func(*Deps, chi.Router) {},
	})
}

func TestRegisterNilMountPanics(t *testing.T) {
	defer Reset()
	Reset()

	defer func() {
		if recover() == nil {
			t.Fatal("Mount=nil 인데 panic 없음")
		}
	}()
	Register(Spec{ID: feature.IDMasterBank, Auth: AuthAuthed})
}

func TestRegisterEmptyIDAllowsMultiple(t *testing.T) {
	defer Reset()
	Reset()

	noop := func(*Deps, chi.Router) {}
	Register(Spec{Auth: AuthRoot, Mount: noop})
	Register(Spec{Auth: AuthRoot, Mount: noop}) // 두 번째 등록도 통과해야 함

	if got := len(All()); got != 2 {
		t.Fatalf("빈 ID Spec 2개 등록 후 All() = %d, want 2", got)
	}
}

func TestMountGroupOnlyCallsMatchingAuth(t *testing.T) {
	defer Reset()
	Reset()

	calls := map[AuthMode]int{}
	for _, m := range []AuthMode{AuthAuthed, AuthPublicAPI, AuthRoot} {
		m := m
		Register(Spec{
			Auth: m,
			Mount: func(*Deps, chi.Router) {
				calls[m]++
			},
		})
	}

	r := chi.NewRouter()
	MountAuthed(&Deps{}, r)

	if calls[AuthAuthed] != 1 {
		t.Errorf("AuthAuthed 호출 = %d, want 1", calls[AuthAuthed])
	}
	if calls[AuthPublicAPI] != 0 || calls[AuthRoot] != 0 {
		t.Errorf("다른 그룹 호출됨: PublicAPI=%d Root=%d", calls[AuthPublicAPI], calls[AuthRoot])
	}
}

func TestHasEngineNil(t *testing.T) {
	if (&Deps{}).HasEngine() {
		t.Error("Engine=nil 인데 HasEngine() = true")
	}
	var d *Deps
	if d.HasEngine() {
		t.Error("nil 리시버인데 HasEngine() = true")
	}
}
