import { useMediaQuery } from '@/hooks/useMediaQuery';

export default function MobileBlock({ children }: { children: React.ReactNode }) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (!isMobile) return <>{children}</>;

  return (
    <div
      role="status"
      className="flex min-h-screen items-center justify-center px-6 text-center"
      style={{ background: 'var(--sf-bg)', color: 'var(--sf-ink)' }}
    >
      <h1 className="text-xl font-semibold">PC로 접속해주세요</h1>
    </div>
  );
}
