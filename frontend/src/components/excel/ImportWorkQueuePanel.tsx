import { Link } from 'react-router-dom';
import type { ComponentType, CSSProperties } from 'react';
import { ArrowRight, CheckCircle2, FileWarning, ReceiptText, WalletCards } from 'lucide-react';
import { useOutboundDashboard, useSaleSummary } from '@/hooks/useOutbound';
import { formatNumber } from '@/lib/utils';
import type { ImportHistoryEntry } from '@/lib/importHistory';

interface Props {
  history: ImportHistoryEntry[];
}

interface QueueCardProps {
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  label: string;
  value: number | null;
  to: string;
  tone?: 'warn' | 'pos' | 'info';
}

export default function ImportWorkQueuePanel({ history }: Props) {
  const { dashboard: saleMissingDash } = useOutboundDashboard({ work_queue: 'sale_unregistered' });
  const { summary: invoicePending } = useSaleSummary({ invoice_status: 'pending' });
  const { summary: erpOpen } = useSaleSummary({ invoice_status: 'issued', erp_closed: 'false' });
  const { summary: receiptOpen } = useSaleSummary({ receipt_status: 'open' });
  const reviewCount = history.filter((item) => item.status === 'preview' && (item.errorRows + item.warningRows) > 0).length;

  return (
    <section className="grid gap-2 lg:grid-cols-5">
      <QueueCard
        icon={FileWarning}
        label="업로드 검토"
        value={reviewCount}
        to="/import"
        tone={reviewCount > 0 ? 'warn' : 'pos'}
      />
      <QueueCard
        icon={ReceiptText}
        label="매출 미등록"
        value={saleMissingDash?.totals.count ?? null}
        to="/orders?tab=outbound&queue=sale_unregistered"
        tone="warn"
      />
      <QueueCard
        icon={ReceiptText}
        label="계산서 미발행"
        value={invoicePending?.total ?? null}
        to="/orders?tab=sales&invoice=pending"
        tone="warn"
      />
      <QueueCard
        icon={CheckCircle2}
        label="ERP 미마감"
        value={erpOpen?.total ?? null}
        to="/orders?tab=sales&invoice=issued&erp=false"
        tone="info"
      />
      <QueueCard
        icon={WalletCards}
        label="수금 미완료"
        value={receiptOpen?.total ?? null}
        to="/orders?tab=sales&receipt=open"
        tone="warn"
      />
    </section>
  );
}

function QueueCard({ icon: Icon, label, value, to, tone = 'warn' }: QueueCardProps) {
  const color = tone === 'pos' ? 'var(--sf-pos)' : tone === 'info' ? 'var(--sf-info)' : 'var(--sf-warn)';
  return (
    <Link
      to={to}
      className="group flex min-h-[74px] items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 transition hover:border-[var(--ink-3)]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--bg-2)]">
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-[var(--ink-3)]">{label}</div>
        <div className="mono mt-1 text-lg font-semibold text-[var(--ink)]">
          {value == null ? '-' : formatNumber(value)}
        </div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-3)] transition group-hover:translate-x-0.5" />
    </Link>
  );
}
