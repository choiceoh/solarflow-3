import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import LoginForm from '@/components/auth/LoginForm';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold">SolarFlow 3.0</h1>
        <p className="mt-1 text-sm text-muted-foreground">태양광 모듈 유통 관리 시스템</p>
      </div>
      <LoginForm />
    </div>
  );
}
