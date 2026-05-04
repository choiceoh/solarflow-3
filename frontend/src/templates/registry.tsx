// 메타 인프라 잔존물 — D-120 결정으로 GUI 메타 편집기·v2 페이지·MetaForm/ListScreen은 모두 제거됐다.
// 본 registry는 BLDetailView가 사용하는 MetaDetail 컴포넌트가 동작하도록 필요한 최소한만 남긴다:
//   - cellRenderers: bl_shipment_detail config가 참조하는 PO/LC 링크·통화 라벨
//   - detailDataHooks: useBLShipmentDetail (BL 단건 조회)
//   - contentBlocks: BL 상태 배지·편집 버튼·메모 블록
//   - enumDictionaries: INBOUND_TYPE_LABEL (bl_shipment.ts 의 enum 컬럼용)
//   - getFieldValue: 점 표기 필드 접근 헬퍼

import { useEffect } from 'react';
import InboundStatusBadge from '@/components/inbound/InboundStatusBadge';
import { useBLDetail } from '@/hooks/useInbound';
import { INBOUND_TYPE_LABEL } from '@/types/inbound';
import type { BLShipment, BLStatus } from '@/types/inbound';
import type { CellRenderer, DetailComponent, ContentBlock, ActionHandler } from './types';
import MetaDetail from './MetaDetail';
import BLDetailView from '@/components/inbound/BLDetailView';
import OutboundDetailView from '@/components/outbound/OutboundDetailView';
import blShipmentDetailConfig from '@/config/details/bl_shipment';

// ─── Cell renderers ────────────────────────────────────────────────────────
// bl_shipment.ts detail config 가 참조하는 3종만 유지.
export const cellRenderers: Record<string, CellRenderer> = {
  bl_po_link: (_v, row) => {
    const r = row as BLShipment;
    if (!r.po_id) return <span>—</span>;
    return (
      <button
        className="text-sm text-primary underline"
        onClick={() => { window.location.href = `/procurement?po_id=${r.po_id}`; }}
      >
        {r.po_number ?? r.po_id.slice(0, 8)}
      </button>
    );
  },
  bl_lc_link: (_v, row) => {
    const r = row as BLShipment;
    if (!r.lc_id) return <span>—</span>;
    return (
      <button
        className="text-sm text-primary underline"
        onClick={() => { window.location.href = `/procurement?tab=lc&lc_id=${r.lc_id}`; }}
      >
        {r.lc_number ?? r.lc_id.slice(0, 8)}
      </button>
    );
  },
  bl_currency_label: (v) => <span>{v === 'USD' ? 'USD (달러)' : 'KRW (원)'}</span>,
};

// ─── Detail data hooks ─────────────────────────────────────────────────────
// MetaDetail 의 source.hookId 가 참조. 현재는 BL 입고 1종만.
export type DetailDataHook = (id: string) => { data: unknown; loading: boolean };

interface RQLikeResult<T> {
  data: T | null | undefined;
  loading: boolean;
}

function adaptDetailHook<T>(r: RQLikeResult<T>): { data: unknown; loading: boolean } {
  return { data: r.data ?? null, loading: r.loading };
}

export const detailDataHooks: Record<string, DetailDataHook> = {
  useBLShipmentDetail: (id) => adaptDetailHook(useBLDetail(id)),
};

// ─── Content blocks ────────────────────────────────────────────────────────
// MetaDetail 의 contentBlock.blockId 가 참조. BL detail의 상태 배지·편집 버튼·메모 블록.
export const contentBlocks: Record<string, ContentBlock> = {
  bl_status_badge: ({ items }) => {
    const r = items[0] as BLShipment;
    return <InboundStatusBadge status={r.status as BLStatus} />;
  },
  bl_edit_button: () => (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded border border-input bg-background px-2.5 py-1 text-xs hover:bg-muted"
      onClick={() => actionHandlers.bl_detail_edit?.()}
    >
      ✏️ 수정
    </button>
  ),
  bl_memo_block: ({ items }) => {
    const r = items[0] as BLShipment;
    if (!r.memo) return null;
    return <p className="whitespace-pre-wrap text-sm text-foreground">{r.memo}</p>;
  },
};

// ─── Action handlers ───────────────────────────────────────────────────────
// BLDetailView 가 자기 편집 모드 진입을 등록한다.
export const actionHandlers: Record<string, ActionHandler> = {};

export function useActionHandler(id: string, handler: ActionHandler): void {
  useEffect(() => {
    actionHandlers[id] = handler;
    return () => { delete actionHandlers[id]; };
  }, [id, handler]);
}

// ─── Detail components ─────────────────────────────────────────────────────
// 도메인 화면이 직접 렌더하는 detail 진입점. (메타 v2 페이지가 사라진 뒤 거의 사용처 없음 —
// 현재는 outbound 도메인에서 onRowClick → 'outbound' detail로 OutboundDetailView 호출 시만.)
export const detailComponents: Record<string, DetailComponent> = {
  outbound: ((props) => <OutboundDetailView outboundId={props.id} onBack={props.onBack} />) as DetailComponent,
  bl: ((props) => <BLDetailView blId={props.id} onBack={props.onBack} />) as DetailComponent,
  bl_shipment: ((props) => <MetaDetail config={blShipmentDetailConfig} id={props.id} onBack={props.onBack} />) as DetailComponent,
};

// ─── Enum dictionaries ─────────────────────────────────────────────────────
// MetaDetail 의 field.enumKey 가 참조. bl_shipment.ts 가 inbound_type 컬럼에 사용.
export const enumDictionaries: Record<string, Record<string, string>> = {
  INBOUND_TYPE_LABEL: INBOUND_TYPE_LABEL as Record<string, string>,
};

// ─── 점 표기 필드 접근 ──────────────────────────────────────────────────────
export function getFieldValue(row: Record<string, unknown>, key: string): unknown {
  if (!key.includes('.')) return row[key];
  return key.split('.').reduce<unknown>((acc, k) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[k];
  }, row);
}

// ─── Formatters ────────────────────────────────────────────────────────────
import { formatDate, formatNumber, formatKw } from '@/lib/utils';

export function applyFormatter(formatter: string | undefined, value: unknown): string {
  if (value == null || value === '') return '';
  switch (formatter) {
    case 'date': return formatDate(value as string);
    case 'number': return formatNumber(value as number);
    case 'kw': return formatKw(value as number);
    case 'currency': return formatNumber(value as number);
    default: return String(value);
  }
}

