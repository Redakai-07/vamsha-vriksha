/**
 * Optional Google sign-in.
 *
 * What this module deliberately does NOT do: it never sees, asks for, transmits
 * or stores a password; it never persists a token to IndexedDB, localStorage or
 * a cookie; it never reads a token from one. Authentication happens entirely
 * inside Google's own Identity Services library, which hands back a short-lived
 * access token that lives in a module variable for the lifetime of the tab.
 *
 * The consequence is honest and intentional: after a reload the app still knows
 * *who* was signed in (so it can say so and offer to resume) but no longer holds
 * a credential, so it quietly asks Google for a new one. If Google is not
 * willing to renew without interaction, the user is asked to sign in again -
 * there is no long-lived secret sitting in a browser database for someone else
 * to steal along with the family tree.
 */
import { CLOUD_CONFIGURED, GOOGLE_CLIENT_ID } from "@/lib/sync/config";
import { writeAccount, type SyncAccount } from "@/lib/sync/identity";
import { getDeviceId, localAccountId, readAccount } from "@/lib/sync/identity";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const SCOPE = "openid email profile";

/** Refresh a little before the real expiry so a request never races the clock. */
const EXPIRY_SLACK_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void;
  callback: (response: TokenResponse) => void;
}

interface GoogleUserInfo {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let tokenClient: TokenClient | null = null;
let credential: { accessToken: string; expiresAt: number } | null = null;
let scriptPromise: Promise<GoogleIdentity> | null = null;

/** True when this build has somewhere to sync to and a client id to use. */
export function googleSignInAvailable(): boolean {
  return CLOUD_CONFIGURED;
}

function loadIdentityServices(): Promise<GoogleIdentity> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google sign-in is only available in the browser"));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<GoogleIdentity>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error("Google sign-in could not be initialised"));
    };
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Google sign-in is unreachable (offline?)")),
      { once: true },
    );
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

function requestToken(prompt: "" | "select_account" | "consent"): Promise<TokenResponse> {
  return loadIdentityServices().then(
    (google) =>
      new Promise<TokenResponse>((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(new Error(response.error_description || response.error || "Sign-in was cancelled"));
              return;
            }
            resolve(response);
          },
          error_callback: (error) => reject(new Error(error.message || error.type || "Sign-in failed")),
        });
        tokenClient = client;
        client.requestAccessToken({ prompt });
      }),
  );
}

function rememberToken(response: TokenResponse): void {
  if (!response.access_token) return;
  const lifetimeMs = (response.expires_in ?? 3600) * 1000;
  credential = { accessToken: response.access_token, expiresAt: Date.now() + lifetimeMs };
}

async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Could not read the signed-in account");
  return (await response.json()) as GoogleUserInfo;
}

async function accountFromToken(response: TokenResponse): Promise<SyncAccount> {
  rememberToken(response);
  const info = await fetchUserInfo(credential!.accessToken);
  return {
    accountId: `google_${info.sub}`,
    displayName: info.name || info.email || "Google account",
    email: info.email,
    provider: "google",
    pictureUrl: info.picture,
    signedInAt: new Date().toISOString(),
  };
}

export type SignInResult =
  | { ok: true; account: SyncAccount }
  | { ok: false; reason: string };

/** Interactive sign-in. Must be called from a user gesture. */
export async function signInWithGoogle(): Promise<SignInResult> {
  if (!googleSignInAvailable()) {
    return { ok: false, reason: "This build has no Google client id configured" };
  }
  try {
    const response = await requestToken("select_account");
    const account = await accountFromToken(response);
    await writeAccount(account);
    return { ok: true, account };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Renews the credential without user interaction. Used on start-up when the app
 * remembers a Google account, so reopening the browser resumes sync by itself
 * whenever Google still considers the session live.
 */
export async function renewGoogleCredential(): Promise<boolean> {
  if (!googleSignInAvailable()) return false;
  try {
    const response = await requestToken("");
    rememberToken(response);
    return Boolean(response.access_token);
  } catch {
    return false;
  }
}

/**
 * A practice account that lives entirely in this browser. It exists so the
 * synchronization engine can be used and inspected with no endpoint at all, and
 * it is always labelled as device-local - it is not a backup and never claims to
 * be one.
 */
export async function signInLocally(): Promise<SignInResult> {
  const deviceId = await getDeviceId();
  const account: SyncAccount = {
    accountId: localAccountId(deviceId),
    displayName: "This browser",
    provider: "local",
    signedInAt: new Date().toISOString(),
  };
  await writeAccount(account);
  return { ok: true, account };
}

/**
 * Remembers who was signed in, and - for Google - whether a live credential
 * still exists. Local data is never touched by any of this.
 */
export async function currentAccount(): Promise<SyncAccount | null> {
  return readAccount();
}

export function hasLiveCredential(): boolean {
  return Boolean(credential && credential.expiresAt > Date.now());
}

/** The bearer token for the sync endpoint, refreshed when it is nearly stale. */
export async function getAccessToken(): Promise<string | null> {
  if (!credential) return null;
  if (credential.expiresAt - Date.now() > EXPIRY_SLACK_MS) return credential.accessToken;
  const renewed = await renewGoogleCredential();
  return renewed ? credential!.accessToken : null;
}

/**
 * Signs out: the account row is removed and the in-memory token dropped. Every
 * project, person and relationship stays exactly where it was, and anything that
 * was queued stays queued.
 */
export async function signOut(): Promise<void> {
  const token = credential?.accessToken;
  credential = null;
  tokenClient = null;
  if (token && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(token);
    } catch {
      // Revocation is best-effort; the local sign-out must never fail because of it.
    }
  }
  await writeAccount(null);
}
