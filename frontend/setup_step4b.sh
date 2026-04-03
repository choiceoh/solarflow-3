#!/bin/bash
# ============================================================
# SolarFlow 3.0 — Step 4-B: 나머지 마스터 페이지 구현
# 터미널 1에서 실행: bash setup_step4b.sh
# ============================================================

set -e

FRONTEND_DIR=~/solarflow-3/frontend
cd "$FRONTEND_DIR"

echo "🔧 Step 4-B 시작: 나머지 4개 마스터 페이지 구현"
echo "================================================"

# ── 1. 품번 관리 페이지 ──
echo "📄 Products.tsx 생성..."
cat > src/pages/Products.tsx << 'TSEOF'
import { useEffect, useState } from 'react';
import { masterApi } from '../lib/api';

export default function Products() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    masterApi.products.list()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>;

  if (items.length === 0) {
    return (
      <div className="p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">📦 품번 관리</h2>
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">등록된 품번이 없습니다</p>
          <p className="text-gray-300 text-sm">품번 데이터는 초기 데이터 이관 시 일괄 등록됩니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">📦 품번 관리</h2>
        <span className="text-sm text-gray-400">{items.length}개</span>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">품번코드</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">품명</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">제조사</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Wp</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">가로(mm)</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">세로(mm)</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">시리즈</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">상태</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.product_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-mono text-blue-600">{p.product_code}</td>
                <td className="px-4 py-3 text-sm text-gray-800">{p.product_name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.manufacturers?.name_kr || '-'}</td>
                <td className="px-4 py-3 text-sm text-right font-medium text-gray-800">{p.spec_wp}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{p.module_width_mm?.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{p.module_height_mm?.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.series_name || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                    p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {p.is_active ? '활성' : '비활성'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
TSEOF

# ── 2. 거래처 관리 페이지 ──
echo "📄 Partners.tsx 생성..."
cat > src/pages/Partners.tsx << 'TSEOF'
import { useEffect, useState } from 'react';
import { masterApi } from '../lib/api';

const typeLabel: Record<string, string> = { supplier: '공급사', customer: '고객', both: '양방향' };
const typeColor: Record<string, string> = { supplier: 'bg-blue-100 text-blue-700', customer: 'bg-green-100 text-green-700', both: 'bg-purple-100 text-purple-700' };

export default function Partners() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = filter ? `type=${filter}` : '';
    masterApi.partners.list(params)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [filter]);

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">🤝 거래처 관리</h2>
        <div className="flex gap-2">
          {['', 'supplier', 'customer', 'both'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === '' ? '전체' : typeLabel[f]}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">등록된 거래처가 없습니다</p>
          <p className="text-gray-300 text-sm">거래처 데이터는 초기 데이터 이관 시 등록됩니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">거래처명</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">유형</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">ERP코드</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">결제조건</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">담당자</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">연락처</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.partner_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.partner_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${typeColor[p.partner_type] || 'bg-gray-100 text-gray-500'}`}>
                      {typeLabel[p.partner_type] || p.partner_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-500">{p.erp_code || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.payment_terms || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.contact_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.contact_phone || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
TSEOF

# ── 3. 창고/장소 관리 페이지 ──
echo "📄 Warehouses.tsx 생성..."
cat > src/pages/Warehouses.tsx << 'TSEOF'
import { useEffect, useState } from 'react';
import { masterApi } from '../lib/api';

const typeLabel: Record<string, string> = { port: '항구', factory: '공장', vendor: '업체공장' };
const typeColor: Record<string, string> = { port: 'bg-blue-100 text-blue-700', factory: 'bg-amber-100 text-amber-700', vendor: 'bg-teal-100 text-teal-700' };

export default function Warehouses() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = filter ? `type=${filter}` : '';
    masterApi.warehouses.list(params)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [filter]);

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">🏗️ 창고/장소 관리</h2>
        <div className="flex gap-2">
          {['', 'port', 'factory', 'vendor'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === '' ? '전체' : typeLabel[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">창고코드</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">창고명</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">유형</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">장소코드</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">장소명</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.warehouse_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-mono text-blue-600">{w.warehouse_code}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{w.warehouse_name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${typeColor[w.warehouse_type] || 'bg-gray-100'}`}>
                    {typeLabel[w.warehouse_type] || w.warehouse_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-mono text-gray-500">{w.location_code}</td>
                <td className="px-4 py-3 text-sm text-gray-800">{w.location_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
TSEOF

# ── 4. 은행 관리 페이지 ──
echo "📄 Banks.tsx 생성..."
cat > src/pages/Banks.tsx << 'TSEOF'
import { useEffect, useState } from 'react';
import { masterApi } from '../lib/api';

export default function Banks() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    masterApi.banks.list()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>;

  const totalLimit = items.reduce((sum, b) => sum + (b.lc_limit_usd || 0), 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">🏦 은행 관리</h2>
        <div className="text-sm text-gray-500">
          총 LC 한도: <span className="font-bold text-gray-800">${totalLimit.toLocaleString()}</span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">은행명</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">법인</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">LC 한도(USD)</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">개설수수료</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">인수수수료</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">계산방식</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">비고</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.bank_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{b.bank_name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{b.companies?.company_name || '-'}</td>
                <td className="px-4 py-3 text-sm text-right font-medium text-gray-800">
                  ${b.lc_limit_usd?.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">
                  {b.opening_fee_rate ? (b.opening_fee_rate * 100).toFixed(2) + '%' : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">
                  {b.acceptance_fee_rate ? (b.acceptance_fee_rate * 100).toFixed(2) + '%' : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{b.fee_calc_method || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-400 max-w-48 truncate">{b.memo || '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td className="px-4 py-3 text-sm font-bold text-gray-700">합계</td>
              <td className="px-4 py-3 text-sm text-gray-500">{items.length}개 은행</td>
              <td className="px-4 py-3 text-sm text-right font-bold text-blue-700">
                ${totalLimit.toLocaleString()}
              </td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
TSEOF

# ── 5. 빌드 테스트 ──
echo ""
echo "🔨 빌드 테스트..."
if npm run build; then
    echo ""
    echo "================================================"
    echo "✅ Step 4-B 완료! 빌드 성공!"
    echo "================================================"
    echo ""
    echo "다음 명령어를 순서대로 실행하세요:"
    echo '  git add -A'
    echo '  git commit -m "feat: Step 4-B — 마스터 6개 페이지 전체 완성"'
    echo '  git push origin main'
    echo '  npx wrangler pages deploy dist --project-name=solarflow-3-frontend'
else
    echo ""
    echo "❌ 빌드 실패 — 에러 메시지를 Claude에게 보내주세요"
fi
