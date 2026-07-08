import { supabase } from '@/lib/supabase';

import type { Profile, ProfileUpdate } from './profile-types';

export async function getProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { data: null, error: userError };
  }

  if (!user) {
    return { data: null, error: new Error('No signed-in user found.') };
  }

  return supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>();
}

export async function updateProfile(profile: ProfileUpdate) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { data: null, error: userError };
  }

  if (!user) {
    return { data: null, error: new Error('No signed-in user found.') };
  }

  return supabase
    .from('profiles')
    .upsert({
      id: user.id,
      ...profile,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single<Profile>();
}
