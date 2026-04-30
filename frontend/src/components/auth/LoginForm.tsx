import { useState } from 'react';
import { Lock, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getAuthSessionPersistence } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const REMEMBERED_EMAIL_KEY = 'solarflow-remembered-email';

function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeRememberedEmail(email: string): void {
  try {
    localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
  } catch {
    // 아이디 기억 저장에 실패해도 로그인 자체는 계속 진행한다.
  }
}

function clearRememberedEmail(): void {
  try {
    localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // 아이디 기억 해제에 실패해도 로그인 자체는 계속 진행한다.
  }
}

export default function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState(readRememberedEmail);
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(() => readRememberedEmail() !== '');
  const [keepSignedIn, setKeepSignedIn] = useState(getAuthSessionPersistence);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const trimmedEmail = email.trim();
      await login(trimmedEmail, password, { persistSession: keepSignedIn });

      if (rememberEmail) {
        writeRememberedEmail(trimmedEmail);
      } else {
        clearRememberedEmail();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '로그인에 실패했습니다';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="sf-login-form flex flex-col gap-3">
      <div>
        <Label htmlFor="email" className="sf-eyebrow">이메일</Label>
        <div className="sf-field-shell">
          <Mail className="sf-field-icon h-3.5 w-3.5" />
          <Input
            id="email"
            type="email"
            placeholder="user@topsolar.kr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="password" className="sf-eyebrow">비밀번호</Label>
        <div className="sf-field-shell">
          <Lock className="sf-field-icon h-3.5 w-3.5" />
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
      </div>

      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--sf-ink-3)]">
        <label htmlFor="remember-email" className="flex cursor-pointer items-center gap-2">
          <Checkbox
            id="remember-email"
            checked={rememberEmail}
            onCheckedChange={(checked) => setRememberEmail(checked === true)}
          />
          아이디 기억
        </label>
        <label htmlFor="keep-signed-in" className="flex cursor-pointer items-center gap-2">
          <Checkbox
            id="keep-signed-in"
            checked={keepSignedIn}
            onCheckedChange={(checked) => setKeepSignedIn(checked === true)}
          />
          이 기기에서 로그인 상태 유지
        </label>
      </div>

      {error && (
        <p className="rounded bg-[var(--sf-neg-bg)] px-3 py-2 text-xs font-medium text-[var(--sf-neg)]">{error}</p>
      )}

      <Button type="submit" className="sf-login-submit mt-1" disabled={isSubmitting}>
        {isSubmitting ? '로그인 중...' : '로그인'}
      </Button>
    </form>
  );
}
