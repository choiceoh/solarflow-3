// 전체 컬렉션 데이터 내보내기 (관리자 전용)
// 양식(빈 입력칸) 과 분리 — 이 파일은 기존 거래 데이터를 dump 한다.
// 백엔드 GET /api/v1/export/all (g.AdminOnly) 가 모든 시트를 한 응답으로 묶어 내려준다.

import { fetchWithAuth } from '@/lib/api';

interface SheetWritable {
  addRow(values: unknown[]): { height?: number };
  getColumn(idx: number): { width?: number };
}
interface WorkbookWritable {
  creator?: string;
  created?: Date;
  addWorksheet(name: string): SheetWritable;
  xlsx: { writeBuffer(): Promise<ArrayBuffer> };
}

interface FullDump {
  companies: unknown[];
  orders: unknown[];
  outbounds: unknown[];
  sales: unknown[];
  receipts: unknown[];
  bls: unknown[];
  declarations: unknown[];
  expenses: unknown[];
}

const SHEET_ORDER: Array<{ name: string; key: keyof FullDump }> = [
  { name: '법인', key: 'companies' },
  { name: '수주', key: 'orders' },
  { name: '출고', key: 'outbounds' },
  { name: '매출', key: 'sales' },
  { name: '수금', key: 'receipts' },
  { name: '입고', key: 'bls' },
  { name: '면장', key: 'declarations' },
  { name: '부대비용', key: 'expenses' },
];

function flattenValue(v: unknown): unknown {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function collectKeys(rows: unknown[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === 'object') {
      Object.keys(row).forEach((k) => set.add(k));
    }
  }
  return Array.from(set);
}

export async function generateUnifiedExport(): Promise<void> {
  const ExcelJS = await import('exceljs');
  const { saveAs } = await import('file-saver');

  const dump = await fetchWithAuth<FullDump>('/api/v1/export/all');

  const workbook = new ExcelJS.Workbook() as unknown as WorkbookWritable;
  workbook.creator = 'SolarFlow';
  workbook.created = new Date();

  for (const { name, key } of SHEET_ORDER) {
    const sheet = workbook.addWorksheet(name);
    const rows = Array.isArray(dump[key]) ? dump[key] : [];
    if (rows.length === 0) {
      sheet.addRow(['(데이터 없음)']);
      continue;
    }
    const cols = collectKeys(rows);
    sheet.addRow(cols);
    for (const row of rows) {
      const obj = (row ?? {}) as Record<string, unknown>;
      sheet.addRow(cols.map((k) => flattenValue(obj[k])));
    }
    cols.forEach((_, i) => {
      const col = sheet.getColumn(i + 1);
      if (!col.width) col.width = 16;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  saveAs(blob, `SolarFlow_전체데이터_${today}.xlsx`);
}
