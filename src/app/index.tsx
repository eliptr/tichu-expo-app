import { Redirect } from 'expo-router';

import { LoadingScreen } from '@/components/loading-screen';
import { useAuth } from '@/features/auth/auth-context';

export default function IndexScreen() {
  const { initializing, session } = useAuth();

  if (initializing) {
    return <LoadingScreen message="Checking your session" />;
  }

  return <Redirect href={session ? '/tabs/home' : '/onboarding'} />;
}
