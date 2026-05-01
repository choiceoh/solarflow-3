import { DollarSign, CreditCard, Wallet, TrendingUp } from 'lucide-react';
import { formatUSD } from '@/lib/utils';
import type { BankSummary } from '@/types/banking';

interface Props {
  bankSummaries: BankSummary[];
}

export default function LCLimitSummaryCards({ bankSummaries }: Props) {
  const totalLimit = bankSummaries.reduce((s, b) => s + b.limit, 0);
  const totalUsed = bankSummaries.reduce((s, b) => s + b.used, 0);
  const totalAvailable = bankSummaries.reduce((s, b) => s + b.available, 0);
  const usageRate = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;

  // 사용률 톤: 0~70% pos, 70~90% warn, 90~100% neg
  const usageTone = usageRate >= 90 ? 'var(--sf-neg)' : usageRate >= 70 ? 'var(--sf-warn)' : 'var(--sf-pos)';
  const usageBgTone = usageRate >= 90 ? 'var(--sf-neg-bg)' : usageRate >= 70 ? 'var(--sf-warn-bg)' : 'var(--sf-pos-bg)';

  const cards = [
    { label: '총한도',   value: formatUSD(totalLimit),     icon: DollarSign,  bg: 'var(--sf-info-bg)',  ink: 'var(--sf-info)' },
    { label: '개설잔액', value: formatUSD(totalUsed),      icon: CreditCard,  bg: 'var(--sf-warn-bg)',  ink: 'var(--sf-warn)' },
    { label: '가용한도', value: formatUSD(totalAvailable), icon: Wallet,      bg: 'var(--sf-pos-bg)',   ink: 'var(--sf-pos)' },
    { label: '사용률',   value: `${usageRate.toFixed(1)}%`, icon: TrendingUp, bg: usageBgTone,           ink: usageTone, valueTone: usageTone },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, bg, ink, valueTone }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-md p-3"
            style={{ background: 'var(--sf-surface)', border: '1px solid var(--sf-line)', boxShadow: 'var(--sf-shadow-1)' }}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
              style={{ background: bg, color: ink }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="sf-eyebrow">{label}</div>
              <div className="sf-mono mt-0.5 text-base font-semibold tabular-nums" style={{ color: valueTone || 'var(--sf-ink)' }}>
                {value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 사용률 Progress bar */}
      <div className="px-1">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="sf-eyebrow">LC 사용률</span>
          <span className="sf-mono text-[12px] font-semibold tabular-nums" style={{ color: usageTone }}>
            {usageRate.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full" style={{ background: 'var(--sf-line)' }}>
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${Math.min(usageRate, 100)}%`, background: usageTone }}
          />
        </div>
      </div>
    </div>
  );
}
