// SkeletonRows — 테이블 로딩 상태에 사용. .sf-skeleton shimmer 사용
export default function SkeletonRows({ rows = 6, height = 32 }: { rows?: number; height?: number }) {
  return (
    <div className="flex flex-col gap-1.5 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sf-skeleton w-full" style={{ height }} />
      ))}
    </div>
  );
}
