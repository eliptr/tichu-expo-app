import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { FormTextInput } from '@/components/form-text-input';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';
import { sendPasswordReset } from '@/features/auth/auth-service';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Enter your account email first.');
      return;
    }

    setLoading(true);
    const { error } = await sendPasswordReset(email.trim());
    setLoading(false);

    if (error) {
      Alert.alert('Reset failed', error.message);
      return;
    }

    Alert.alert('Email sent', 'Check your inbox for the password reset link.');
  }

  return (
    <Screen keyboardAware>
      <View style={styles.header}>
        <Text style={styles.title}>Forgot password</Text>
        <Text style={styles.subtitle}>Supabase will email you a reset link for this account.</Text>
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
        <Button label="Send reset email" loading={loading} onPress={handleReset} />
      </View>

      <Link href="/auth/sign-in" style={styles.link}>
        Back to sign in
      </Link>
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
  link: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
