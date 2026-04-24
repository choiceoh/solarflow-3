// 헤더
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/appStore';
import UserMenu from './UserMenu';
import GlobalSearchBar from '@/components/search/GlobalSearchBar';
import AlertBell from './AlertBell';

export default function Header() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-card px-4">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSidebar}>
        <Menu className="h-4 w-4" />
      </Button>
      <GlobalSearchBar />
      <AlertBell />
      <UserMenu />
    </header>
  );
}
