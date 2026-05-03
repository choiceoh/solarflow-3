// 관리자 설정 — 사용자 관리 (admin 전용)
import { useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { usePermission } from '@/hooks/usePermission';
import { ROLE_LABELS, type Role } from '@/config/permissions';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { MasterConsole } from '@/components/command/MasterConsole';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface UserProfile {
  user_id: string;
  email: string;
  name: string;
  role: Role;
  department?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
}

interface EditProfileForm {
  name: string;
  department: string;
  phone: string;
}

const ROLE_OPTIONS: Role[] = ['admin', 'operator', 'executive', 'manager', 'viewer'];

interface CreateUserForm {
  email: string;
  name: string;
  password: string;
  role: Role;
  department: string;
}

const ROLE_BADGE_VARIANT: Record<Role, string> = {
  admin:     'bg-red-100 text-red-700',
  operator:  'bg-blue-100 text-blue-700',
  executive: 'bg-purple-100 text-purple-700',
  manager:   'bg-amber-100 text-amber-700',
  viewer:    'bg-gray-100 text-gray-600',
};

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate text-sm ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

export default function AdminSettingsPage() {
  const { manageUsers } = usePermission();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: '',
    name: '',
    password: '',
    role: 'viewer',
    department: '',
  });
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState<EditProfileForm>({ name: '', department: '', phone: '' });
  const [editError, setEditError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!manageUsers) return;
    fetchWithAuth<UserProfile[]>('/api/v1/users')
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [manageUsers]);

  async function handleRoleChange(userId: string, newRole: Role) {
    setSavingId(userId);
    try {
      await fetchWithAuth(`/api/v1/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, role: newRole } : u));
    } catch {
      alert('역할 변경에 실패했습니다');
    } finally {
      setSavingId(null);
    }
  }

  async function handleActiveChange(userId: string, isActive: boolean) {
    setSavingId(userId);
    try {
      await fetchWithAuth(`/api/v1/users/${userId}/active`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: isActive }),
      });
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, is_active: isActive } : u));
    } catch {
      alert('상태 변경에 실패했습니다');
    } finally {
      setSavingId(null);
    }
  }

  function closeCreateDialog() {
    setCreateOpen(false);
    setCreateForm({ email: '', name: '', password: '', role: 'viewer', department: '' });
    setCreateError('');
    setIsCreating(false);
  }

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError('');

    if (createForm.password.length < 8) {
      setCreateError('임시 비밀번호는 8자 이상으로 입력해 주세요.');
      return;
    }

    setIsCreating(true);
    try {
      const created = await fetchWithAuth<UserProfile>('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({
          email: createForm.email.trim(),
          name: createForm.name.trim(),
          password: createForm.password,
          role: createForm.role,
          department: createForm.department.trim() || null,
          is_active: true,
        }),
      });
      setUsers((prev) => [...prev, created].sort((a, b) => a.email.localeCompare(b.email)));
      closeCreateDialog();
    } catch (err) {
      const message = err instanceof Error ? err.message : '사용자 생성에 실패했습니다';
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  }

  function openEditDialog(user: UserProfile) {
    setEditTarget(user);
    setEditForm({
      name: user.name,
      department: user.department ?? '',
      phone: user.phone ?? '',
    });
    setEditError('');
    setIsEditing(false);
  }

  function closeEditDialog() {
    setEditTarget(null);
    setEditForm({ name: '', department: '', phone: '' });
    setEditError('');
    setIsEditing(false);
  }

  async function handleEditProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editTarget) return;
    setEditError('');

    const name = editForm.name.trim();
    if (name.length < 2 || name.length > 50) {
      setEditError('이름은 2~50자로 입력해 주세요.');
      return;
    }

    setIsEditing(true);
    try {
      await fetchWithAuth(`/api/v1/users/${editTarget.user_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          department: editForm.department.trim() || null,
          phone: editForm.phone.trim() || null,
        }),
      });
      const department = editForm.department.trim() || undefined;
      const phone = editForm.phone.trim() || undefined;
      setUsers((prev) => prev.map((u) =>
        u.user_id === editTarget.user_id ? { ...u, name, department, phone } : u,
      ));
      closeEditDialog();
    } catch (err) {
      const message = err instanceof Error ? err.message : '사용자 정보 수정에 실패했습니다';
      setEditError(message);
    } finally {
      setIsEditing(false);
    }
  }

  function openResetDialog(user: UserProfile) {
    setResetTarget(user);
    setTempPassword('');
    setResetError('');
    setResetSuccess('');
    setIsResetting(false);
  }

  function closeResetDialog() {
    setResetTarget(null);
    setTempPassword('');
    setResetError('');
    setResetSuccess('');
    setIsResetting(false);
  }

  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError('');
    setResetSuccess('');

    if (tempPassword.length < 8) {
      setResetError('임시 비밀번호는 8자 이상으로 입력해 주세요.');
      return;
    }

    setIsResetting(true);
    try {
      await fetchWithAuth(`/api/v1/users/${resetTarget.user_id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ password: tempPassword }),
      });
      setResetSuccess('임시 비밀번호로 재설정했습니다.');
      setTempPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '비밀번호 재설정에 실패했습니다';
      setResetError(message);
    } finally {
      setIsResetting(false);
    }
  }

  if (!manageUsers) {
    return (
      <div className="sf-page">
        <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          시스템관리자만 이 페이지에 접근할 수 있습니다.
        </div>
      </div>
    );
  }

  const activeUsers = users.filter((user) => user.is_active).length;
  const adminUsers = users.filter((user) => user.role === 'admin').length;
  const operatorUsers = users.filter((user) => user.role === 'operator').length;

  return (
    <>
      <MasterConsole
        eyebrow="ADMIN SETTINGS"
        title="관리자 설정"
        description="사용자 계정, 역할, 활성 상태, 임시 비밀번호 발급을 관리합니다."
        tableTitle="사용자 권한 관리"
        tableSub={`${users.length.toLocaleString()}명 · ${activeUsers.toLocaleString()}명 활성`}
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            사용자 추가
          </Button>
        }
        metrics={[
          { label: '사용자', value: users.length.toLocaleString(), sub: '등록 계정', tone: 'solar', spark: [3, 4, 5, users.length || 1] },
          { label: '활성', value: activeUsers.toLocaleString(), sub: '로그인 가능', tone: 'pos' },
          { label: '관리자', value: adminUsers.toLocaleString(), sub: '사용자 관리 권한', tone: adminUsers > 0 ? 'warn' : 'ink' },
          { label: '운영팀', value: operatorUsers.toLocaleString(), sub: '입력 가능 권한', tone: 'info' },
        ]}
      >
        <div className="mx-auto max-w-7xl space-y-6">

      {/* 역할 안내 */}
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <p className="text-base font-medium text-muted-foreground uppercase tracking-wide">역할 안내</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-base">
          <div className="flex gap-2 items-start">
            <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_VARIANT.admin}`}>시스템관리자</span>
            <span className="text-muted-foreground">전체 기능 + 사용자 관리·설정</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_VARIANT.operator}`}>운영팀</span>
            <span className="text-muted-foreground">전체 기능 (설정 제외)</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_VARIANT.executive}`}>경영진</span>
            <span className="text-muted-foreground">전체 조회 (민감정보 포함, 입력 없음)</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_VARIANT.manager}`}>본부장</span>
            <span className="text-muted-foreground">재고·가용재고 조회 (민감정보 제외)</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_VARIANT.viewer}`}>조회</span>
            <span className="text-muted-foreground">재고·대시보드만</span>
          </div>
        </div>
      </div>

      {/* 사용자 목록 */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b bg-muted/30">
          <p className="text-lg font-semibold">사용자 목록 ({users.length}명)</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-base text-muted-foreground">불러오는 중...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-base text-muted-foreground">등록된 사용자가 없습니다</div>
        ) : (
          <div className="divide-y">
            {users.map((u) => {
              const isSaving = savingId === u.user_id;
              const isSelf = me?.user_id === u.user_id;
              return (
                <div key={u.user_id} className={`flex items-center gap-4 px-6 py-5 ${!u.is_active ? 'opacity-50' : ''}`}>
                  {/* 사용자 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-medium truncate">{u.name}</p>
                      <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_VARIANT[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                      {isSelf && (
                        <span className="shrink-0 rounded bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-medium">본인</span>
                      )}
                    </div>
                    <p className="text-base text-muted-foreground truncate">{u.email}{u.department ? ` · ${u.department}` : ''}</p>
                  </div>

                  {/* 역할 변경 — 본인 행은 잠금 (스스로 강등 사고 방지) */}
                  <div className="w-32 shrink-0" title={isSelf ? '본인의 역할은 변경할 수 없습니다' : undefined}>
                    <Select
                      value={u.role}
                      onValueChange={(v) => handleRoleChange(u.user_id, v as Role)}
                      disabled={isSaving || isSelf}
                    >
                      <SelectTrigger>
                        <Txt text={ROLE_LABELS[u.role] ?? u.role} />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 활성/비활성 — 본인 행은 잠금 (스스로 비활성화 시 즉시 락아웃) */}
                  <div className="flex items-center gap-2 shrink-0" title={isSelf ? '본인 계정은 비활성화할 수 없습니다' : undefined}>
                    <Switch
                      checked={u.is_active}
                      onCheckedChange={(v) => handleActiveChange(u.user_id, v)}
                      disabled={isSaving || isSelf}
                    />
                    <span className="text-base text-muted-foreground w-14">{u.is_active ? '활성' : '비활성'}</span>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => openEditDialog(u)}
                    disabled={isSaving}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    수정
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => openResetDialog(u)}
                    disabled={isSaving}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    임시 비번
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
        </div>
      </MasterConsole>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeCreateDialog(); else setCreateOpen(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>사용자 추가</DialogTitle>
            <DialogDescription>
              Supabase 인증 계정과 SolarFlow 권한을 함께 생성합니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-user-email">이메일</Label>
              <Input
                id="new-user-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="user@topsolar.kr"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-name">이름</Label>
              <Input
                id="new-user-name"
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="홍길동"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-password">임시 비밀번호</Label>
              <Input
                id="new-user-password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>역할</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(v) => setCreateForm((prev) => ({ ...prev, role: v as Role }))}
                >
                  <SelectTrigger>
                    <Txt text={ROLE_LABELS[createForm.role] ?? createForm.role} />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-department">부서</Label>
                <Input
                  id="new-user-department"
                  value={createForm.department}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, department: e.target.value }))}
                  placeholder="선택"
                />
              </div>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeCreateDialog} disabled={isCreating}>
                취소
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? '생성 중...' : '생성'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) closeEditDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>사용자 정보 수정</DialogTitle>
            <DialogDescription>
              {editTarget?.email} 계정의 이름·부서·전화번호를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-user-name">이름</Label>
              <Input
                id="edit-user-name"
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="홍길동"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-user-department">부서</Label>
              <Input
                id="edit-user-department"
                value={editForm.department}
                onChange={(e) => setEditForm((prev) => ({ ...prev, department: e.target.value }))}
                placeholder="선택"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-user-phone">전화번호</Label>
              <Input
                id="edit-user-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="010-0000-0000"
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEditDialog} disabled={isEditing}>
                취소
              </Button>
              <Button type="submit" disabled={isEditing}>
                {isEditing ? '저장 중...' : '저장'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) closeResetDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>임시 비밀번호 재설정</DialogTitle>
            <DialogDescription>
              {resetTarget?.email} 계정의 비밀번호를 새 임시 비밀번호로 바꿉니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-temp-password">새 임시 비밀번호</Label>
              <Input
                id="reset-temp-password"
                type="password"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            {resetError && <p className="text-sm text-destructive">{resetError}</p>}
            {resetSuccess && <p className="text-sm text-emerald-700">{resetSuccess}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeResetDialog} disabled={isResetting}>
                닫기
              </Button>
              <Button type="submit" disabled={isResetting || !!resetSuccess}>
                {isResetting ? '재설정 중...' : '재설정'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
