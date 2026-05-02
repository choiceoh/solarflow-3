import { RotateCcw } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  DESIGN_TOKENS,
  type DesignToken,
  numberToRem,
  remToNumber,
} from './designTokens';

const groupedTokens = CATEGORY_ORDER.map((cat) => ({
  category: cat,
  tokens: DESIGN_TOKENS.filter((t) => t.category === cat),
}));

export const TokenPanel = () => {
  const tokenOverrides = useAppStore((s) => s.tokenOverrides);
  const setTokenOverride = useAppStore((s) => s.setTokenOverride);
  const resetTokenOverride = useAppStore((s) => s.resetTokenOverride);
  const resetAllTokenOverrides = useAppStore((s) => s.resetAllTokenOverrides);

  const overriddenCount = Object.keys(tokenOverrides).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-600">
          변경 즉시 모든 화면 반영. <span className="text-slate-400">(localStorage 영속)</span>
        </p>
        {overriddenCount > 0 && (
          <button
            type="button"
            onClick={resetAllTokenOverrides}
            className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
          >
            전체 기본값 ({overriddenCount})
          </button>
        )}
      </div>
      {groupedTokens.map(({ category, tokens }) => (
        <section key={category}>
          <h3 className="mb-1.5 border-b border-slate-200 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {CATEGORY_LABEL[category]}
          </h3>
          <div className="divide-y divide-slate-100">
            {tokens.map((token) => (
              <TokenRow
                key={token.key}
                token={token}
                value={tokenOverrides[token.key] ?? token.defaultValue}
                isOverridden={token.key in tokenOverrides}
                onChange={(v) => setTokenOverride(token.key, v)}
                onReset={() => resetTokenOverride(token.key)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

interface TokenRowProps {
  token: DesignToken;
  value: string;
  isOverridden: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}

const TokenRow = ({ token, value, isOverridden, onChange, onReset }: TokenRowProps) => (
  <div className="flex items-center gap-2 py-1.5">
    {token.type === 'color' ? (
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-slate-300 bg-transparent p-0"
        aria-label={token.label}
      />
    ) : (
      <input
        type="range"
        min={token.min}
        max={token.max}
        step={token.step}
        value={remToNumber(value)}
        onChange={(e) => onChange(numberToRem(Number.parseFloat(e.target.value)))}
        className="h-6 w-12 cursor-pointer"
        aria-label={token.label}
      />
    )}
    <div className="min-w-0 flex-1">
      <div className="truncate text-xs text-slate-700">{token.label}</div>
      <div className="truncate font-mono text-[10px] text-slate-400">{token.key}</div>
    </div>
    <code className="shrink-0 font-mono text-[10px] text-slate-500">{value}</code>
    {isOverridden ? (
      <button
        type="button"
        onClick={onReset}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        title="기본값으로 복원"
        aria-label="기본값으로 복원"
      >
        <RotateCcw className="h-3 w-3" />
      </button>
    ) : (
      <span className="w-5" />
    )}
  </div>
);
