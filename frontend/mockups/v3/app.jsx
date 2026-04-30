/* global React, ReactDOM, DesignCanvas, DCSection, DCArtboard, LoginA,
   ScreenInv_B, ScreenPO_B, ScreenLC_B, ScreenBL_B, ScreenSO_B,
   ScreenDash_B, ScreenOB_B, ScreenAR_B, ScreenBank_B, ScreenAna_B */

const { createRoot } = ReactDOM;

function App() {
  return (
    <DesignCanvas>
      <DCSection id="login" title="01 · 로그인 (A 스타일)" subtitle="터미널 분할 — 좌측 브랜드 / 우측 폼">
        <DCArtboard id="login-a" label="로그인" width={1280} height={780}>
          <LoginA />
        </DCArtboard>
      </DCSection>

      <DCSection id="main" title="02 · 핵심 화면 (B · Command Center)" subtitle="다크 사이드바 + 메인 + 우측 워치리스트 레일">
        <DCArtboard id="dash" label="대시보드" width={1480} height={900}>
          <ScreenDash_B />
        </DCArtboard>
        <DCArtboard id="inv" label="가용재고" width={1480} height={900}>
          <ScreenInv_B />
        </DCArtboard>
      </DCSection>

      <DCSection id="buy" title="03 · 구매 / 입고" subtitle="P/O · L/C · B/L 흐름">
        <DCArtboard id="po" label="P/O 발주 관리" width={1480} height={900}>
          <ScreenPO_B />
        </DCArtboard>
        <DCArtboard id="lc" label="L/C 개설" width={1480} height={900}>
          <ScreenLC_B />
        </DCArtboard>
        <DCArtboard id="bl" label="B/L · 입고 진행" width={1480} height={900}>
          <ScreenBL_B />
        </DCArtboard>
      </DCSection>

      <DCSection id="sell" title="04 · 판매 / 수금" subtitle="수주 · 출고 · 채권 흐름">
        <DCArtboard id="so" label="수주 관리" width={1480} height={900}>
          <ScreenSO_B />
        </DCArtboard>
        <DCArtboard id="ob" label="출고 / 판매" width={1480} height={900}>
          <ScreenOB_B />
        </DCArtboard>
        <DCArtboard id="ar" label="수금 관리" width={1480} height={900}>
          <ScreenAR_B />
        </DCArtboard>
      </DCSection>

      <DCSection id="status" title="05 · 현황 / 분석" subtitle="여신 · 매출 임원용 화면">
        <DCArtboard id="bnk" label="L/C 한도 현황" width={1480} height={900}>
          <ScreenBank_B />
        </DCArtboard>
        <DCArtboard id="an" label="매출 분석" width={1480} height={900}>
          <ScreenAna_B />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

createRoot(document.getElementById('root')).render(<App />);
