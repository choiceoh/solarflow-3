import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  stepNumber: number;
}

export default function PlaceholderPage({ title, stepNumber }: PlaceholderPageProps) {
  return (
    <div className="sf-page flex min-h-[60vh] items-center justify-center">
      <div
        className="flex flex-col items-center gap-3 rounded-md px-8 py-10 text-center"
        style={{
          background: 'var(--sf-surface)',
          border: '1px solid var(--sf-line)',
          boxShadow: 'var(--sf-shadow-1)',
          maxWidth: '360px',
        }}
      >
        <div className="sf-tone-solar flex h-12 w-12 items-center justify-center rounded-full">
          <Construction className="h-5 w-5" strokeWidth={1.6} />
        </div>
        <div className="sf-eyebrow sf-text-solar">WORK IN PROGRESS</div>
        <h2 className="sf-text-ink text-base font-semibold" style={{ letterSpacing: '-0.012em' }}>
          {title}
        </h2>
        <p className="sf-mono sf-text-ink-3 text-[11px]">
          Step {stepNumber}에서 구현 예정
        </p>
      </div>
    </div>
  );
}
