export type Profile = {
  avatar_url: string | null;
  created_at: string;
  email: string | null;
  full_name: string | null;
  id: string;
  updated_at: string;
};

export type ProfileUpdate = Pick<Profile, 'avatar_url' | 'email' | 'full_name'>;
