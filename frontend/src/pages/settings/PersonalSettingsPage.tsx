// 개인 설정 — 본인 프로필 + 비밀번호 변경 (모든 인증 역할)
import { useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_LABELS, type Role } from '@/config/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function PersonalSettingsPage() {
  const { user } = useAuth();
  const refreshAuth = useAuthStore((s) => s.initialize);

  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [profileDept, setProfileDept] = useState(user?.department ?? '');
  const [profilePhone, setProfilePhone] = useState(user?.phone ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  if (!user) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        프로필을 불러오는 중...
      </div>
    );
  }

  async function handleProfileSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    const name = profileName.trim();
    if (name.length < 2 || name.length > 50) {
      setProfileError('이름은 2~50자로 입력해 주세요.');
      return;
    }

    setProfileSaving(true);
    try {
      await fetchWithAuth('/api/v1/users/me', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          department: profileDept.trim() || null,
          phone: profilePhone.trim() || null,
        }),
      });
      setProfileSuccess('프로필을 저장했습니다.');
      await refreshAuth();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : '프로필 저장에 실패했습니다');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (!pwCurrent) {
      setPwError('현재 비밀번호를 입력해 주세요.');
      return;
    }
    if (pwNew.length < 8) {
      setPwError('새 비밀번호는 8자 이상으로 입력해 주세요.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('새 비밀번호와 확인이 일치하지 않습니다.');
      return;
    }

    setPwSaving(true);
    try {
      await fetchWithAuth('/api/v1/users/me/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: pwCurrent, password: pwNew }),
      });
      setPwSuccess('비밀번호를 변경했습니다.');
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : '비밀번호 변경에 실패했습니다');
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="sf-page">
      <div className="sf-page-header">
        <div>
          <div className="sf-eyebrow">PERSONAL</div>
          <h1 className="sf-page-title">개인 설정</h1>
          <p className="sf-page-description">본인 프로필과 비밀번호를 관리합니다.</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-lg border bg-card">
          <header className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-muted/30">
            <div>
              <h2 className="text-sm font-medium">내 프로필</h2>
              <p className="text-xs text-muted-foreground">{user.email} · {ROLE_LABELS[user.role as Role] ?? user.role}</p>
            </div>
          </header>
          <form onSubmit={handleProfileSave} className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="me-name">이름</Label>
              <Input
                id="me-name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="me-department">부서</Label>
                <Input
                  id="me-department"
                  value={profileDept}
                  onChange={(e) => setProfileDept(e.target.value)}
                  placeholder="선택"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="me-phone">전화번호</Label>
                <Input
                  id="me-phone"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  placeholder="010-0000-0000"
                />
              </div>
            </div>
            {profileError && <p className="text-sm text-destructive">{profileError}</p>}
            {profileSuccess && <p className="text-sm text-emerald-700">{profileSuccess}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-lg border bg-card">
          <header className="px-4 py-3 border-b bg-muted/30">
            <h2 className="text-sm font-medium">비밀번호 변경</h2>
            <p className="text-xs text-muted-foreground">8자 이상의 새 비밀번호를 입력하세요.</p>
          </header>
          <form onSubmit={handlePasswordChange} className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="me-pw-current">현재 비밀번호</Label>
              <Input
                id="me-pw-current"
                type="password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="me-pw-new">새 비밀번호</Label>
                <Input
                  id="me-pw-new"
                  type="password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="me-pw-confirm">새 비밀번호 확인</Label>
                <Input
                  id="me-pw-confirm"
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            </div>
            {pwError && <p className="text-sm text-destructive">{pwError}</p>}
            {pwSuccess && <p className="text-sm text-emerald-700">{pwSuccess}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={pwSaving}>
                {pwSaving ? '변경 중...' : '비밀번호 변경'}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
