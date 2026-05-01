import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  stepNumber: number;
}

export default function PlaceholderPage({ title, stepNumber }: PlaceholderPageProps) {
  return (
    <div className="sf-page flex min-h-[60vh] items-center justify-center">
      <div className="flex max-w-[360px] flex-col items-center gap-3 rounded-md border border-[var(--sf-line)] bg-[var(--sf-surface)] px-8 py-10 text-center shadow-[var(--sf-shadow-1)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sf-solar-bg)] text-[var(--sf-solar-3)]">
          <Construction className="h-5 w-5" strokeWidth={1.6} />
        </div>
        <div className="sf-eyebrow text-[var(--sf-solar-3)]">WORK IN PROGRESS</div>
        <h2 className="text-base font-semibold tracking-[-0.012em] text-[var(--sf-ink)]">
          {title}
        </h2>
        <p className="sf-mono text-[11px] text-[var(--sf-ink-3)]">
          Step {stepNumber}에서 구현 예정
        </p>
      </div>
    </div>
  );
}
