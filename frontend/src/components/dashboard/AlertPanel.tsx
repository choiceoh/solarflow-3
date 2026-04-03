import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AlertItemComponent from './AlertItemComponent';
import type { AlertItem } from '@/types/dashboard';

interface Props {
  alerts: AlertItem[];
}

export default function AlertPanel({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">알림</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-xs text-muted-foreground text-center py-4">현재 알림이 없습니다</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm">알림 ({alerts.length})</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {alerts.map((a) => (
          <AlertItemComponent key={a.id} alert={a} />
        ))}
      </CardContent>
    </Card>
  );
}
