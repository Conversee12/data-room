import { Suspense } from 'react';

import { AuthForm } from '@/components/auth-form';
import { LoadingBlock } from '@/components/ui/states';

export default function RegisterPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
