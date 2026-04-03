import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn, formatDate, formatNumber, formatMW } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import { PO_STATUS_LABEL, PO_STATUS_COLOR, CONTRACT_TYPE_LABEL, type PurchaseOrder } from '@/types/procurement';

interface Props {
  items: PurchaseOrder[];
  onSelect: (po: PurchaseOrder) => void;
  onNew: () => void;
}

export default function POListTable({ items, onSelect, onNew }: Props) {
  if (items.length === 0) return <EmptyState message="등록된 PO가 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>PO번호</TableHead>
            <TableHead>제조사</TableHead>
            <TableHead>계약유형</TableHead>
            <TableHead>계약일</TableHead>
            <TableHead>Incoterms</TableHead>
            <TableHead className="text-right">총수량</TableHead>
            <TableHead className="text-right">총MW</TableHead>
            <TableHead>상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((po) => (
            <TableRow key={po.po_id} className="cursor-pointer hover:bg-accent/50" onClick={() => onSelect(po)}>
              <TableCell className="font-mono">{po.po_number || '—'}</TableCell>
              <TableCell>{po.manufacturer_name ?? '—'}</TableCell>
              <TableCell>{CONTRACT_TYPE_LABEL[po.contract_type]}</TableCell>
              <TableCell>{formatDate(po.contract_date ?? '')}</TableCell>
              <TableCell>{po.incoterms ?? '—'}</TableCell>
              <TableCell className="text-right">{po.total_qty != null ? formatNumber(po.total_qty) : '—'}</TableCell>
              <TableCell className="text-right">{po.total_mw != null ? formatMW(po.total_mw * 1000) : '—'}</TableCell>
              <TableCell>
                <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', PO_STATUS_COLOR[po.status])}>
                  {PO_STATUS_LABEL[po.status]}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
