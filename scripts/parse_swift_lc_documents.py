#!/usr/bin/env python
"""KDB SWIFT MT700 PDF 일괄 파싱 → LC 정보 추출 + lc_records 와 cross-check.

SWIFT MT700 필드:
  :20:  DOCUMENTARY CREDIT NUMBER
  :31C: DATE OF ISSUE (yymmdd)
  :31D: DATE AND PLACE OF EXPIRY (yymmdd ...)
  :40A: FORM OF DOCUMENTARY CREDIT
  :32B: CURRENCY CODE, AMOUNT
  :42A: DRAWEE (BIC 8자 → 은행)
  :42C: DRAFTS AT (usance: '90 DAYS AFTER B/L DATE' 등)
  :44E: PORT OF LOADING
  :44F: PORT OF DISCHARGE
  :50:  APPLICANT
  :59:  BENEFICIARY
  :47A: ADDITIONAL CONDITIONS

산출물:
  scripts/output/swift_lc_extracted.csv      모든 SWIFT 파일의 추출 결과
  scripts/output/swift_lc_vs_db.csv          DB lc_records 와 cross-check

DB 보강 후보:
  - 신규 LC: SWIFT 에 있는데 lc_records 미등록
  - amount 불일치: SWIFT 와 lc_records.amount_usd 차이
  - 은행 불일치: SWIFT BIC 와 lc_records.bank_id 차이
  - usance 검증: 모두 90일 인지
"""

import csv
import os
import re
import sys
from pathlib import Path

import fitz

sys.stdout.reconfigure(encoding='utf-8')

DROPBOX_ROOT = Path(r'C:\Users\user\Dropbox (개인용)\8. 코딩\솔라플로우 참고 자료')
OUT_DIR = Path(__file__).parent / 'output'

# BIC → bank_name (운영 DB 5개 은행 + KDB 추가)
BIC_TO_BANK = {
    'KODBKRSE': '산업은행',
    'HVBKKRSE': '신한은행',  # 신한은 SHBKKRSE 도 있음
    'SHBKKRSE': '신한은행',
    'CZNBKRSE': '광주은행',
    'KOEXKRSE': '하나은행',
    'HNBNKRSE': '하나은행',
    'CZNBKRSEGJU': '광주은행',
    'CITIKRSX': '시티은행',
    'CMBKKRSE': '농협',
    'IBKOKRSE': '기업은행',
    'CZNBKRSEXXX': '광주은행',
    'KOFXKRSE': '하나은행',
    'CZNBKRSE001': '광주은행',
    'KBSTKRSE': '국민은행',
    'CZNBKRSEGW': '광주은행',
}

# 필드 추출 정규식 (멀티라인 SWIFT 메시지)
def extract_swift_fields(text: str) -> dict:
    """SWIFT MT700 본문에서 필드 추출."""
    out = {}

    # :20: LC NUMBER
    m = re.search(r':20:\s*DOCUMENTARY CREDIT NUMBER\s*[\r\n]+\s*([A-Z0-9]{8,30})', text, re.IGNORECASE)
    if m:
        out['lc_number'] = m.group(1).strip()

    # :31C: DATE OF ISSUE (yymmdd)
    m = re.search(r':31C:\s*DATE OF ISSUE\s*[\r\n]+\s*(\d{6})', text)
    if m:
        d = m.group(1)
        out['issue_date'] = f'20{d[:2]}-{d[2:4]}-{d[4:6]}'

    # :31D: EXPIRY (yymmdd ...)
    m = re.search(r':31D:\s*DATE AND PLACE OF EXPIRY\s*[\r\n]+\s*(\d{6})', text)
    if m:
        d = m.group(1)
        out['expiry_date'] = f'20{d[:2]}-{d[2:4]}-{d[4:6]}'

    # :32B: CURRENCY CODE, AMOUNT
    # 형식: 'USD638877,89' or 'USD 638,877.89'
    m = re.search(r':32B:\s*CURRENCY CODE,\s*AMOUNT\s*[\r\n]+\s*([A-Z]{3})\s*([\d,.]+)', text)
    if m:
        out['currency'] = m.group(1)
        # SWIFT 콤마는 소수점, 마침표는 천단위 — 둘 다 있는 경우는 콤마가 천단위
        amt_str = m.group(2)
        if ',' in amt_str and '.' not in amt_str:
            # 'USD638877,89' → 638877.89 (콤마=소수점)
            parts = amt_str.rsplit(',', 1)
            if len(parts) == 2 and len(parts[1]) == 2:
                amt = float(parts[0].replace(',', '').replace('.', '')) + float(parts[1]) / 100
            else:
                amt = float(amt_str.replace(',', ''))
        elif ',' in amt_str and '.' in amt_str:
            # '638,877.89' — comma 천단위, period 소수점
            amt = float(amt_str.replace(',', ''))
        else:
            amt = float(amt_str.replace(',', ''))
        out['amount'] = amt

    # 대안 amount: '(USD:638,877.89)' 형식
    if 'amount' not in out:
        m = re.search(r'\(USD:\s*([\d,.]+)\)', text)
        if m:
            try:
                out['amount'] = float(m.group(1).replace(',', ''))
                out['currency'] = 'USD'
            except ValueError:
                pass

    # :42A: DRAWEE (BIC 코드)
    m = re.search(r':42A:\s*DRAWEE\s*[\r\n]+\s*([A-Z0-9]{8,11})', text)
    if m:
        bic = m.group(1)
        out['drawee_bic'] = bic
        out['drawee_bank'] = BIC_TO_BANK.get(bic, '')

    # :42C: DRAFTS AT (usance days)
    m = re.search(r':42C:\s*DRAFTS AT[. ]*\s*[\r\n]+\s*(\d+)\s*DAYS?\s+AFTER\s+B/?L\s+DATE', text, re.IGNORECASE)
    if m:
        out['usance_days'] = int(m.group(1))
        out['usance_basis'] = 'B/L_DATE'

    # :50: APPLICANT (다음 줄 첫 줄)
    m = re.search(r':50:\s*APPLICANT\s*[\r\n]+\s*([^\r\n]+)', text)
    if m:
        out['applicant'] = m.group(1).strip()

    # :59: BENEFICIARY
    m = re.search(r':59:\s*BENEFICIARY\s*[\r\n]+\s*([^\r\n]+)', text)
    if m:
        out['beneficiary'] = m.group(1).strip()

    # :44E: PORT OF LOADING
    m = re.search(r':44E:\s*PORT OF LOADING[^\r\n]*\s*[\r\n]+\s*([^\r\n:]+)', text)
    if m:
        out['port_loading'] = m.group(1).strip()

    # :44F: PORT OF DISCHARGE
    m = re.search(r':44F:\s*PORT OF DISCHARGE[^\r\n]*\s*[\r\n]+\s*([^\r\n:]+)', text)
    if m:
        out['port_discharge'] = m.group(1).strip()

    return out


