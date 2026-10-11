'use client';

// app/page.tsx
//
// Root route. Redirects to the role-appropriate dashboard (or /login).
// Renders a spinner while auth state is bootstrapping.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth';
import { FullPageSpinner } from '@/components/Spinner';
import type { Role } from '@/lib/types';

const ROLE_HOME: Record<Role, string> = {
  student: '/student',
  lecturer: '/lecturer',
  admin: '/admin',
};

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    router.replace(ROLE_HOME[user.role]);
  }, [loading, user, router]);

  // While the AuthProvider is validating the stored token, show a spinner.
  // Once we know the user, we navigate in the effect above.
  return <FullPageSpinner label="Preparing your dashboard…" />;
}