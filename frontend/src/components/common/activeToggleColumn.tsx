import { Switch } from '@/components/ui/switch';
import type { Column } from './DataTable';

export function activeToggleColumn<T extends { is_active: boolean }>(
  onToggle: (row: T) => void,
): Column<T> {
  return {
    key: 'is_active',
    label: '활성',
    render: (row) => (
      <Switch checked={row.is_active} onCheckedChange={() => onToggle(row)} />
    ),
  };
}
