import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

export function getAuthRedirectTo() {
  return Linking.createURL('/auth/sign-in');
}

export function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signUpWithEmail(email: string, password: string, fullName: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectTo(),
      data: {
        full_name: fullName,
      },
    },
  });
}

export function sendPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthRedirectTo(),
  });
}

export function resendConfirmationEmail(email: string) {
  return supabase.auth.resend({
    email,
    type: 'signup',
    options: {
      emailRedirectTo: getAuthRedirectTo(),
    },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}
