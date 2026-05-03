// 개인 설정 — 본인 프로필 + 표시 단위 + 비밀번호 변경 (모든 인증 역할)
import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { ROLE_LABELS, type Role } from '@/config/permissions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { formatKRW, formatCapacity } from '@/lib/utils';
import {
  DEFAULT_PREFERENCES,
  type AmountUnit,
  type CapacityUnit,
  type UserPreferences,
} from '@/types/models';

const AMOUNT_OPTIONS: { value: AmountUnit; label: string }[] = [
  { value: 'auto', label: '자동 (금액 크기에 따라)' },
  { value: 'won', label: '원' },
  { value: 'thousand', label: '천원' },
  { value: 'manwon', label: '만원' },
  { value: 'million', label: '백만원' },
  { value: 'eok', label: '억원' },
];

const CAPACITY_OPTIONS: { value: CapacityUnit; label: string }[] = [
  { value: 'auto', label: '자동 (1MW 기준)' },
  { value: 'kw', label: 'kW 고정' },
  { value: 'mw', label: 'MW 고정' },
];

const PREVIEW_AMOUNTS = [5_000, 12_345_678, 150_000_000];
const PREVIEW_CAPACITIES: { kw: number; ea: number }[] = [
  { kw: 750, ea: 1_200 },
  { kw: 1_500, ea: 2_500 },
];

export default function PersonalSettingsPage() {
  const { user } = useAuth();
  const refreshAuth = useAuthStore((s) => s.initialize);
  const storedPrefs = usePreferencesStore((s) => s.prefs);
  const setStorePrefs = usePreferencesStore((s) => s.setPrefs);

  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [profileDept, setProfileDept] = useState(user?.department ?? '');
  const [profilePhone, setProfilePhone] = useState(user?.phone ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [draftPrefs, setDraftPrefs] = useState<UserPreferences>(storedPrefs);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsError, setPrefsError] = useState('');
  const [prefsSuccess, setPrefsSuccess] = useState('');

  // user.preferences가 비동기로 늦게 도착하면 초기 draftPrefs(=defaults)를 덮어씀.
  // 사용자가 편집 중이어도 store가 외부에서 바뀌면 동기화 (외부 변경 자체가 거의 없음).
  useEffect(() => {
    setDraftPrefs(storedPrefs);
  }, [storedPrefs]);

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

  async function handlePrefsSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPrefsError('');
    setPrefsSuccess('');
    setPrefsSaving(true);
    try {
      await fetchWithAuth('/api/v1/users/me/preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferences: draftPrefs }),
      });
      setStorePrefs(draftPrefs);
      setPrefsSuccess('표시 단위 설정을 저장했습니다. 다른 화면 진입 시 적용됩니다.');
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : '표시 단위 저장에 실패했습니다');
    } finally {
      setPrefsSaving(false);
    }
  }

  function handlePrefsReset() {
    setDraftPrefs(DEFAULT_PREFERENCES);
    setPrefsError('');
    setPrefsSuccess('');
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

      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-lg border bg-card">
          <header className="flex items-center justify-between gap-3 px-5 py-4 border-b bg-muted/30">
            <div>
              <h2 className="text-base font-semibold">내 프로필</h2>
              <p className="text-sm text-muted-foreground">{user.email} · {ROLE_LABELS[user.role as Role] ?? user.role}</p>
            </div>
          </header>
          <form onSubmit={handleProfileSave} className="p-5 space-y-4">
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
          <header className="px-5 py-4 border-b bg-muted/30">
            <h2 className="text-base font-semibold">표시 단위</h2>
            <p className="text-sm text-muted-foreground">금액·용량 표시 방식을 선택합니다. 입력 필드는 항상 원/EA 단위입니다.</p>
          </header>
          <form onSubmit={handlePrefsSave} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pref-amount">금액 단위</Label>
                <Select
                  value={draftPrefs.amount_unit}
                  onValueChange={(v) => v && setDraftPrefs((p) => ({ ...p, amount_unit: v as AmountUnit }))}
                >
                  <SelectTrigger id="pref-amount">
                    <span className="flex flex-1 text-left truncate" data-slot="select-value">
                      {AMOUNT_OPTIONS.find((o) => o.value === draftPrefs.amount_unit)?.label ?? ''}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {AMOUNT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pref-capacity">용량 단위</Label>
                <Select
                  value={draftPrefs.capacity_unit}
                  onValueChange={(v) => v && setDraftPrefs((p) => ({ ...p, capacity_unit: v as CapacityUnit }))}
                >
                  <SelectTrigger id="pref-capacity">
                    <span className="flex flex-1 text-left truncate" data-slot="select-value">
                      {CAPACITY_OPTIONS.find((o) => o.value === draftPrefs.capacity_unit)?.label ?? ''}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {CAPACITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label htmlFor="pref-show-ea" className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                id="pref-show-ea"
                checked={draftPrefs.show_ea}
                onCheckedChange={(checked) => setDraftPrefs((p) => ({ ...p, show_ea: checked === true }))}
              />
              <span>모듈 장수(EA) 동시 표시</span>
            </label>

            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="text-sm font-medium text-muted-foreground">미리보기 (저장 전 즉시 반영)</div>
              <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">금액</div>
                  {PREVIEW_AMOUNTS.map((amount) => (
                    <div key={amount} className="font-mono">
                      <span className="text-muted-foreground">{amount.toLocaleString('ko-KR')}원 → </span>
                      {formatKRW(amount, draftPrefs)}
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">용량</div>
                  {PREVIEW_CAPACITIES.map(({ kw, ea }) => (
                    <div key={kw} className="font-mono">
                      <span className="text-muted-foreground">{kw.toLocaleString('ko-KR')}kW / {ea.toLocaleString('ko-KR')}EA → </span>
                      {formatCapacity(kw, ea, draftPrefs)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {prefsError && <p className="text-sm text-destructive">{prefsError}</p>}
            {prefsSuccess && <p className="text-sm text-emerald-700">{prefsSuccess}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handlePrefsReset} disabled={prefsSaving}>
                기본값으로
              </Button>
              <Button type="submit" disabled={prefsSaving}>
                {prefsSaving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-lg border bg-card">
          <header className="px-5 py-4 border-b bg-muted/30">
            <h2 className="text-base font-semibold">비밀번호 변경</h2>
            <p className="text-sm text-muted-foreground">8자 이상의 새 비밀번호를 입력하세요.</p>
          </header>
          <form onSubmit={handlePasswordChange} className="p-5 space-y-4">
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
