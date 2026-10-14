import { DRIVE_SCOPE } from "./googleDriveAuth.js";
const pending = new Map();
export const pendingLoginDriveToken = userId => pending.get(userId);

// Reuse the Google token from app login only after Google confirms its
// OAuth client, granted scope and remaining lifetime. Never use the app JWT.
export function cacheLoginDriveToken(session, clientId, { storage = window.sessionStorage, fetchImpl = fetch, now = Date.now } = {}) {
  const owner = session?.user?.id || "";
  storage.setItem("googleDriveLoginUserId", owner);
  if (!owner || !clientId || !session.provider_token) return Promise.resolve(false);
  if (pending.has(owner)) return pending.get(owner);
  if (storage.getItem("googleDriveUserId") === owner && storage.getItem("googleDriveClientId") === clientId &&
      storage.getItem("googleDriveAccessToken") && Number(storage.getItem("googleDriveTokenExpiresAt")) > now() + 60_000) return Promise.resolve(true);
  const job = (async () => {
    try {
      const response = await fetchImpl(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(session.provider_token)}`, {
        signal: AbortSignal.timeout(10_000), cache: "no-store",
      });
      if (!response.ok) return false;
      const info = await response.json();
      const lifetime = Number(info.expires_in);
      if ((info.aud || info.issued_to) !== clientId || !String(info.scope || "").split(/\s+/).includes(DRIVE_SCOPE) ||
          !Number.isFinite(lifetime) || lifetime <= 60 || storage.getItem("googleDriveLoginUserId") !== owner) return false;
      // A user may connect Drive explicitly while this check is in flight.
      if (storage.getItem("googleDriveUserId") === owner && storage.getItem("googleDriveClientId") === clientId &&
          Number(storage.getItem("googleDriveTokenExpiresAt")) > now() + 60_000) return true;
      storage.setItem("googleDriveUserId", owner);
      storage.setItem("googleDriveClientId", clientId);
      storage.setItem("googleDriveAccessToken", session.provider_token);
      storage.setItem("googleDriveTokenExpiresAt", String(now() + Math.min(lifetime, 3600) * 1000));
      if (typeof info.email === "string") storage.setItem("googleDriveAccountEmail", info.email);
      return true;
    } catch { return false; }
  })();
  pending.set(owner, job);
  job.finally(() => { if (pending.get(owner) === job) pending.delete(owner); });
  return job;
}
