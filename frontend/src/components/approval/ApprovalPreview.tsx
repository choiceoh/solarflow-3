// 결재안 미리보기 + 수정 + 클립보드 복사 (Step 30)
import { useState, useCallback } from 'react';
import { Copy, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  text: string;
  originalText: string;
  onTextChange: (text: string) => void;
}

export default function ApprovalPreview({ text, originalText, onTextChange }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 폴백: textarea 선택 복사
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  const handleReset = useCallback(() => {
    onTextChange(originalText);
  }, [originalText, onTextChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">결재안 미리보기</h3>
        <div className="flex gap-2">
          {text !== originalText && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />원본
            </Button>
          )}
          <Button size="sm" onClick={handleCopy}>
            {copied ? (
              <><Check className="mr-1 h-3.5 w-3.5" />복사 완료</>
            ) : (
              <><Copy className="mr-1 h-3.5 w-3.5" />클립보드 복사</>
            )}
          </Button>
        </div>
      </div>
      <Textarea
        className="font-mono text-xs leading-relaxed min-h-[400px] resize-y"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">텍스트를 직접 수정할 수 있습니다. [원본] 버튼으로 되돌리기 가능.</p>
    </div>
  );
}
