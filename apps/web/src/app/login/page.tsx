import { Suspense } from 'react';

import { AuthForm } from '@/components/auth-form';
import { LoadingBlock } from '@/components/ui/states';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AuthForm mode="sign-in" />
    </Suspense>
  );
}
