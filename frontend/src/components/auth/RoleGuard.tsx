import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface RoleGuardProps {
  allowedRoles: string[];
  children: ReactNode;
}

export default function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { role } = useAuth();

  if (!role || !allowedRoles.includes(role)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">접근 권한이 없습니다</p>
      </div>
    );
  }

  return <>{children}</>;
}
