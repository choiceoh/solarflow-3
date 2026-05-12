package sale

// 매출(sales) 핸들러 단위 테스트.
//
// 094 마이그(sales_with_meta) 이후 다음 헬퍼들은 모두 삭제됐고 회귀 가드도 의미를 잃음:
//   - saleBusinessDateMatches      → DB 측 business_date 컬럼이 계산
//   - intersectSaleIDLists         → sale_id 리스트 빌딩 자체가 사라짐
//   - chunkSaleIDs                 → URL 길이 회피 청크 자체가 사라짐
// 의미 있던 회귀(.In() 덮어쓰기, URL too long) 는 구조적으로 발생 불가능해졌으므로 테스트 삭제.
