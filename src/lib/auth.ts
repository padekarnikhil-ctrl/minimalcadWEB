/**
 * MinimalCAD Web
 * lib/auth.ts
 *
 * Thin wrapper over Supabase Auth's email/password flow -- sign up, sign
 * in, sign out, and a session-change subscription for the UI to react to.
 * No OAuth/magic-link/password-reset here yet (v1 scope is email+password
 * only); those are additive later, not a reshape of this module.
 */

import { getSupabaseClient } from "./supabaseClient";

export interface AuthUser {
  id: string;
  email: string | null;
}

export type AuthResult = { ok: true } | { ok: false; error: string };

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { error } = await getSupabaseClient().auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await getSupabaseClient().auth.signOut();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}

/** Fires immediately with the current user (or null), then again on every
 *  sign-in/sign-out -- callers don't need a separate getCurrentUser() call
 *  first. Returns an unsubscribe function. */
export function onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
  const {
    data: { subscription },
  } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
    callback(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
  });
  return () => subscription.unsubscribe();
}
