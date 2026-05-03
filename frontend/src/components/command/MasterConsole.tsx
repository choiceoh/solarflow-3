import type { ReactNode } from 'react';
import { CardB, CommandTopLine, RailBlock, TileB } from './MockupPrimitives';

export interface MasterConsoleMetric {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: 'solar' | 'ink' | 'info' | 'warn' | 'pos';
  delta?: string;
  spark?: number[];
}

interface MasterConsoleProps {
  eyebrow?: string;
  title: string;
  description: string;
  tableTitle: string;
  tableSub?: string;
  actions?: ReactNode;
  metrics: MasterConsoleMetric[];
  toolbar?: ReactNode;
  rail?: ReactNode;
  children: ReactNode;
}

export function MasterConsole({
  eyebrow = 'MASTER DATA',
  title,
  description,
  tableTitle,
  tableSub,
  actions,
  metrics,
  toolbar,
  rail,
  children,
}: MasterConsoleProps) {
  const hasRail = rail != null;
  return (
    <div className="sf-page sf-procurement-page">
      <div className="sf-page-header">
        <div>
          <div className="sf-eyebrow">{eyebrow}</div>
          <h1 className="sf-page-title">{title}</h1>
          <p className="sf-page-description">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>

      <div
        className="sf-procurement-layout"
        style={hasRail ? undefined : { gridTemplateColumns: 'minmax(0, 1fr)' }}
      >
        <section className="sf-procurement-main">
          <CommandTopLine title={tableTitle} sub={tableSub} right={toolbar} />

          <div className="sf-command-kpis">
            {metrics.map((metric) => (
              <TileB
                key={metric.label}
                lbl={metric.label}
                v={metric.value}
                u={metric.unit}
                sub={metric.sub}
                tone={metric.tone}
                delta={metric.delta}
                spark={metric.spark}
              />
            ))}
          </div>

          <CardB
            title={tableTitle}
            sub={tableSub}
            right={toolbar}
            headerless
          >
            <div className="sf-command-tab-body">{children}</div>
          </CardB>
        </section>

        {hasRail ? (
          <aside className="sf-procurement-rail card">
            {rail}
            <RailBlock title="운영 규칙" accent="var(--solar-3)" last>
              <div className="space-y-2 text-[11px] leading-5 text-[var(--ink-3)]">
                <p>마스터 변경은 즉시 업무 화면의 선택지와 정산 기준에 반영됩니다.</p>
                <p className="mono text-[10px] text-[var(--ink-4)]">delete · status · edit guarded by ConfirmDialog</p>
              </div>
            </RailBlock>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
