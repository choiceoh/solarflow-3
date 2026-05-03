import { describe, expect, it } from 'vitest';
import {
  buildChains,
  diffAuditFields,
  eventDeepLink,
  findChainHeadId,
  MAX_CHAIN_DEPTH,
  sanitizeAuditLogs,
} from './purchaseHistory';
import type { PurchaseOrder } from '@/types/procurement';

function po(id: string, parentId: string | null, contractDate?: string, mfgId = 'm1'): PurchaseOrder {
  return {
    po_id: id,
    company_id: 'c1',
    manufacturer_id: mfgId,
    contract_type: 'spot',
    contract_date: contractDate,
    status: 'contracted',
    parent_po_id: parentId ?? undefined,
  } as PurchaseOrder;
}

describe('findChainHeadId', () => {
  it('returns own id when there is no parent', () => {
    const a = po('A', null);
    const map = new Map([[a.po_id, a]]);
    expect(findChainHeadId(a, map)).toBe('A');
  });

  it('walks up the parent chain to find the head', () => {
    const a = po('A', null);
    const b = po('B', 'A');
    const c = po('C', 'B');
    const map = new Map([['A', a], ['B', b], ['C', c]]);
    expect(findChainHeadId(c, map)).toBe('A');
    expect(findChainHeadId(b, map)).toBe('A');
    expect(findChainHeadId(a, map)).toBe('A');
  });

  it('stops at the orphan if parent is missing from the map', () => {
    const orphan = po('B', 'GHOST');
    const map = new Map([['B', orphan]]);
    expect(findChainHeadId(orphan, map)).toBe('B');
  });

  it('breaks out of cycles instead of looping forever', () => {
    const a = po('A', 'B');
    const b = po('B', 'A');
    const map = new Map([['A', a], ['B', b]]);
    // Should terminate with one of the two — exact value not specified, just must not hang
    const head = findChainHeadId(a, map);
    expect(['A', 'B']).toContain(head);
  });

  it('respects MAX_CHAIN_DEPTH safety bound', () => {
    const map = new Map<string, PurchaseOrder>();
    const N = MAX_CHAIN_DEPTH + 5;
    for (let i = 0; i < N; i++) {
      const id = `P${i}`;
      const parent = i === 0 ? null : `P${i - 1}`;
      map.set(id, po(id, parent));
    }
    // Walking from the deepest node — should stop at MAX_CHAIN_DEPTH iterations,
    // which means it won't reach the actual head (P0) but won't hang either.
    const head = findChainHeadId(map.get(`P${N - 1}`)!, map);
    expect(head).toBeDefined();
    // Last reached node is N-1 - MAX_CHAIN_DEPTH = 4 (P4)
    expect(head).toBe(`P${N - 1 - MAX_CHAIN_DEPTH}`);
  });
});

describe('buildChains', () => {
  it('groups POs by parent chain and sorts variants by contract_date', () => {
    const a = po('A', null, '2026-01-01');
    const b = po('B', 'A', '2026-02-15');
    const c = po('C', 'B', '2026-03-30');
    const standalone = po('Z', null, '2026-04-01');
    const chains = buildChains([b, a, c, standalone]);
    expect(chains).toHaveLength(2);

    const chainA = chains.find((ch) => ch.chain_id === 'A')!;
    expect(chainA.pos.map((p) => p.po_id)).toEqual(['A', 'B', 'C']);
    expect(chainA.latest_contract_date).toBe('2026-03-30');

    const chainZ = chains.find((ch) => ch.chain_id === 'Z')!;
    expect(chainZ.pos).toHaveLength(1);
  });

  it('sorts chains by latest_contract_date desc', () => {
    const old = po('OLD', null, '2025-01-01');
    const recent = po('NEW', null, '2026-05-01');
    const chains = buildChains([old, recent]);
    expect(chains[0].chain_id).toBe('NEW');
    expect(chains[1].chain_id).toBe('OLD');
  });

  it('returns [] for empty input', () => {
    expect(buildChains([])).toEqual([]);
  });

  it('treats POs with missing parent as their own chain head', () => {
    const orphan = po('B', 'GHOST', '2026-01-01');
    const chains = buildChains([orphan]);
    expect(chains).toHaveLength(1);
    expect(chains[0].chain_id).toBe('B');
  });
});

