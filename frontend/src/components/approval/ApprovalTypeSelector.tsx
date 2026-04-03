// 결재안 유형 선택 카드 6개 (Step 30)
import { FileText, Ship, Receipt, Truck, Wallet, HardHat } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { ApprovalType } from '@/types/approval';
import { APPROVAL_TYPE_LABEL, APPROVAL_TYPE_DESC } from '@/types/approval';

interface Props {
  selected: ApprovalType | null;
  onSelect: (type: ApprovalType) => void;
}

const ICONS: Record<ApprovalType, React.ReactNode> = {
  1: <Ship className="h-5 w-5" />,
  2: <FileText className="h-5 w-5" />,
  3: <Receipt className="h-5 w-5" />,
  4: <Truck className="h-5 w-5" />,
  5: <Wallet className="h-5 w-5" />,
  6: <HardHat className="h-5 w-5" />,
};

export default function ApprovalTypeSelector({ selected, onSelect }: Props) {
  const types: ApprovalType[] = [1, 2, 3, 4, 5, 6];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {types.map((t) => (
        <Card
          key={t}
          className={`cursor-pointer transition-all hover:shadow-md ${
            selected === t ? 'ring-2 ring-primary shadow-md' : ''
          }`}
          onClick={() => onSelect(t)}
        >
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              {ICONS[t]}
              {APPROVAL_TYPE_LABEL[t]}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {APPROVAL_TYPE_DESC[t]}
            </CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
