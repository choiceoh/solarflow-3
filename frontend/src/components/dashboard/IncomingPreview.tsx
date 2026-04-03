import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import { BL_STATUS_LABEL, type BLStatus } from '@/types/inbound';
import type { BLShipment } from '@/types/inbound';

const STATUS_COLOR: Record<string, string> = {
  shipping: 'bg-yellow-100 text-yellow-700',
  arrived: 'bg-blue-100 text-blue-700',
  customs: 'bg-orange-100 text-orange-700',
};

interface Props {
  items: BLShipment[];
}

export default function IncomingPreview({ items }: Props) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <CardTitle className="text-sm">미착품 프리뷰</CardTitle>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('/inbound')}>전체 보기</Button>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">진행 중인 미착품이 없습니다</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>B/L</TableHead>
                <TableHead>제조사</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((bl) => (
                <TableRow key={bl.bl_id}>
                  <TableCell className="text-xs font-medium">{bl.bl_number}</TableCell>
                  <TableCell className="text-xs">{bl.manufacturer_name || '—'}</TableCell>
                  <TableCell className="text-xs">{bl.eta ? formatDate(bl.eta) : '—'}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${STATUS_COLOR[bl.status] || 'bg-gray-100 text-gray-700'}`}>
                      {BL_STATUS_LABEL[bl.status as BLStatus] || bl.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
