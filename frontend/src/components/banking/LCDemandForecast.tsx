import { DollarSign, Wallet, TrendingDown } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { formatUSD } from '@/lib/utils';
import SkeletonRows from '@/components/common/SkeletonRows';
import LCDemandByPOTable from './LCDemandByPOTable';
import LCDemandMonthlyTable from './LCDemandMonthlyTable';
import { useLCDemand } from '@/hooks/useLCDemand';

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  /** 아이콘 박스 톤 — `sf-tone-warn` 등. */
  iconTone: string;
  /** 값 글씨 색 — `sf-text-pos` 등. 미지정 시 기본 잉크. */
  valueClass?: string;
  sub?: string;
  subClass?: string;
}

function SummaryCard({ icon, label, value, iconTone, valueClass, sub, subClass }: SummaryCardProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-md p-3"
      style={{
        background: 'var(--sf-surface)',
        border: '1px solid var(--sf-line)',
        boxShadow: 'var(--sf-shadow-1)',
      }}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${iconTone}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="sf-eyebrow">{label}</div>
        <div className={`sf-mono mt-0.5 text-base font-semibold tabular-nums ${valueClass ?? 'sf-text-ink'}`}>
          {value}
        </div>
        {sub && <div className={`sf-mono mt-0.5 text-[10px] ${subClass ?? 'sf-text-ink-3'}`}>{sub}</div>}
      </div>
    </div>
  );
}

export default function LCDemandForecast() {
  const { demandByPO, monthlyForecast, totalLCNeeded, totalAvailable, shortage, loading, error } = useLCDemand();

  if (loading) return <SkeletonRows rows={4} />;
  if (error) return <p className="sf-text-neg py-6 text-center text-sm" role="alert">{error}</p>;

  const isShortage = shortage < 0;
  const shortageIconTone = isShortage ? 'sf-tone-neg' : 'sf-tone-pos';
  const shortageTextClass = isShortage ? 'sf-text-neg' : 'sf-text-pos';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          icon={<DollarSign className="h-5 w-5" />}
          label="LC 미개설 총액"
          value={formatUSD(totalLCNeeded)}
          iconTone="sf-tone-warn"
        />
        <SummaryCard
          icon={<Wallet className="h-5 w-5" />}
          label="가용한도"
          value={formatUSD(totalAvailable)}
          iconTone="sf-tone-pos"
        />
        <SummaryCard
          icon={<TrendingDown className="h-5 w-5" />}
          label="과부족"
          value={`${shortage >= 0 ? '+' : ''}${formatUSD(shortage)}`}
          iconTone={shortageIconTone}
          valueClass={shortageTextClass}
          sub={isShortage ? '부족' : '충분'}
          subClass={shortageTextClass}
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
