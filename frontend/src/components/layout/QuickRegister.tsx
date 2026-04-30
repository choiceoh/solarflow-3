import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Star, Settings2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { QUICK_ACTIONS, DEFAULT_FAVORITES, type ActionId } from '@/config/quickActions';
import { useFavorites } from '@/hooks/useFavorites';
import { canAccessMenu } from '@/config/permissions';
import type { Role } from '@/config/permissions';

// 그룹 순서
const GROUP_ORDER = ['영업', '구매', '마스터', '도구'] as const;

interface Props {
  userId: string | undefined;
  role: Role | null;
}

export default function QuickRegister({ userId, role }: Props) {
  const navigate = useNavigate();
  const { favorites, save, toggle } = useFavorites(userId);
  const [editorOpen, setEditorOpen] = useState(false);

  // 권한 기준으로 노출 가능한 액션 필터
  const allowed = QUICK_ACTIONS.filter((a) => canAccessMenu(role, a.menuKey));

  // 드롭다운에 표시할 즐겨찾기 (허용 + 즐겨찾기 등록된 것)
  const visibleFavorites = favorites
    .map((id) => allowed.find((a) => a.id === id))
    .filter(Boolean) as typeof QUICK_ACTIONS;

  // 허용된 액션이 없으면 버튼 숨김 (executive/manager/viewer)
  if (allowed.length === 0) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />
          빠른 등록
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {visibleFavorites.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              즐겨찾기를 추가해주세요
            </div>
          ) : (
            visibleFavorites.map((action) => (
              <DropdownMenuItem
                key={action.id}
                onClick={() => navigate(action.path)}
                className="gap-2"
              >
                <action.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {action.label}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setEditorOpen(true)}
            className="gap-2 text-muted-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
            즐겨찾기 편집…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 즐겨찾기 편집 모달 */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">빠른 등록 즐겨찾기</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {GROUP_ORDER.map((group) => {
              const groupActions = allowed.filter((a) => a.group === group);
              if (groupActions.length === 0) return null;
              return (
                <div key={group}>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    {group}
                  </p>
                  <div className="space-y-0.5">
                    {groupActions.map((action) => {
                      const active = favorites.includes(action.id);
                      return (
                        <button
                          key={action.id}
                          onClick={() => toggle(action.id)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                            active
                              ? 'bg-primary/8 text-foreground'
                              : 'text-muted-foreground hover:bg-muted/60',
                          )}
                        >
                          <action.icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 text-left">{action.label}</span>
                          <Star
                            className={cn(
                              'h-3.5 w-3.5 shrink-0',
                              active ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40',
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[10px] text-muted-foreground">
            기본값으로 되돌리려면{' '}
            <button
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                const defaultIds = DEFAULT_FAVORITES.filter((id) =>
                  allowed.some((a) => a.id === id)
                ) as ActionId[];
                save(defaultIds);
              }}
            >
              초기화
            </button>
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
