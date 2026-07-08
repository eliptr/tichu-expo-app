import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { env, hasSupabaseEnv } from './env';

if (!hasSupabaseEnv()) {
  console.warn('Missing Supabase environment variables. Copy .env.example to .env and fill in the hosted project values.');
}

const webStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage.getItem(key);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(key, value);
  },
};

export const supabase = createClient(env.supabaseUrl || 'https://example.supabase.co', env.supabaseAnonKey || 'placeholder', {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    persistSession: true,
    storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
  },
});
