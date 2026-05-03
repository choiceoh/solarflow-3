import { Component, type ErrorInfo, type ReactNode } from 'react';

// /purchase-history 전용 에러 경계.
// PR4 견고성: 6개 fetch + 클라이언트 합성 로직이 한 곳이라도 던지면 사이드바·헤더는
// 살리고 본문만 폴백 메시지로 대체한다. 라우터 전체가 죽지 않도록.

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class PurchaseHistoryErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 운영 환경에서는 외부 모니터링이 자동 캡처. 여기는 콘솔 단서만.
    console.error('[PurchaseHistory] render error:', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="sf-page" role="alert">
          <div className="sf-ph-empty" style={{ paddingTop: 96 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
              구매 이력 화면을 불러올 수 없습니다
            </div>
            <div style={{ fontSize: 12, marginBottom: 16 }}>
              {this.state.error.message || '알 수 없는 오류'}
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="sf-ph-clear-btn"
            >
              다시 시도
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
