import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { FormTextInput } from '@/components/form-text-input';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';
import { signUpWithEmail } from '@/features/auth/auth-service';

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      Alert.alert('Check your details', 'Add your name, email, and a password with at least 6 characters.');
      return;
    }

    setLoading(true);
    const { data, error } = await signUpWithEmail(email.trim(), password, fullName.trim());
    setLoading(false);

    if (error) {
      Alert.alert('Sign up failed', error.message);
      return;
    }

    if (data.session) {
      router.replace('/tabs/home');
      return;
    }

    Alert.alert(
      'Check your email',
      'Supabase wants you to confirm your email before signing in. Tap the email link, then come back and sign in. If the link opens a blank page, add the Expo redirect URL to Supabase Auth settings.',
      [{ text: 'OK', onPress: () => router.replace('/auth/sign-in') }]
    );
  }

  return (
    <Screen keyboardAware>
      <View style={styles.header}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>This creates an auth user and a matching profile row.</Text>
      </View>

      <View style={styles.form}>
        <FormTextInput
          autoComplete="name"
          label="Full name"
          onChangeText={setFullName}
          placeholder="Your name"
          textContentType="name"
          value={fullName}
        />
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
          autoComplete="new-password"
          label="Password"
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          secureTextEntry
          textContentType="newPassword"
          value={password}
        />
        <Button label="Create account" loading={loading} onPress={handleSignUp} />
      </View>

      <Link href="/auth/sign-in" style={styles.link}>
        Already have an account?
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
