import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface PlaceholderPageProps {
  title: string;
  stepNumber: number;
}

export default function PlaceholderPage({ title, stepNumber }: PlaceholderPageProps) {
  return (
    <div className="flex items-center justify-center p-8">
      <Card className="max-w-sm text-center">
        <CardContent className="pt-6 space-y-3">
          <Construction className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">Step {stepNumber}에서 구현 예정</p>
        </CardContent>
      </Card>
    </div>
  );
}
