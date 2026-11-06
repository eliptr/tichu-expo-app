import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { env, hasSupabaseEnv } from './env';

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

function createSupabaseClient() {
  if (!hasSupabaseEnv()) throw new Error("Online prototype requires Supabase configuration.");
  return createClient(env.supabaseUrl || 'https://example.supabase.co', env.supabaseAnonKey || 'placeholder', {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    persistSession: true,
    storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
  },
});

}

let client: ReturnType<typeof createSupabaseClient> | undefined;
// Route modules may be imported during export; access alone creates the client.
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_target, property) {
    client ??= createSupabaseClient();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
