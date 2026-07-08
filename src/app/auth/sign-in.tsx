import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { FormTextInput } from '@/components/form-text-input';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';
import { resendConfirmationEmail, signInWithEmail } from '@/features/auth/auth-service';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and password.');
      return;
    }

    setLoading(true);
    const { error } = await signInWithEmail(email.trim(), password);
    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        Alert.alert('Email not confirmed', 'Confirm your email first, or resend the confirmation email.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Resend email', onPress: () => void handleResendConfirmation() },
        ]);
        return;
      }

      Alert.alert('Sign in failed', error.message);
      return;
    }

    router.replace('/tabs/home');
  }

  async function handleResendConfirmation() {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Enter your email address first.');
      return;
    }

    setLoading(true);
    const { error } = await resendConfirmationEmail(email.trim());
    setLoading(false);

    if (error) {
      Alert.alert('Could not resend email', error.message);
      return;
    }

    Alert.alert('Confirmation sent', 'Check your inbox and tap the confirmation link.');
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
