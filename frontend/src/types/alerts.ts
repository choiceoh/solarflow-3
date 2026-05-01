export interface AlertItem {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  icon: string;
  title: string;
  description: string;
  count: number;
  link: string;
}
