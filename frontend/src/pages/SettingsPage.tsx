// 설정 페이지 — 사용자 관리 (admin 전용)
import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { ROLE_LABELS, type Role } from '@/config/permissions';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface UserProfile {
  user_id: string;
  email: string;
  name: string;
  role: Role;
  department?: string;
  is_active: boolean;
  created_at: string;
}

const ROLE_OPTIONS: Role[] = ['admin', 'operator', 'executive', 'manager', 'viewer'];

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

export default function SettingsPage() {
  const { manageUsers } = usePermission();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

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

  if (!manageUsers) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
        <p className="text-sm">시스템관리자만 이 페이지에 접근할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-lg font-semibold">설정</h1>
        <p className="text-sm text-muted-foreground mt-0.5">사용자 계정 및 역할을 관리합니다</p>
      </div>

      {/* 역할 안내 */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">역할 안내</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="flex gap-2 items-start">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BADGE_VARIANT.admin}`}>시스템관리자</span>
            <span className="text-muted-foreground">전체 기능 + 사용자 관리·설정</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BADGE_VARIANT.operator}`}>운영팀</span>
            <span className="text-muted-foreground">전체 기능 (설정 제외)</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BADGE_VARIANT.executive}`}>경영진</span>
            <span className="text-muted-foreground">전체 조회 (민감정보 포함, 입력 없음)</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BADGE_VARIANT.manager}`}>본부장</span>
            <span className="text-muted-foreground">재고·가용재고 조회 (민감정보 제외)</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BADGE_VARIANT.viewer}`}>조회</span>
            <span className="text-muted-foreground">재고·대시보드만</span>
          </div>
        </div>
      </div>

      {/* 사용자 목록 */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-sm font-medium">사용자 목록 ({users.length}명)</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">불러오는 중...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">등록된 사용자가 없습니다</div>
        ) : (
          <div className="divide-y">
            {users.map((u) => {
              const isSaving = savingId === u.user_id;
              return (
                <div key={u.user_id} className={`flex items-center gap-4 px-4 py-3 ${!u.is_active ? 'opacity-50' : ''}`}>
                  {/* 사용자 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BADGE_VARIANT[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.email}{u.department ? ` · ${u.department}` : ''}</p>
                  </div>

                  {/* 역할 변경 */}
                  <div className="w-32 shrink-0">
                    <Select
                      value={u.role}
                      onValueChange={(v) => handleRoleChange(u.user_id, v as Role)}
                      disabled={isSaving}
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

                  {/* 활성/비활성 */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={u.is_active}
                      onCheckedChange={(v) => handleActiveChange(u.user_id, v)}
                      disabled={isSaving}
                    />
                    <span className="text-xs text-muted-foreground w-8">{u.is_active ? '활성' : '비활성'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
