// useScrollRestoration — 메인 페이지 스크롤 컨테이너의 위치를 location 별로 기억해
// 뒤로/앞으로 가기 (POP) 시 같은 위치로 복원한다.
//
// 동작:
//   - 라우트가 변할 때 직전 location.key 의 scrollTop 을 sessionStorage 에 저장
//   - 새 라우트가 POP 이면 해당 key 의 저장값으로 복원, 그 외 (PUSH/REPLACE) 는 맨 위로
//
// React Router v6 의 BrowserRouter 는 기본 스크롤 복원이 없다 (data router 만 ScrollRestoration 컴포넌트 제공).
// 대신 location.key 가 history entry 별로 고유라 이를 storage key 로 쓰면 신뢰성 있게 복원된다.
//
// 사용:
//   const mainRef = useRef<HTMLElement>(null)
//   useScrollRestoration(mainRef)
//   <main ref={mainRef} className="sf-page-scroll">...</main>

import { useEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const STORAGE_PREFIX = 'sf.scroll.';

function readScroll(key: string): number | null {
  try {
    const v = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!v) return null;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeScroll(key: string, value: number) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, String(value));
  } catch {
    // sessionStorage 가 차거나 disable 된 환경 — 무시
  }
}

export function useScrollRestoration<T extends HTMLElement>(targetRef: RefObject<T | null>) {
  const { key } = useLocation();
  const navType = useNavigationType();
  // 직전 key 를 보관해 라우트 전환 직전에 그 key 로 scrollTop 을 저장한다.
  const lastKeyRef = useRef<string>(key);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    // 직전 key 의 위치를 저장. 새 key 의 복원/리셋은 그 다음에.
    const prevKey = lastKeyRef.current;
    if (prevKey && prevKey !== key) {
      writeScroll(prevKey, el.scrollTop);
    }
    lastKeyRef.current = key;

    if (navType === 'POP') {
      const saved = readScroll(key);
      // requestAnimationFrame 로 현재 라우트의 콘텐츠가 그려진 다음 프레임에 복원.
      // Suspense fallback 직후에 바로 scrollTop 을 쓰면 콘텐츠 높이가 작아서 무효가 된다.
      requestAnimationFrame(() => {
        if (saved != null) el.scrollTop = saved;
      });
    } else {
      // PUSH/REPLACE 는 새 페이지 진입이라 맨 위.
      el.scrollTop = 0;
    }
  }, [key, navType, targetRef]);

  // 새로고침/탭 닫기 직전에도 마지막 위치를 저장 — 같은 탭에서 다시 로드 후 뒤로가기 시 복원 가능.
  useEffect(() => {
    function save() {
      const el = targetRef.current;
      if (el) writeScroll(lastKeyRef.current, el.scrollTop);
    }
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, [targetRef]);
}
