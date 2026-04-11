-- 014: purchase_orders.parent_po_id — 원계약 연결 (계약변경 이력 추적)
-- 발주 계약이 조건 변경으로 새 PO로 재등록될 때, 원계약 PO를 참조
ALTER TABLE purchase_orders
  ADD COLUMN parent_po_id UUID REFERENCES purchase_orders(po_id);

CREATE INDEX idx_po_parent ON purchase_orders(parent_po_id);