describe('diffAuditFields', () => {
  it('returns [] when either side is null/undefined', () => {
    expect(diffAuditFields(null, { a: 1 })).toEqual([]);
    expect(diffAuditFields({ a: 1 }, null)).toEqual([]);
    expect(diffAuditFields(undefined, undefined)).toEqual([]);
  });

  it('returns [] when nothing meaningful changed', () => {
    expect(diffAuditFields({ status: 'draft' }, { status: 'draft' })).toEqual([]);
  });

  it('skips noisy meta fields', () => {
    const before = { status: 'draft', updated_at: '2026-01-01' };
    const after = { status: 'contracted', updated_at: '2026-02-02' };
    const diffs = diffAuditFields(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toContain('상태');
  });

  it('uses Korean labels for known fields', () => {
    const diffs = diffAuditFields({ payment_terms: '30/70' }, { payment_terms: '50/50' });
    expect(diffs[0]).toBe('결제조건: 30/70 → 50/50');
  });

  it('falls back to the raw key for unknown fields', () => {
    const diffs = diffAuditFields({ foo_bar: 'old' }, { foo_bar: 'new' });
    expect(diffs[0]).toBe('foo_bar: old → new');
  });

  it('renders null/undefined as em dash', () => {
    const diffs = diffAuditFields({ memo: null }, { memo: 'hello' });
    expect(diffs[0]).toBe('메모: — → hello');
  });

  it('truncates very long string values', () => {
    const longStr = 'a'.repeat(50);
    const diffs = diffAuditFields({ memo: '' }, { memo: longStr });
    expect(diffs[0]).toContain('…');
    expect(diffs[0]).not.toContain(longStr);
  });
});

describe('eventDeepLink', () => {
  it('builds /procurement?po_id=... for PO-bound events', () => {
    expect(eventDeepLink({ kind: 'po_create', po_id: 'P1' })).toBe('/procurement?po_id=P1');
    expect(eventDeepLink({ kind: 'variant_create', po_id: 'P2' })).toBe('/procurement?po_id=P2');
    expect(eventDeepLink({ kind: 'po_update', po_id: 'P3' })).toBe('/procurement?po_id=P3');
    expect(eventDeepLink({ kind: 'po_cancel', po_id: 'P4' })).toBe('/procurement?po_id=P4');
  });

  it('falls back to /procurement when po_id is missing', () => {
    expect(eventDeepLink({ kind: 'po_create' })).toBe('/procurement');
  });

  it('routes LC events to the lc tab', () => {
    expect(eventDeepLink({ kind: 'lc_open' })).toBe('/procurement?tab=lc');
    expect(eventDeepLink({ kind: 'lc_settle' })).toBe('/procurement?tab=lc');
  });

  it('routes BL/TT events to their respective tabs', () => {
    expect(eventDeepLink({ kind: 'bl_event' })).toBe('/procurement?tab=bl');
    expect(eventDeepLink({ kind: 'tt_send' })).toBe('/procurement?tab=tt');
  });

  it('returns null for price_change (no operating page since manual editing was retired)', () => {
    expect(eventDeepLink({ kind: 'price_change' })).toBeNull();
  });
});

describe('sanitizeAuditLogs', () => {
  it('returns [] for non-array input', () => {
    expect(sanitizeAuditLogs(null)).toEqual([]);
    expect(sanitizeAuditLogs(undefined)).toEqual([]);
    expect(sanitizeAuditLogs({})).toEqual([]);
    expect(sanitizeAuditLogs('error')).toEqual([]);
  });

  it('drops items missing required fields', () => {
    const raw = [
      { audit_id: 'a1', entity_type: 'purchase_orders', entity_id: 'p1', created_at: '2026-01-01T00:00:00Z' },
      { entity_type: 'purchase_orders', entity_id: 'p1', created_at: '2026-01-01T00:00:00Z' }, // no audit_id
      { audit_id: 'a3', entity_id: 'p1', created_at: '2026-01-01T00:00:00Z' }, // no entity_type
      { audit_id: 'a4', entity_type: 'x', created_at: '2026-01-01T00:00:00Z' }, // no entity_id
      { audit_id: 'a5', entity_type: 'x', entity_id: 'p1' }, // no created_at
      null,
      'string',
    ];
    const out = sanitizeAuditLogs(raw);
    expect(out).toHaveLength(1);
    expect(out[0].audit_id).toBe('a1');
  });

  it('defaults action to "update" if missing or non-string', () => {
    const raw = [
      { audit_id: 'a1', entity_type: 'x', entity_id: 'p1', created_at: '2026-01-01T00:00:00Z' },
      { audit_id: 'a2', entity_type: 'x', entity_id: 'p1', created_at: '2026-01-01T00:00:00Z', action: 42 },
    ];
    const out = sanitizeAuditLogs(raw);
    expect(out[0].action).toBe('update');
    expect(out[1].action).toBe('update');
  });

  it('coerces empty/non-string user fields to null', () => {
    const raw = [{
      audit_id: 'a1', entity_type: 'x', entity_id: 'p1', created_at: '2026-01-01T00:00:00Z',
      user_email: '', user_id: 123, note: null,
    }];
    const out = sanitizeAuditLogs(raw);
    expect(out[0].user_email).toBeNull();
    expect(out[0].user_id).toBeNull();
    expect(out[0].note).toBeNull();
  });

  it('preserves old_data/new_data as opaque unknown', () => {
    const raw = [{
      audit_id: 'a1', entity_type: 'x', entity_id: 'p1', created_at: '2026-01-01T00:00:00Z',
      old_data: { status: 'draft' }, new_data: { status: 'contracted' },
    }];
    const out = sanitizeAuditLogs(raw);
    expect(out[0].old_data).toEqual({ status: 'draft' });
    expect(out[0].new_data).toEqual({ status: 'contracted' });
  });
});
