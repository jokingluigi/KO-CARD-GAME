import {reportClientFailure} from '@/lib/client-diagnostics';
import {isScreenAssetFailure} from '@/lib/screen-recovery';
import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
  diagnosticId?:string;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function readDiagnosticId(){try{return sessionStorage.getItem('ko-last-diagnostic')??'확인 중';}catch{return '저장할 수 없음';}}

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  const assetFailure = isScreenAssetFailure(error);
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-950 p-6">
      <div className="ko-state-panel text-center">
        <h1 className="text-xl text-amber-100">
          {assetFailure ? '화면 파일을 다시 불러와 주세요' : '화면을 표시하지 못했어요'}
        </h1>
        <p className="mt-2 text-sm text-neutral-300">
          {assetFailure
            ? '업데이트되었거나 연결이 끊겨 화면 파일을 불러오지 못했어요. 현재 주소를 새로 불러오면 다시 확인할 수 있어요.'
            : '다시 시도해 주세요. 문제가 반복되면 발생한 모드와 직전 행동을 알려주세요.'}
        </p>
        <p className="mt-3 break-all text-xs text-neutral-400">오류 확인 코드: {readDiagnosticId()}</p>
        <a href={import.meta.env.BASE_URL} className="ko-surface-back">메인 메뉴로 돌아가기</a>
        {/* Dev only: messages can carry API responses and other internals. */}
        {import.meta.env.DEV ? (
          <pre className="mt-4 overflow-x-auto rounded bg-gray-100 p-3 text-left text-xs text-gray-800">
            {error.message || String(error)}
          </pre>
        ) : null}
        <button
          type="button"
          onClick={assetFailure ? () => window.location.reload() : resetError}
          className="ko-experience-action"
        >
          {assetFailure ? '화면 다시 불러오기' : '다시 시도'}
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.setState({diagnosticId:reportClientFailure('RENDER',error)});
    console.error(
      'ErrorBoundary caught an error:',
      toError(error),
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}
