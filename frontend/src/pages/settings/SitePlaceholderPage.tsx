// 사이트 설정 — 전역 설정 (admin 전용).
// 첫 항목: 메뉴 가시성 (운영 검증 미완 메뉴를 사이드바에서 켜고 끄기)
// 후속 항목들은 placeholder 카드로 자리만 잡아둠.
import { Bell, Building2, Calendar, DollarSign, Eye, Warehouse } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { listWipMenus } from '@/components/layout/CommandShell';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import SidebarTabsCard from '@/pages/settings/SidebarTabsCard';

interface PlannedItem {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const PLANNED: PlannedItem[] = [
  {
    icon: Building2,
    title: '회사·사이트 식별',
    desc: '회사명·사업자번호·주소·대표 전화 — 운영 폼/문서 템플릿이 참조하는 기준값',
  },
  {
    icon: Bell,
    title: '공지 배너',
    desc: '관리자가 한 줄 공지를 작성하면 모든 사용자 상단에 노출 (점검·이벤트 안내)',
  },
  {
    icon: DollarSign,
    title: '기본 환율 / 통화',
    desc: '폼 초기값과 계산기 fallback 환율, 운영 계산 기준 통화',
  },
  {
    icon: Warehouse,
    title: '기본 창고·거래처',
    desc: '발주·수주·출고 폼이 자동 채워줄 default 값, admin이 한 곳에서 조정',
  },
  {
    icon: Calendar,
    title: '운영 시간·휴무일',
    desc: '결제 마감·주문 가능 시간·공휴일 정의 — 알림 발송·운영 자동화의 기준',
  },
];

function MenuVisibilityCard() {
  const wip = listWipMenus();
  const { hidden, loading, setMenuHidden } = useMenuVisibility();

  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-muted p-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">메뉴 가시성</h2>
            <span className="rounded bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium">활성</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-5">
            운영 검증이 끝나지 않은 미완 메뉴를 사이드바에서 숨길 수 있습니다. 변경은 모든 사용자에게 즉시 반영됩니다.
          </p>

          {wip.length === 0 ? (
            <p className="mt-3 rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              현재 미완 표시된 메뉴가 없습니다 (코드의 NAV_GROUPS에서 `isWip: true` 부여 시 여기 노출).
            </p>
          ) : (
            <ul className="mt-3 divide-y rounded border">
              {wip.map((item) => {
                const isHidden = hidden.has(item.key);
                return (
                  <li key={item.key} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-[11px] text-muted-foreground">{isHidden ? '사이드바에서 숨겨짐' : '사이드바에 노출 중'}</p>
                    </div>
                    <Switch
                      checked={!isHidden}
                      onCheckedChange={(v) => setMenuHidden(item.key, !v)}
                      disabled={loading}
                      aria-label={`${item.label} 사이드바 노출 토글`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}

export default function SitePlaceholderPage() {
  return (
    <div className="sf-page">
      <div className="sf-page-header">
        <div>
          <div className="sf-eyebrow">SITE SETTINGS</div>
          <h1 className="sf-page-title">사이트 설정</h1>
          <p className="sf-page-description">
            모든 사용자에게 영향을 주는 전역 설정. 항목은 운영 필요에 따라 단계적으로 추가됩니다.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-3">
        <SidebarTabsCard />
        <MenuVisibilityCard />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {PLANNED.map((item) => (
            <article key={item.title} className="rounded-lg border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-muted p-2">
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-medium">{item.title}</h2>
                    <span className="rounded bg-gray-100 text-gray-600 px-1.5 py-0.5 text-[10px] font-medium">준비 중</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-5">{item.desc}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
