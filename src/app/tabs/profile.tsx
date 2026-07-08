import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { FormTextInput } from '@/components/form-text-input';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { StateCard } from '@/components/state-card';
import { colors, spacing } from '@/constants/ui';
import { signOut } from '@/features/auth/auth-service';
import { useAuth } from '@/features/auth/auth-context';
import { getProfile, updateProfile } from '@/features/profile/profile-service';

export default function ProfileScreen() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    const { data, error: profileError } = await getProfile();
    setLoading(false);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    setFullName(data?.full_name ?? '');
    setAvatarUrl(data?.avatar_url ?? '');
  }

  async function handleSave() {
    setSaving(true);
    const { error: saveError } = await updateProfile({
      email: user?.email ?? null,
      full_name: fullName.trim() || null,
      avatar_url: avatarUrl.trim() || null,
    });
    setSaving(false);

    if (saveError) {
      Alert.alert('Save failed', saveError.message);
      return;
    }

    Alert.alert('Saved', 'Your Supabase profile row was updated.');
  }

  async function handleLogout() {
    const { error: logoutError } = await signOut();

    if (logoutError) {
      Alert.alert('Logout failed', logoutError.message);
      return;
    }

    router.replace('/onboarding');
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  if (loading) {
    return <LoadingScreen message="Loading profile" />;
  }

  return (
    <Screen keyboardAware>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Update one row in Supabase and keep this app skeleton honest.</Text>
      </View>

      {error ? (
        <StateCard
          title="Profile could not load"
          body={error}
          action={<Button label="Try again" onPress={loadProfile} variant="secondary" />}
        />
      ) : (
        <View style={styles.form}>
          <FormTextInput label="Email" editable={false} value={user?.email ?? ''} />
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
            label="Avatar URL"
            onChangeText={setAvatarUrl}
            placeholder="https://..."
            value={avatarUrl}
          />
          <Button label="Save profile" loading={saving} onPress={handleSave} />
        </View>
      )}

      <View style={styles.footer}>
        <Link href="/settings/delete-account" style={styles.dangerLink}>
          Account deletion notes
        </Link>
        <Button label="Log out" onPress={handleLogout} variant="secondary" />
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
  footer: {
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  dangerLink: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
