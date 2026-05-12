// 미리보기 표 옆에 붙는 에러/경고 리스트.
// 비유: 빨간펜 채점표 — 사용자가 "어디를 고치면 되는지" 한 줄씩 보고 클릭하면 그 행으로 점프.
//
// 기존 표만 있을 때 사용자는 큰 표를 스크롤하며 빨간 셀을 직접 찾아야 했다.
// 사이드 리스트를 클릭하면 표가 그 행으로 scrollIntoView + 잠깐 노란 글로우.

import { useMemo } from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ParsedRow } from '@/types/excel';

interface Props {
  rows: ParsedRow[];
  /** 사이드 패널 클릭 시 부모가 표를 그 행으로 점프하도록 콜백을 호출. */
  onJump: (rowNumber: number) => void;
  /** 현재 강조 중인 행 번호 — 같은 행의 사이드 항목도 같이 강조. */
  activeRow?: number | null;
}

interface Issue {
  rowNumber: number;
  severity: 'error' | 'warning';
  field: string;
  message: string;
}

function collectIssues(rows: ParsedRow[]): Issue[] {
  const issues: Issue[] = [];
  for (const row of rows) {
    for (const e of row.errors) {
      issues.push({ rowNumber: row.rowNumber, severity: 'error', field: e.field, message: e.message });
    }
    for (const w of row.warnings ?? []) {
      issues.push({ rowNumber: row.rowNumber, severity: 'warning', field: w.field, message: w.message });
    }
  }
  // 에러 먼저, 그 다음 경고. 같은 등급 안에서는 행 번호 오름차순.
  return issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return a.rowNumber - b.rowNumber;
  });
}

export default function ImportPreviewErrorList({ rows, onJump, activeRow }: Props) {
  const issues = useMemo(() => collectIssues(rows), [rows]);
  if (issues.length === 0) return null;

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.length - errorCount;

  return (
    <div className="flex w-56 shrink-0 flex-col overflow-hidden rounded-md border bg-card">
      <div className="border-b bg-muted/40 px-2.5 py-1.5 text-[11px]">
        <div className="flex items-center gap-1.5 font-medium">
          {errorCount > 0 ? (
            <>
              <XCircle className="sf-text-neg h-3 w-3" />
              <span>에러 {errorCount}건</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              <span>경고 {warnCount}건</span>
            </>
          )}
          {errorCount > 0 && warnCount > 0 ? (
            <span className="text-muted-foreground">· 경고 {warnCount}</span>
          ) : null}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          항목을 클릭하면 표의 해당 행으로 이동합니다.
        </div>
      </div>
      <ul className="flex-1 divide-y overflow-auto">
        {issues.map((issue, idx) => (
          <li key={`${issue.rowNumber}-${idx}`}>
            <button
              type="button"
              onClick={() => onJump(issue.rowNumber)}
              className={cn(
                'flex w-full items-start gap-1.5 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/40',
                activeRow === issue.rowNumber && 'bg-amber-50',
              )}
            >
              {issue.severity === 'error' ? (
                <XCircle className="sf-text-neg mt-0.5 h-3 w-3 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
              )}
              <span className="flex-1">
                <span className="sf-mono mr-1.5 tabular-nums text-muted-foreground">
                  {issue.rowNumber}행
                </span>
                <span
                  className={cn(
                    'font-medium',
                    issue.severity === 'error' ? 'text-red-700' : 'text-amber-700',
                  )}
                >
                  {issue.field}
                </span>
                <span className="text-muted-foreground">: {issue.message}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
