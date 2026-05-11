import { describe, expect, it } from 'bun:test';
import { parsePOQuickInput, type POQuickInputProduct } from './poQuickInput';

const products: POQuickInputProduct[] = [
  { product_id: 'p-580-a', product_code: 'TSM-580A', product_name: 'TopSolar 580A', spec_wp: 580 },
  { product_id: 'p-580-b', product_code: 'TSM-580B', product_name: 'TopSolar 580B', spec_wp: 580 },
  { product_id: 'p-620', product_code: 'TSM-620', product_name: 'TopSolar 620', spec_wp: 620 },
];

describe('parsePOQuickInput', () => {
  it('skips spreadsheet headers and parses clean tab rows', () => {
    const result = parsePOQuickInput(
      ['품번\t수량\tUSD/Wp', 'TSM-620\t1,200\t0.091'].join('\n'),
      products,
    );

    expect(result.skippedHeaders).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.lines).toEqual([
      {
        product_id: 'p-620',
        quantity: 1200,
        unit_price_usd_wp: 0.091,
        item_type: 'main',
        payment_type: 'paid',
        memo: '',
      },
    ]);
  });

  it('parses optional item/payment/memo columns', () => {
    const result = parsePOQuickInput('TSM-620\t50\t0.088\t스페어\t무상\t예비품', products);

    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toMatchObject({
      product_id: 'p-620',
      quantity: 50,
      unit_price_usd_wp: 0.088,
      item_type: 'spare',
      payment_type: 'free',
      memo: '예비품',
    });
  });

  it('parses whitespace rows copied from plain text', () => {
    const result = parsePOQuickInput('TSM-620 300 0.092', products);

    expect(result.errors).toEqual([]);
    expect(result.lines[0].product_id).toBe('p-620');
    expect(result.lines[0].quantity).toBe(300);
  });

  it('fails closed when a product token is ambiguous', () => {
    const result = parsePOQuickInput('580\t100\t0.09', products);

    expect(result.lines).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('후보가 여러 개');
  });

  it('reports bad quantities without returning partial lines for that row', () => {
    const result = parsePOQuickInput('TSM-620\t0\t0.09', products);

    expect(result.lines).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('수량');
  });
});
