import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AdminUser = {
  id: string;
  email: string;
  role: string;
};

export async function fetchProfile(userId: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (data) return { id: data.id, email: '', role: data.role };
  if (error && error.code !== 'PGRST116') return null;

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert({ id: userId })
    .select('id, role')
    .single();
  if (createError || !created) return null;
  return { id: created.id, email: '', role: created.role };
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function sendMagicLink(email: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/portal` },
  });
}

export async function resetPassword(email: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/admin` });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export function onAuthChange(callback: (session: Session | null, user: User | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session, session?.user ?? null);
  });
}
