// Remove consumed callback credentials/errors from the current history entry.
// Keep ordinary query parameters and app hashes.
export function cleanAuthCallbackUrl(href) {
  const url=new URL(href);
  const keys=["code","access_token","refresh_token","provider_token","provider_refresh_token","expires_in","expires_at","token_type","error","error_code","error_description"];
  for(const key of keys) url.searchParams.delete(key);
  const hash=new URLSearchParams(url.hash.slice(1));
  if(keys.some(key=>hash.has(key))) {for(const key of keys)hash.delete(key);url.hash=hash.toString();}
  return url.href;
}

export function createSessionReadGuard() {
  let revision=0;
  return {invalidate(){revision++;},begin(){const current=++revision;return()=>current===revision;}};
}
import {googleLoginOptions} from "./googleLogin.js";

export async function beginGoogleLogin(client,origin,navigate,onCleared=()=>{}) {
  const signedOut=await client.auth.signOut({scope:"local"});
  if(signedOut.error) throw signedOut.error;
  onCleared();
  const options=googleLoginOptions(origin);
  options.options.skipBrowserRedirect=true;
  const {data,error}=await client.auth.signInWithOAuth(options);
  if(error) throw error;
  if(!data?.url) throw new Error("OAuth redirect missing");
  navigate(data.url);
}

