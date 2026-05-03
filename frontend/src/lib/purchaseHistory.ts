// /purchase-history 페이지의 순수 로직 — 테스트 대상으로 컴포넌트와 분리.
import type { PurchaseOrder } from '@/types/procurement';

// 타임라인 이벤트 종류 — 페이지·테스트가 공유.
export type EventKind =
  | 'po_create'
  | 'variant_create'
  | 'price_change'
  | 'po_update'
  | 'po_cancel'
  | 'lc_open'
  | 'lc_settle'
  | 'bl_event'
  | 'tt_send';

export interface TimelineEventLike {
  kind: EventKind;
  po_id?: string;
}

// 이벤트 클릭 시 운영 페이지로 점프할 URL.
// PO 관련은 ?po_id=...로 PODetailView 자동 펼침. 그 외는 탭 단위.
// price_change는 운영 진입점 없음 (Q9=Z 결정대로 단가 편집 폐기) → null 반환 = 비활성.
export function eventDeepLink(evt: TimelineEventLike): string | null {
  switch (evt.kind) {
    case 'po_create':
    case 'variant_create':
    case 'po_update':
    case 'po_cancel':
      return evt.po_id ? `/procurement?po_id=${evt.po_id}` : '/procurement';
    case 'lc_open':
    case 'lc_settle':
      return '/procurement?tab=lc';
    case 'bl_event':
      return '/procurement?tab=bl';
    case 'tt_send':
      return '/procurement?tab=tt';
    case 'price_change':
      return null;
  }
}

export interface Chain {
  chain_id: string;
  head: PurchaseOrder;
  pos: PurchaseOrder[]; // [head, ...variants in contract_date asc]
  manufacturer_id: string;
  manufacturer_name?: string;
  latest_contract_date?: string;
}

// 변경계약 체인의 head(원계약) 찾기. parent_po_id를 따라 위로 올라감.
// Cycle/depth 보호: DB에 무결성 제약이 없을 수 있으므로, 1) 방문 추적으로 사이클 즉시 차단,
// 2) 32 깊이 안전선 — 운영상 변경계약 32회 이상은 비현실적이므로 그 이상은 무한루프로 간주.
export const MAX_CHAIN_DEPTH = 32;
export function findChainHeadId(po: PurchaseOrder, byId: Map<string, PurchaseOrder>): string {
  let cur = po;
  const visited = new Set<string>([cur.po_id]);
  for (let i = 0; i < MAX_CHAIN_DEPTH && cur.parent_po_id; i++) {
    const parent = byId.get(cur.parent_po_id);
    if (!parent || visited.has(parent.po_id)) break;
    visited.add(parent.po_id);
    cur = parent;
  }
  return cur.po_id;
}

export function buildChains(pos: PurchaseOrder[]): Chain[] {
  if (pos.length === 0) return [];
  const byId = new Map(pos.map((p) => [p.po_id, p]));
  const groups = new Map<string, PurchaseOrder[]>();
  for (const po of pos) {
    const headId = findChainHeadId(po, byId);
    const arr = groups.get(headId) ?? [];
    arr.push(po);
    groups.set(headId, arr);
  }
  const chains: Chain[] = [];
  for (const [headId, members] of groups) {
    const head = byId.get(headId);
    if (!head) continue;
    const sorted = [...members].sort((a, b) => (a.contract_date ?? '').localeCompare(b.contract_date ?? ''));
    const latest = sorted.reduce<string | undefined>((acc, p) => {
      if (!p.contract_date) return acc;
      return !acc || p.contract_date > acc ? p.contract_date : acc;
    }, undefined);
    chains.push({
      chain_id: headId,
      head,
      pos: sorted,
      manufacturer_id: head.manufacturer_id,
      manufacturer_name: head.manufacturer_name,
      latest_contract_date: latest,
    });
  }
  chains.sort((a, b) => (b.latest_contract_date ?? '').localeCompare(a.latest_contract_date ?? ''));
  return chains;
}

// audit_logs API 응답에서 신뢰할 수 있는 필드만 골라낸 좁은 형태.
// 백엔드 스키마가 바뀌거나 손상된 row가 섞여 와도 페이지 전체가 깨지지 않게 한다.
export interface SafeAuditLog {
  audit_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  user_id: string | null;
  user_email: string | null;
  note: string | null;
  created_at: string;
  old_data: unknown;
  new_data: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// 응답이 배열이 아니거나, 개별 row에 필수 필드(audit_id/entity_type/entity_id/created_at)가
// 없으면 그 row만 버린다. 빈 배열이면 빈 배열을 반환.
export function sanitizeAuditLogs(raw: unknown): SafeAuditLog[] {
  if (!Array.isArray(raw)) return [];
  const out: SafeAuditLog[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const auditId = asString(r.audit_id);
    const entityType = asString(r.entity_type);
    const entityId = asString(r.entity_id);
    const createdAt = asString(r.created_at);
    if (!auditId || !entityType || !entityId || !createdAt) continue;
    out.push({
      audit_id: auditId,
      entity_type: entityType,
      entity_id: entityId,
      action: asString(r.action) ?? 'update',
      user_id: asString(r.user_id),
      user_email: asString(r.user_email),
      note: asString(r.note),
      created_at: createdAt,
      old_data: r.old_data,
      new_data: r.new_data,
    });
  }
  return out;
}

// 사람이 읽지 않는 메타 필드 — diff에서 노이즈 제거
export const AUDIT_DIFF_SKIP_FIELDS = new Set(['updated_at', 'created_at', 'po_id', 'company_id']);
export const AUDIT_DIFF_FIELD_LABEL: Record<string, string> = {
  status: '상태',
  contract_type: '계약유형',
  contract_date: '계약일',
  payment_terms: '결제조건',
  incoterms: '선적조건',
  total_qty: '수량',
  total_mw: '용량',
  manufacturer_id: '제조사',
  parent_po_id: '원계약',
  memo: '메모',
  po_number: 'PO번호',
};

function formatDiffValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'string') return v.length > 24 ? `${v.slice(0, 24)}…` : v;
  return JSON.stringify(v);
}

// audit_logs.old_data/new_data를 비교하여 변경 필드만 "field: old → new" 문자열 배열로 반환.
export function diffAuditFields(oldData: unknown, newData: unknown): string[] {
  if (!oldData || !newData || typeof oldData !== 'object' || typeof newData !== 'object') return [];
  const oldObj = oldData as Record<string, unknown>;
  const newObj = newData as Record<string, unknown>;
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const diffs: string[] = [];
  for (const k of keys) {
    if (AUDIT_DIFF_SKIP_FIELDS.has(k)) continue;
    const before = oldObj[k];
    const after = newObj[k];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const label = AUDIT_DIFF_FIELD_LABEL[k] ?? k;
    diffs.push(`${label}: ${formatDiffValue(before)} → ${formatDiffValue(after)}`);
  }
  return diffs;
}
