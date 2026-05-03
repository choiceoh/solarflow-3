import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_LABELS, type Role } from '@/config/permissions';

const PREVIEW_ROLES: Role[] = ['admin', 'operator', 'executive', 'manager', 'viewer'];

/**
 * Plasmic 의 Variants preview 패턴 — 실제 JWT 역할 (admin) 인 채로 *다른 역할로 보면 어떻게 보일지* 시각 미리보기.
 *
 * 안전:
 *   - admin 만 사용 가능 (권한 우회 방지: 실제 JWT 가 admin 이어야만 override 적용)
 *   - frontend UI hint 만 변종 — 실제 backend API 호출은 *진짜 JWT 역할* 기준
 *   - 미리보기 활성 시 amber 강조 + 종료 버튼 항상 노출
 */
export const PreviewRolePanel = () => {
  const { role: actualRole } = useAuth();
  const previewRole = useAppStore((s) => s.inspectorPreviewRole);
  const setPreviewRole = useAppStore((s) => s.setInspectorPreviewRole);

  if (actualRole !== 'admin') return null; // admin 만 사용 가능

  const onPick = (r: Role) => {
    setPreviewRole(r === actualRole ? null : r);
  };

  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <Eye className="h-3 w-3" />
        다른 역할로 보기
      </div>
      <div className="flex flex-wrap gap-1">
        {PREVIEW_ROLES.map((r) => {
          const isActive = (previewRole ?? actualRole) === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => onPick(r)}
              className={cn(
                'rounded border px-2 py-0.5 text-xs transition',
                isActive
                  ? 'border-purple-500 bg-purple-100 font-medium text-purple-900 dark:border-purple-600 dark:bg-purple-900/40 dark:text-purple-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
              )}
            >
              {ROLE_LABELS[r] ?? r}
            </button>
          );
        })}
      </div>
      {previewRole && previewRole !== actualRole && (
        <p className="rounded border border-purple-200 bg-purple-50 p-1.5 text-xs text-purple-800 dark:border-purple-700/40 dark:bg-purple-900/20 dark:text-purple-200">
          현재 <span className="font-medium">{ROLE_LABELS[previewRole as Role] ?? previewRole}</span> 으로 보고 있습니다 — 화면 hint·메뉴·버튼이 그 역할 기준. 실제 데이터는 본인 권한 그대로.
        </p>
      )}
      <FloatingPreviewBanner previewRole={previewRole} actualRole={actualRole} onClear={() => setPreviewRole(null)} />
    </section>
  );
};

interface FloatingBannerProps {
  previewRole: string | null;
  actualRole: string | null;
  onClear: () => void;
}

/** 화면 *전체 상단* 에 띄우는 영구 배너 — 사용자가 인스펙터 패널 닫아도 미리보기 활성 시 인지 */
const FloatingPreviewBanner = ({ previewRole, actualRole, onClear }: FloatingBannerProps) => {
  if (!previewRole || previewRole === actualRole) return null;
  return (
    <div
      data-inspector-ui="true"
      className="fixed top-3 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-2 rounded-full bg-purple-600 px-3 py-1 text-xs font-medium text-white shadow-lg"
    >
      <Eye className="h-3 w-3" />
      <span>{ROLE_LABELS[previewRole as Role] ?? previewRole} 으로 미리보기 중</span>
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-xs hover:bg-white/30"
      >
        해제
      </button>
    </div>
  );
};
