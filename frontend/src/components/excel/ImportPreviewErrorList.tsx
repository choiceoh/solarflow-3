// 미리보기 표 옆에 붙는 에러/경고 리스트.
// 비유: 빨간펜 채점표 — 사용자가 "어디를 고치면 되는지" 한 줄씩 보고 클릭하면 그 행으로 점프.
//
// 기존 표만 있을 때 사용자는 큰 표를 스크롤하며 빨간 셀을 직접 찾아야 했다.
// 사이드 리스트를 클릭하면 표가 그 행으로 scrollIntoView + 잠깐 노란 글로우.

import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, XCircle } from 'lucide-react';
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
  hint: string;
}

function collectIssues(rows: ParsedRow[]): Issue[] {
  const issues: Issue[] = [];
  for (const row of rows) {
    for (const e of row.errors) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'error',
        field: e.field,
        message: e.message,
        hint: getIssueHint(e.field, e.message),
      });
    }
    for (const w of row.warnings ?? []) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'warning',
        field: w.field,
        message: w.message,
        hint: getIssueHint(w.field, w.message),
      });
    }
  }
  // 에러 먼저, 그 다음 경고. 같은 등급 안에서는 행 번호 오름차순.
  return issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return a.rowNumber - b.rowNumber;
  });
}

function getIssueHint(field: string, message: string): string {
  const text = `${field} ${message}`.toLowerCase();
  const isMasterField = [
    '제조사',
    '품번',
    '은행',
    '법인',
    '거래처',
    '창고',
    'warehouse',
    'bank',
    'partner',
    'product',
    'manufacturer',
    'company',
  ].some((word) => text.includes(word.toLowerCase()));

  if (isMasterField && /(없|존재|찾|unknown|not found|alias)/i.test(message)) {
    return '마스터 이름·코드를 확인하고, 반복 오타면 alias/마스터를 정리한 뒤 다시 검증하세요.';
  }
  if (/(필수|비어|누락|required|empty)/i.test(message)) {
    return '셀 수정 모드에서 값을 채우거나 원본 엑셀의 필수 칸을 보정하세요.';
  }
  if (/(양수|0보다|음수|금액|수량|단가|환율|positive)/i.test(message)) {
    return '수량·금액·단가·환율은 0보다 큰 숫자로 입력해야 합니다.';
  }
  if (/(날짜|date|yyyy|형식)/i.test(message)) {
    return '날짜는 YYYY-MM-DD 형식으로 맞추고 시작일/종료일 순서를 확인하세요.';
  }
  if (/(중복|duplicate|이미)/i.test(message)) {
    return '번호가 이미 등록됐는지 확인하고, 이관 번호라면 MIG 추적키를 분리하세요.';
  }
  if (/(허용|유효|enum|allowed|invalid)/i.test(message)) {
    return '통합코드표의 허용값을 그대로 사용하세요.';
  }
  return '셀 수정 후 재검증하고, 원인이 반복되면 원본 파일 또는 마스터 기준값을 확인하세요.';
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
          클릭하면 해당 행으로 이동하고, 아래 안내대로 보정합니다.
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
                <span className="mt-1 flex items-start gap-1 text-[10px] leading-4 text-muted-foreground">
                  <ArrowRight className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                  <span>{issue.hint}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
