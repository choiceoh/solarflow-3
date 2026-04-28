// 결재안 데이터 패칭 훅 (Step 30)
// 비유: 결재안에 필요한 데이터를 각 API에서 모아오는 배달부

import { useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import type { LCRecord, PurchaseOrder, POLineItem, TTRemittance } from '@/types/procurement';
import type { Expense } from '@/types/customs';
import type { Outbound, Sale } from '@/types/outbound';
import type { Manufacturer } from '@/types/masters';
import type {
  Type1Data, Type2Data, Type3Data, Type4Data, Type5Data, Type6Data,
} from '@/types/approval';
import { EXPENSE_APPROVAL_LABEL } from '@/types/approval';
import { moduleLabel, shortMfgName } from '@/lib/utils';

// 유형 1: 수입 모듈대금
export function useType1() {
  const [data, setData] = useState<Type1Data | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async (lcId: string) => {
    setLoading(true);
    try {
      const lc = await fetchWithAuth<LCRecord>(`/api/v1/lcs/${lcId}`);
      const po = await fetchWithAuth<PurchaseOrder>(`/api/v1/pos/${lc.po_id}`);
      const lines = await fetchWithAuth<POLineItem[]>(`/api/v1/pos/${lc.po_id}/lines`);

      // LC 수수료 계산 (Rust 엔진)
      let lcFee = 0;
      try {
        const feeResult = await fetchWithAuth<{ total_fee_krw: number }>('/api/v1/calc/lc-fee', {
          method: 'POST',
          body: JSON.stringify({ lc_id: lcId }),
        });
        lcFee = feeResult.total_fee_krw ?? 0;
      } catch {
        // 수수료 계산 실패 시 0 사용
      }

      const exchangeRate = lc.amount_usd > 0 ? (lc.amount_usd * 1350) / lc.amount_usd : 1350; // 기본 환율
      // BL에서 실제 환율 가져오기 시도
      let actualRate = exchangeRate;
      try {
        const bls = await fetchWithAuth<Array<{ exchange_rate?: number }>>(`/api/v1/bls?po_id=${lc.po_id}`);
        if (bls.length > 0 && bls[0].exchange_rate) {
          actualRate = bls[0].exchange_rate;
        }
      } catch { /* 기본값 사용 */ }

      const amountKrw = lc.amount_usd * actualRate;
      const vat = amountKrw * 0.1; // 수입통관 부가세 = CIF × 0.1
      const telegraph = 25000;
      const totalKrw = amountKrw + vat + lcFee + telegraph;

      setData({
        lcId,
        poId: lc.po_id,
        bankName: lc.bank_name ?? '',
        lcNumber: lc.lc_number ?? '',
        poNumber: po.po_number ?? '',
        manufacturerName: shortMfgName(po.manufacturer_name),
        lines: lines.map((l) => ({
          productName: `${moduleLabel(po.manufacturer_name, l.spec_wp)} · ${l.product_name ?? l.product_code ?? ''}`,
          quantity: l.quantity,
          unitPriceUsd: l.unit_price_usd ?? 0,
          totalUsd: l.total_amount_usd ?? 0,
          specWp: l.spec_wp ?? 0,
        })),
        lcAmountUsd: lc.amount_usd,
        exchangeRate: actualRate,
        amountKrw,
        vat,
        lcFee,
        telegraph,
        totalKrw,
        etd: undefined,
        eta: undefined,
        usanceDays: lc.usance_days,
        maturityDate: lc.maturity_date,
        paymentTerms: po.payment_terms,
        incoterms: po.incoterms,
      });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : '데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, generate };
}

// 유형 2: CIF 비용/제경비
export function useType2() {
  const [data, setData] = useState<Type2Data | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async (blId: string) => {
    setLoading(true);
    try {
      // BL 응답: 백엔드 평탄 + 중첩 양쪽 형태 모두 수용 (line_items 포함 확장 필드)
      type BLLine = {
        quantity: number;
        spec_wp?: number;
        product_name?: string;
        product_code?: string;
        products?: { spec_wp?: number; product_name?: string };
      };
      type BLDetail = {
        bl_number?: string;
        manufacturer_name?: string;
        manufacturer_id?: string;
        manufacturers?: { name_kr?: string };
        etd?: string;
        eta?: string;
        port?: string;
        line_items?: BLLine[];
      };
      const bl = await fetchWithAuth<BLDetail>(`/api/v1/bls/${blId}`);
      const expenses = await fetchWithAuth<Expense[]>(`/api/v1/expenses?bl_id=${blId}`);
      let manufacturerName = bl.manufacturer_name ?? bl.manufacturers?.name_kr ?? '';
      if (!manufacturerName && bl.manufacturer_id) {
        try {
          const mfg = await fetchWithAuth<Manufacturer>(`/api/v1/manufacturers/${bl.manufacturer_id}`);
          manufacturerName = mfg.short_name?.trim() || mfg.name_kr;
        } catch { /* 제조사명은 비워둠 */ }
      }

      // CIF 비용 유형만 필터 (lc_fee, lc_acceptance, telegraph 제외)
      const cifTypes = ['dock_charge', 'shuttle', 'customs_fee', 'transport', 'storage', 'handling', 'surcharge'];
      const filtered = expenses.filter((e) => cifTypes.includes(e.expense_type));

      const expItems = filtered.map((e) => ({
        type: e.expense_type,
        label: (EXPENSE_APPROVAL_LABEL as Record<string, string>)[e.expense_type] ?? e.expense_type,
        amount: e.amount,
        vat: e.vat ?? 0,
        total: e.total,
      }));

      const totalAmount = expItems.reduce((s, e) => s + e.amount, 0);
      const totalVat = expItems.reduce((s, e) => s + e.vat, 0);
      const grandTotal = expItems.reduce((s, e) => s + e.total, 0);

      // 라인아이템 요약
      const lineItems = bl.line_items ?? [];
      const productSummary = lineItems
        .map((l) => {
          const spec = l.products?.spec_wp ?? l.spec_wp;
          const name = l.products?.product_name ?? l.product_name ?? l.product_code ?? '';
          return `${moduleLabel(manufacturerName, spec)} · ${name} ${l.quantity}장`;
        })
        .join(', ');

      setData({
        blId,
        blNumber: bl.bl_number ?? '',
        manufacturerName: shortMfgName(manufacturerName),
        contractInfo: bl.bl_number ?? '',
        productSummary,
        etd: bl.etd,
        eta: bl.eta,
        port: bl.port,
        expenses: expItems,
        totalAmount,
        totalVat,
        grandTotal,
      });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : '데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, generate };
}

// 유형 3: 판매 세금계산서
export function useType3() {
  const [data, setData] = useState<Type3Data | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async (customerId: string, customerName: string, from: string, to: string) => {
    setLoading(true);
    try {
      const sales = await fetchWithAuth<Sale[]>(`/api/v1/sales?customer_id=${customerId}`);

      // outbound_id로 outbound 정보 가져오기
      const outboundIds = [...new Set(sales.map((s) => s.outbound_id).filter((id): id is string => !!id))];
      const outboundMap = new Map<string, Outbound>();
      for (const obId of outboundIds) {
        try {
          const ob = await fetchWithAuth<Outbound>(`/api/v1/outbounds/${obId}`);
          outboundMap.set(obId, ob);
        } catch { /* skip */ }
      }

      // 기간 필터 (outbound_date 기준)
      const items = sales
        .filter((s) => {
          if (!s.outbound_id) return false;
          const ob = outboundMap.get(s.outbound_id);
          if (!ob) return false;
          if (from && ob.outbound_date < from) return false;
          if (to && ob.outbound_date > to) return false;
          return true;
        })
        .map((s) => {
          const ob = s.outbound_id ? outboundMap.get(s.outbound_id) : undefined;
          return {
            siteName: ob?.site_name ?? '-',
            productName: ob?.product_name ?? '',
            quantity: ob?.quantity ?? 0,
            unitPriceEa: s.unit_price_ea ?? 0,
            unitPriceWp: s.unit_price_wp,
            supplyAmount: s.supply_amount ?? 0,
            spareQty: ob?.spare_qty ?? 0,
          };
        });

      const totalSupply = items.reduce((s, i) => s + i.supplyAmount, 0);
      const totalVat = totalSupply * 0.1;

      setData({
        customerName,
        from,
        to,
        items,
        totalSupply,
        totalVat,
        grandTotal: totalSupply + totalVat,
      });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : '데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, generate };
}

// 유형 4: 운송비 월정산
export function useType4() {
  const [data, setData] = useState<Type4Data | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const generate = useCallback(async (vendor: string, month: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCompanyId) params.set('company_id', selectedCompanyId);

      const allExpenses = await fetchWithAuth<Expense[]>(`/api/v1/expenses?${params}`);
      const filtered = allExpenses.filter(
        (e) => e.expense_type === 'transport' && e.vendor === vendor && e.month === month,
      );

      const expenses = filtered.map((e) => ({
        blNumber: e.bl_number,
        amount: e.amount,
        vat: e.vat ?? 0,
        total: e.total,
        memo: e.memo,
      }));

      const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
      const totalVat = expenses.reduce((s, e) => s + e.vat, 0);

      setData({
        vendor,
        month,
        expenses,
        totalAmount,
        totalVat,
        grandTotal: totalAmount + totalVat,
        manualDetails: '',
      });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : '데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  return { data, setData, loading, generate };
}

// 유형 5: 계약금 지출
export function useType5() {
  const [data, setData] = useState<Type5Data | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async (poId: string, depositRate: number, installments: number) => {
    setLoading(true);
    try {
      const po = await fetchWithAuth<PurchaseOrder>(`/api/v1/pos/${poId}`);
      const lines = await fetchWithAuth<POLineItem[]>(`/api/v1/pos/${poId}/lines`);
      const tts = await fetchWithAuth<TTRemittance[]>(`/api/v1/tts?po_id=${poId}`);

      const totalUsd = lines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);

      // 환율: TT 이력에서 가져오거나 기본값
      let exchangeRate = 1350;
      const completedTT = tts.find((t) => t.exchange_rate && t.exchange_rate > 0);
      if (completedTT?.exchange_rate) exchangeRate = completedTT.exchange_rate;

      const totalKrw = totalUsd * exchangeRate;
      const depositAmount = totalKrw * (depositRate / 100);
      const paidTotal = tts
        .filter((t) => t.status === 'completed')
        .reduce((s, t) => s + (t.amount_krw ?? 0), 0);

      setData({
        poId,
        poNumber: po.po_number ?? '',
        manufacturerName: shortMfgName(po.manufacturer_name),
        contractType: po.contract_type,
        contractDate: po.contract_date,
        lines: lines.map((l) => ({
          productName: `${moduleLabel(po.manufacturer_name, l.spec_wp)} · ${l.product_name ?? l.product_code ?? ''}`,
          quantity: l.quantity,
          unitPriceUsd: l.unit_price_usd ?? 0,
          totalUsd: l.total_amount_usd ?? 0,
        })),
        totalUsd,
        exchangeRate,
        totalKrw,
        depositRate,
        depositAmount,
        ttHistory: tts
          .filter((t) => t.status === 'completed')
          .map((t) => ({
            date: t.remit_date ?? '',
            amountUsd: t.amount_usd,
            amountKrw: t.amount_krw ?? 0,
            purpose: t.purpose ?? '',
          })),
        paidTotal,
        remaining: depositAmount - paidTotal,
        installments,
        paymentTerms: po.payment_terms,
        incoterms: po.incoterms,
      });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : '데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, generate };
}

// 유형 6: 공사 현장 운송료
export function useType6() {
  const [data, setData] = useState<Type6Data | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const generate = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ usage_category: 'construction' });
      if (selectedCompanyId) params.set('company_id', selectedCompanyId);

      const outbounds = await fetchWithAuth<Outbound[]>(`/api/v1/outbounds?${params}`);
      const filtered = outbounds.filter((ob) => {
        if (from && ob.outbound_date < from) return false;
        if (to && ob.outbound_date > to) return false;
        return true;
      });

      setData({
        from,
        to,
        items: filtered.map((ob) => ({
          siteName: ob.site_name ?? '-',
          productName: ob.product_name ?? '',
          quantity: ob.quantity,
          transportCost: 0, // 수동 입력
          memo: '',
        })),
        totalTransport: 0,
      });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : '데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  return { data, setData, loading, generate };
}
