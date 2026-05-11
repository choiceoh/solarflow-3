export interface POQuickInputProduct {
  product_id: string;
  product_code?: string;
  product_name?: string;
  spec_wp?: number;
}

export interface POQuickInputLine {
  product_id: string;
  quantity: number;
  unit_price_usd_wp: number;
  item_type: 'main' | 'spare';
  payment_type: 'paid' | 'free';
  memo: string;
}

export interface POQuickInputError {
  row: number;
  raw: string;
  message: string;
}

export interface POQuickInputResult {
  lines: POQuickInputLine[];
  errors: POQuickInputError[];
  skippedHeaders: number;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function uniqueProducts(products: POQuickInputProduct[]): POQuickInputProduct[] {
  const byId = new Map<string, POQuickInputProduct>();
  for (const product of products) byId.set(product.product_id, product);
  return [...byId.values()];
}

function parseNumberToken(value: string): number {
  const cleaned = value
    .replace(/,/g, '')
    .replace(/\$/g, '')
    .replace(/usd\/?wp|usd|wp|ea|매/gi, '')
    .trim();
  return Number(cleaned);
}

function isHeaderRow(cols: string[]): boolean {
  const joined = normalizeToken(cols.join(' '));
  const hasProduct = joined.includes('품번') ||
    joined.includes('product') ||
    joined.includes('모델') ||
    joined.includes('item');
  const hasQty = joined.includes('수량') || joined.includes('quantity') || joined.includes('qty');
  const hasPrice = joined.includes('단가') || joined.includes('usd/wp') || joined.includes('usdwp');
  return hasProduct && (hasQty || hasPrice);
}

function splitDelimitedRow(row: string): string[] {
  const tabCols = row.split(/\t/).map((c) => c.trim()).filter(Boolean);
  if (tabCols.length >= 3) return tabCols;
  const commaCols = row.split(',').map((c) => c.trim()).filter(Boolean);
  if (commaCols.length >= 3) return commaCols;
  return [];
}

function parseTailRow(row: string): string[] {
  const match = row.match(/^(.*?)\s+([0-9][0-9,]*(?:\s*(?:ea|매))?)\s+(\$?\s*[0-9]*\.?[0-9]+(?:\s*(?:usd\/?wp|usd|wp))?)(?:\s+(.*))?$/i);
  if (!match) return [];
  return [match[1], match[2], match[3], match[4] ?? ''].map((c) => c.trim()).filter(Boolean);
}

function resolveProduct(
  rawProduct: string,
  products: POQuickInputProduct[],
): { product: POQuickInputProduct | null; error?: string } {
  const q = normalizeToken(rawProduct);
  if (!q) return { product: null, error: '품번이 비어 있습니다' };
  const activeProducts = uniqueProducts(products);

  const exact = activeProducts.filter((p) => {
    const code = normalizeToken(p.product_code ?? '');
    const name = normalizeToken(p.product_name ?? '');
    return q === p.product_id || (!!code && q === code) || (!!name && q === name);
  });
  if (exact.length === 1) return { product: exact[0] };
  if (exact.length > 1) return { product: null, error: '품번 후보가 여러 개입니다' };

  const fuzzy = activeProducts.filter((p) => {
    const code = normalizeToken(p.product_code ?? '');
    const name = normalizeToken(p.product_name ?? '');
    const spec = p.spec_wp ? normalizeToken(`${p.spec_wp}wp`) : '';
    const bareSpec = p.spec_wp ? normalizeToken(String(p.spec_wp)) : '';
    return (!!code && (q.includes(code) || code.includes(q))) ||
      (!!name && (q.includes(name) || name.includes(q))) ||
      (!!spec && q.includes(spec)) ||
      (!!bareSpec && q === bareSpec);
  });
  if (fuzzy.length === 1) return { product: fuzzy[0] };
  if (fuzzy.length > 1) return { product: null, error: '품번 후보가 여러 개입니다' };
  return { product: null, error: '품번을 찾을 수 없습니다' };
}

function parseLineMeta(cols: string[]): Pick<POQuickInputLine, 'item_type' | 'payment_type' | 'memo'> {
  let itemType: POQuickInputLine['item_type'] = 'main';
  let paymentType: POQuickInputLine['payment_type'] = 'paid';
  const memoParts: string[] = [];
  for (const col of cols) {
    const token = normalizeToken(col);
    if (!token) continue;
    if (token === 'spare' || token.includes('스페어')) {
      itemType = 'spare';
      continue;
    }
    if (token === 'main' || token.includes('본품')) {
      itemType = 'main';
      continue;
    }
    if (token === 'free' || token.includes('무상')) {
      paymentType = 'free';
      continue;
    }
    if (token === 'paid' || token.includes('유상')) {
      paymentType = 'paid';
      continue;
    }
    memoParts.push(col);
  }
  return { item_type: itemType, payment_type: paymentType, memo: memoParts.join(' ') };
}

export function parsePOQuickInput(
  text: string,
  products: POQuickInputProduct[],
): POQuickInputResult {
  const lines: POQuickInputLine[] = [];
  const errors: POQuickInputError[] = [];
  let skippedHeaders = 0;
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);

  for (const [idx, row] of rows.entries()) {
    const cols = splitDelimitedRow(row);
    const parsedCols = cols.length >= 3 ? cols : parseTailRow(row);
    if (parsedCols.length >= 3 && isHeaderRow(parsedCols)) {
      skippedHeaders += 1;
      continue;
    }
    if (parsedCols.length < 3) {
      errors.push({ row: idx + 1, raw: row, message: '품번/수량/USD-Wp 형식이 아닙니다' });
      continue;
    }

    const [productText, quantityText, unitPriceText, ...metaCols] = parsedCols;
    const { product, error } = resolveProduct(productText, products);
    const quantity = parseNumberToken(quantityText);
    const unitPriceUsdWp = parseNumberToken(unitPriceText);
    if (!product) {
      errors.push({ row: idx + 1, raw: row, message: error ?? '품번을 찾을 수 없습니다' });
      continue;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push({ row: idx + 1, raw: row, message: '수량은 0보다 커야 합니다' });
      continue;
    }
    if (!Number.isFinite(unitPriceUsdWp) || unitPriceUsdWp <= 0) {
      errors.push({ row: idx + 1, raw: row, message: 'USD/Wp 단가는 0보다 커야 합니다' });
      continue;
    }

    lines.push({
      product_id: product.product_id,
      quantity,
      unit_price_usd_wp: unitPriceUsdWp,
      ...parseLineMeta(metaCols),
    });
  }

  return { lines, errors, skippedHeaders };
}
