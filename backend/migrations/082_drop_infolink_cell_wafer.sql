-- @auto-apply: yes
-- 081_drop_infolink_cell_wafer.sql
-- 가격예측: InfoLink 의 cell/wafer 데이터는 정확도 이슈로 제외 정책으로 변경.
-- AI 수집 단계에서 막지만 과거 수집된 행은 별도로 정리해야 차트에 안 나타남.

DELETE FROM price_benchmarks
WHERE source_key = 'infolink'
  AND metric_key IN ('cell', 'wafer');
