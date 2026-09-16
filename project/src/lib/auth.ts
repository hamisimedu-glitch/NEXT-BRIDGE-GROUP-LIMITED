import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AdminUser = {
  id: string;
  email: string;
  role: string;
  full_name?: string | null;
  phone?: string | null;
  preferred_location?: string | null;
  investment_budget?: string | null;
  notes?: string | null;
};

function normalizeRole(role: string | null | undefined): string {
  return String(role ?? 'client').trim().toLowerCase();
}

export async function fetchProfile(userId: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (data) return { id: data.id, email: '', role: normalizeRole(data.role) };
  if (error && error.code !== 'PGRST116') return null;

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert({ id: userId })
    .select('id, role')
    .single();
  if (createError || !created) return null;
  return { id: created.id, email: '', role: normalizeRole(created.role) };
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string, role: 'client' | 'staff' = 'client') {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role },
    },
  });
}

export async function sendMagicLink(email: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/portal` },
  });
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function sendPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/portal?reset=1` });
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
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
