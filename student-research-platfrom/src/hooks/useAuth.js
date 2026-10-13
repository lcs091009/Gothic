import { useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured, supabaseConfigError, getFriendlySupabaseError } from "../lib/supabaseClient";
import { googleLoginError, googleCallbackError } from "../lib/googleLogin";
import { cacheLoginDriveToken } from "../lib/loginDriveToken";
import { cleanAuthCallbackUrl,createSessionReadGuard,beginGoogleLogin } from "../lib/authNavigation";

export function useAuth(setMessage) {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const signingIn = useRef(false);
  useEffect(() => {
    const callbackError = googleCallbackError(window.location);
    const cleanCallback=()=>window.history.replaceState(window.history.state,"",cleanAuthCallbackUrl(window.location.href));
    if (callbackError) {setMessage(callbackError);cleanCallback();}
    if (!isSupabaseConfigured()) { setIsLoading(false); return; }
    let active = true;
    const guard=createSessionReadGuard();
    const applySession=nextSession=>{
      void Promise.resolve().then(()=>cacheLoginDriveToken(nextSession, import.meta.env.VITE_GOOGLE_CLIENT_ID)).catch(() => {});
      setSession(nextSession);setIsLoading(false);
      if(nextSession) {setMessage("");cleanCallback();}
    };
    // Do not await Supabase operations inside its synchronous auth callback.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      guard.invalidate();
      if (active) {
        applySession(nextSession);
      }
    });
    const syncSession=(block=false)=>{
      const isCurrent=guard.begin();
      if(block) setIsLoading(true);
      return supabase.auth.getSession().then(({ data, error }) => {
      if (!active || !isCurrent()) return;
      if (error) setMessage(getFriendlySupabaseError(error));
      else applySession(data.session);
      setIsLoading(false);
    }).catch((error) => {
      if (active && isCurrent()) { setMessage(getFriendlySupabaseError(error)); setIsLoading(false); }
    });
    };
    const restorePage=event=>{if(event?.persisted){signingIn.current=false;setIsSigningIn(false);}void syncSession(Boolean(event?.persisted));};
    const foreground=()=>{if(document.visibilityState==="visible") restorePage();};
    void syncSession(true);
    window.addEventListener("pageshow",restorePage);
    document.addEventListener("visibilitychange",foreground);
    return () => { active = false;guard.invalidate();window.removeEventListener("pageshow",restorePage);document.removeEventListener("visibilitychange",foreground);data.subscription.unsubscribe(); };
  }, [setMessage]);

  async function signInWithGoogle() {
    if (signingIn.current) return;
    setMessage("");
    if (!supabase) { setMessage(supabaseConfigError); return; }
    signingIn.current = true; setIsSigningIn(true);
    try {
      // A restored login page may still have another account's cached session.
      // Clear only this browser session before starting a fresh account choice.
      await beginGoogleLogin(supabase,window.location.origin,url=>window.location.replace(url),()=>setSession(null));
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
