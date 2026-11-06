import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { FormTextInput } from '@/components/form-text-input';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';
import { resendConfirmationEmail, signInWithEmail } from '@/features/auth/auth-service';
import { hasSupabaseEnv } from '@/lib/env';

type AuthNotice = {
  body: string;
  tone: 'error' | 'info' | 'success';
  title: string;
};

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      setNotice({
        body: 'Enter your email and password.',
        title: 'Missing details',
        tone: 'error',
      });
      return;
    }

    if (!hasSupabaseEnv()) {
      setNotice({
        body: 'The deployed app is missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.',
        title: 'Auth is not configured',
        tone: 'error',
      });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const { data, error } = await signInWithEmail(email.trim(), password);

      if (error) {
        console.error('Sign in failed', {
          message: error.message,
          status: 'status' in error ? error.status : undefined,
        });

        if (error.message.toLowerCase().includes('email not confirmed')) {
          setNotice({
            body: 'Confirm your email first, or use the resend button below.',
            title: 'Email not confirmed',
            tone: 'error',
          });
          return;
        }

        setNotice({
          body: error.message,
          title: 'Sign in failed',
          tone: 'error',
        });
        return;
      }

      if (!data.session) {
        setNotice({
          body: 'Supabase accepted the request but did not return a session. Check email confirmation and Auth settings.',
          title: 'No session returned',
          tone: 'error',
        });
        return;
      }

      setNotice({
        body: 'Signed in. Opening your dashboard.',
        title: 'Success',
        tone: 'success',
      });
      router.replace('/tabs/home');
    } catch (error) {
      console.error('Unexpected sign in error', error);
      setNotice({
        body: error instanceof Error ? error.message : 'Check your browser console for the client-side auth error.',
        title: 'Unexpected auth error',
        tone: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleResendConfirmation() {
    if (!email.trim()) {
      setNotice({
        body: 'Enter your email address first.',
        title: 'Missing email',
        tone: 'error',
      });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const { error } = await resendConfirmationEmail(email.trim());

      if (error) {
        setNotice({
          body: error.message,
          title: 'Could not resend email',
          tone: 'error',
        });
        return;
      }

      setNotice({
        body: 'Check your inbox and tap the confirmation link.',
        title: 'Confirmation sent',
        tone: 'success',
      });
    } catch (error) {
      setNotice({
        body: error instanceof Error ? error.message : 'Check your browser console for details.',
        title: 'Unexpected auth error',
        tone: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen keyboardAware>
      <View style={styles.header}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Use the account connected to your hosted Supabase project.</Text>
      </View>

      <View style={styles.form}>
        <FormTextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          textContentType="emailAddress"
          value={email}
        />
        <FormTextInput
          autoComplete="password"
          label="Password"
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          textContentType="password"
          value={password}
        />
        <Button label="Sign in" loading={loading} onPress={handleSignIn} />
        <Button
          label="Resend confirmation email"
          loading={loading}
          onPress={handleResendConfirmation}
          variant="secondary"
        />
        {notice ? <AuthNoticeCard notice={notice} /> : null}
      </View>

      <View style={styles.links}>
        <Link href="/auth/forgot-password" style={styles.link}>
          Forgot password?
        </Link>
        <Link href="/auth/sign-up" style={styles.link}>
          Need an account?
        </Link>
      </View>
    </Screen>
  );
}

function AuthNoticeCard({ notice }: { notice: AuthNotice }) {
  return (
    <View style={[styles.notice, notice.tone === 'error' && styles.errorNotice, notice.tone === 'success' && styles.successNotice]}>
      <Text style={[styles.noticeTitle, notice.tone === 'error' && styles.errorNoticeTitle]}>{notice.title}</Text>
      <Text style={styles.noticeBody}>{notice.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  form: {
    gap: spacing.md,
  },
  notice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  errorNotice: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  successNotice: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  noticeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  errorNoticeTitle: {
    color: colors.danger,
  },
  noticeBody: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  links: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  link: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
});