def find_swift_pdfs():
    keywords = ['KDB_SWIFT', '개설 전신문', '개설 전문', '가전문', '개설전문', '개설전신문']
    seen = set()
    for path in DROPBOX_ROOT.rglob('*.pdf'):
        name = path.name
        if any(k in name for k in keywords):
            if path not in seen:
                seen.add(path)
                yield path


def main():
    files = list(find_swift_pdfs())
    print(f'SWIFT/개설전문 후보: {len(files)}')

    rows = []
    for i, path in enumerate(files):
        rel = path.relative_to(DROPBOX_ROOT).as_posix()
        try:
            doc = fitz.open(path)
            text = ''
            for p in doc:
                text += p.get_text('text') + '\n'
            doc.close()
        except Exception as e:
            rows.append({'filename': path.name, 'rel_path': rel, 'error': str(e)})
            continue

        # SWIFT MT700 인지 확인
        is_swift = 'Message Type : MT700' in text or ':20:' in text and 'DOCUMENTARY CREDIT NUMBER' in text
        if not is_swift:
            # 그냥 가전문 (한국어 LC 전문) 일 수도 — 그래도 LC no 만 추출 시도
            pass

        fields = extract_swift_fields(text)
        rows.append({
            'filename': path.name,
            'rel_path': rel,
            'is_swift_mt700': is_swift,
            'lc_number': fields.get('lc_number', ''),
            'issue_date': fields.get('issue_date', ''),
            'expiry_date': fields.get('expiry_date', ''),
            'amount': fields.get('amount', ''),
            'currency': fields.get('currency', ''),
            'drawee_bic': fields.get('drawee_bic', ''),
            'drawee_bank': fields.get('drawee_bank', ''),
            'usance_days': fields.get('usance_days', ''),
            'usance_basis': fields.get('usance_basis', ''),
            'applicant': fields.get('applicant', '')[:50],
            'beneficiary': fields.get('beneficiary', '')[:50],
            'port_loading': fields.get('port_loading', ''),
            'port_discharge': fields.get('port_discharge', ''),
        })
        if (i + 1) % 25 == 0:
            print(f'  진행: {i+1}/{len(files)}')

    # 저장
    fieldnames = ['filename', 'rel_path', 'is_swift_mt700', 'lc_number', 'issue_date',
                  'expiry_date', 'amount', 'currency', 'drawee_bic', 'drawee_bank',
                  'usance_days', 'usance_basis', 'applicant', 'beneficiary',
                  'port_loading', 'port_discharge']
    with (OUT_DIR / 'swift_lc_extracted.csv').open('w', encoding='utf-8-sig', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=fieldnames)
        wr.writeheader()
        wr.writerows(rows)

    # 통계
    with_lc = [r for r in rows if r.get('lc_number')]
    print(f'\n=== 추출 통계 ===')
    print(f'총 파일:           {len(rows)}')
    print(f'SWIFT MT700:       {sum(1 for r in rows if r.get("is_swift_mt700"))}')
    print(f'lc_number 추출:    {len(with_lc)}')
    print(f'amount 추출:       {sum(1 for r in with_lc if r.get("amount"))}')
    print(f'issue_date 추출:   {sum(1 for r in with_lc if r.get("issue_date"))}')
    print(f'expiry_date 추출:  {sum(1 for r in with_lc if r.get("expiry_date"))}')
    print(f'drawee_bank 추출:  {sum(1 for r in with_lc if r.get("drawee_bank"))}')
    print(f'usance_days 추출:  {sum(1 for r in with_lc if r.get("usance_days"))}')

    # 고유 LC no
    unique_lcs = set(r['lc_number'] for r in with_lc if r.get('lc_number'))
    print(f'고유 LC no:        {len(unique_lcs)}')

    # usance 분포
    usance_dist = {}
    for r in with_lc:
        ud = r.get('usance_days')
        if ud:
            usance_dist[ud] = usance_dist.get(ud, 0) + 1
    print(f'\nusance days 분포:  {usance_dist}')


if __name__ == '__main__':
    main()
