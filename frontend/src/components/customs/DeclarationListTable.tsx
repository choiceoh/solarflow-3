import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import type { Declaration } from '@/types/customs';

interface Props {
  items: Declaration[];
  onSelect: (d: Declaration) => void;
  onNew: () => void;
}

export default function DeclarationListTable({ items, onSelect }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">등록된 면장이 없습니다</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>면장번호</TableHead>
          <TableHead>B/L번호</TableHead>
          <TableHead>법인</TableHead>
          <TableHead>신고일</TableHead>
          <TableHead>입항일</TableHead>
          <TableHead>반출일</TableHead>
          <TableHead>HS코드</TableHead>
          <TableHead>세관</TableHead>
          <TableHead>항구</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((d) => (
          <TableRow
            key={d.declaration_id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => onSelect(d)}
          >
            <TableCell className="font-medium">{d.declaration_number}</TableCell>
            <TableCell>{d.bl_number || d.bl_id.slice(0, 8)}</TableCell>
            <TableCell>{d.company_name || '—'}</TableCell>
            <TableCell>{formatDate(d.declaration_date)}</TableCell>
            <TableCell>{d.arrival_date ? formatDate(d.arrival_date) : '—'}</TableCell>
            <TableCell>{d.release_date ? formatDate(d.release_date) : '—'}</TableCell>
            <TableCell>{d.hs_code || '—'}</TableCell>
            <TableCell>{d.customs_office || '—'}</TableCell>
            <TableCell>{d.port || '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
