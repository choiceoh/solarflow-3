// 결재안 유형별 분기 컴포넌트 (Step 30)
import type { ApprovalType } from '@/types/approval';
import Type1ImportPayment from './Type1ImportPayment';
import Type2CIFExpense from './Type2CIFExpense';
import Type3TaxInvoice from './Type3TaxInvoice';
import Type4TransportMonthly from './Type4TransportMonthly';
import Type5DepositPayment from './Type5DepositPayment';
import Type6ConstructionTransport from './Type6ConstructionTransport';

interface Props {
  type: ApprovalType;
  onGenerate: (text: string) => void;
}

export default function ApprovalGenerator({ type, onGenerate }: Props) {
  switch (type) {
    case 1: return <Type1ImportPayment onGenerate={onGenerate} />;
    case 2: return <Type2CIFExpense onGenerate={onGenerate} />;
    case 3: return <Type3TaxInvoice onGenerate={onGenerate} />;
    case 4: return <Type4TransportMonthly onGenerate={onGenerate} />;
    case 5: return <Type5DepositPayment onGenerate={onGenerate} />;
    case 6: return <Type6ConstructionTransport onGenerate={onGenerate} />;
  }
}
