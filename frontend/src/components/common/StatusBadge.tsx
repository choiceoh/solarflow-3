import { Badge } from '@/components/ui/badge';

export default function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive
    ? <Badge variant="default">활성</Badge>
    : <Badge variant="secondary">비활성</Badge>;
}
