import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  title: string;
  badges?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export default function DetailSection({ title, badges, actions, children, footer }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3 pt-4">
        <CardTitle className="text-sm">{title}</CardTitle>
        {badges}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className="pb-4 space-y-4">
        {children}
        {footer}
      </CardContent>
    </Card>
  );
}
