import { DollarSign, Wallet, TrendingDown } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn, formatUSD } from '@/lib/utils';
import SkeletonRows from '@/components/common/SkeletonRows';
import LCDemandByPOTable from './LCDemandByPOTable';
import LCDemandMonthlyTable from './LCDemandMonthlyTable';
import { useLCDemand } from '@/hooks/useLCDemand';

type Tone = 'pos' | 'neg' | 'warn';

const ICON_TONE: Record<Tone, string> = {
  pos:  'bg-[var(--sf-pos-bg)] text-[var(--sf-pos)]',
  neg:  'bg-[var(--sf-neg-bg)] text-[var(--sf-neg)]',
  warn: 'bg-[var(--sf-warn-bg)] text-[var(--sf-warn)]',
};

const TEXT_TONE: Record<Tone, string> = {
  pos:  'text-[var(--sf-pos)]',
  neg:  'text-[var(--sf-neg)]',
  warn: 'text-[var(--sf-warn)]',
};

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  iconTone: Tone;
  valueTone?: Tone;
  sub?: string;
}

function SummaryCard({ icon, label, value, iconTone, valueTone, sub }: SummaryCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--sf-line)] bg-[var(--sf-surface)] p-3 shadow-[var(--sf-shadow-1)]">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', ICON_TONE[iconTone])}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="sf-eyebrow">{label}</div>
        <div className={cn('sf-mono mt-0.5 text-base font-semibold tabular-nums', valueTone ? TEXT_TONE[valueTone] : 'text-[var(--sf-ink)]')}>
          {value}
        </div>
        {sub && <div className={cn('sf-mono mt-0.5 text-[10px]', valueTone ? TEXT_TONE[valueTone] : 'text-[var(--sf-ink-3)]')}>{sub}</div>}
      </div>
    </div>
  );
}

export default function LCDemandForecast() {
  const { demandByPO, monthlyForecast, totalLCNeeded, totalAvailable, shortage, loading, error } = useLCDemand();

  if (loading) return <SkeletonRows rows={4} />;
  if (error) return <p className="py-6 text-center text-sm text-[var(--sf-neg)]">{error}</p>;

  const isShortage = shortage < 0;
  const shortageTone: Tone = isShortage ? 'neg' : 'pos';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          icon={<DollarSign className="h-5 w-5" />}
          label="LC 미개설 총액"
          value={formatUSD(totalLCNeeded)}
          iconTone="warn"
        />
        <SummaryCard
          icon={<Wallet className="h-5 w-5" />}
          label="가용한도"
          value={formatUSD(totalAvailable)}
          iconTone="pos"
        />
        <SummaryCard
          icon={<TrendingDown className="h-5 w-5" />}
          label="과부족"
          value={`${shortage >= 0 ? '+' : ''}${formatUSD(shortage)}`}
          iconTone={shortageTone}
          valueTone={shortageTone}
          sub={isShortage ? '부족' : '충분'}
        />
      </div>

      <div>
        <div className="sf-eyebrow mb-2">PO별 LC 수요</div>
        <LCDemandByPOTable items={demandByPO} />
      </div>

      <Separator />

      <div>
        <div className="sf-eyebrow mb-2">3개월 예측</div>
        <LCDemandMonthlyTable items={monthlyForecast} />
      </div>
    </div>
  );
}
