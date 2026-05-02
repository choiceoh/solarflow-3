// Generic mock sparkline seeds for metric cards with `spark: 'auto'`.
// 실제 시계열 데이터가 도입되기 전까지의 시각적 placeholder — 메트릭 라벨 해시로
// 결정적 모양을 골라 같은 카드는 항상 같은 곡선을 받는다.

const SPARK_SHAPES: number[][] = [
  [10, 13, 12, 16, 15, 19, 22, 24],
  [62, 64, 66, 68, 71, 72, 73, 74],
  [40, 38, 41, 39, 42, 40, 43, 45],
  [22, 24, 26, 25, 28, 30, 31, 33],
  [8, 10, 11, 13, 14, 14, 15, 17],
  [55, 53, 52, 54, 50, 48, 47, 45],
  [30, 33, 31, 35, 38, 37, 40, 42],
  [18, 17, 19, 18, 20, 22, 21, 23],
];

export function autoSpark(label: string): number[] {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  return SPARK_SHAPES[Math.abs(h) % SPARK_SHAPES.length]!;
}
