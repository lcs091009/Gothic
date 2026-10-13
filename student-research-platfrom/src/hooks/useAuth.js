import { useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured, supabaseConfigError, getFriendlySupabaseError } from "../lib/supabaseClient";
import { googleLoginOptions, googleLoginError, googleCallbackError } from "../lib/googleLogin";
import { cacheLoginDriveToken } from "../lib/loginDriveToken";

export function useAuth(setMessage) {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const signingIn = useRef(false);
  useEffect(() => {
    const callbackError = googleCallbackError(window.location);
    if (callbackError) setMessage(callbackError);
    if (!isSupabaseConfigured()) { setIsLoading(false); return; }
    let active = true;
    let authEventReceived = false;
    // Do not await Supabase operations inside its synchronous auth callback.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true;
      if (active) {
        void cacheLoginDriveToken(nextSession, import.meta.env.VITE_GOOGLE_CLIENT_ID).catch(() => {});
        setSession(nextSession); setIsLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return;
      if (error) setMessage(getFriendlySupabaseError(error));
      else {
        void cacheLoginDriveToken(data.session, import.meta.env.VITE_GOOGLE_CLIENT_ID).catch(() => {});
        setSession(data.session);
      }
      setIsLoading(false);
    }).catch((error) => {
      if (active) { setMessage(getFriendlySupabaseError(error)); setIsLoading(false); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [setMessage]);

  async function signInWithGoogle() {
    if (signingIn.current) return;
    setMessage("");
    if (!supabase) { setMessage(supabaseConfigError); return; }
    signingIn.current = true; setIsSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth(googleLoginOptions(window.location.origin));
      if (error) throw error;
    } catch (error) { setMessage(googleLoginError(error)); }
    finally { signingIn.current = false; setIsSigningIn(false); }
  }
  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
      return true;
    } catch (error) { setMessage(getFriendlySupabaseError(error)); return false; }
  }
  return { session, isLoading, isSigningIn, signInWithGoogle, signOut };
}
