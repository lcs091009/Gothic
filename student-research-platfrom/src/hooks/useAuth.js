import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured, getFriendlySupabaseError } from "../lib/supabaseClient";

export function useAuth(setMessage) {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    if (!isSupabaseConfigured()) { setIsLoading(false); return; }
    let active = true;
    let authEventReceived = false;
    // Do not await Supabase operations inside its synchronous auth callback.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true;
      if (active) { setSession(nextSession); setIsLoading(false); }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return;
      if (error) setMessage(getFriendlySupabaseError(error));
      else setSession(data.session);
      setIsLoading(false);
    }).catch((error) => {
      if (active) { setMessage(getFriendlySupabaseError(error)); setIsLoading(false); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [setMessage]);

  async function signInWithGoogle() {
    setMessage("");
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google",
        options: { redirectTo: window.location.origin } });
      if (error) throw error;
    } catch (error) { setMessage(getFriendlySupabaseError(error)); }
  }
  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
      return true;
    } catch (error) { setMessage(getFriendlySupabaseError(error)); return false; }
  }
  return { session, isLoading, signInWithGoogle, signOut };
}
