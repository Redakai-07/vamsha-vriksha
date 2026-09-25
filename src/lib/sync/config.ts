/**
 * Where the optional cloud lives.
 *
 * The app is a static export: there is no server runtime in this repository, so
 * synchronization talks to an external endpoint that the operator supplies at
 * build time. With neither variable set, nothing about the app degrades - the
 * offline experience is byte-for-byte the same and the sign-in surface explains
 * that sync is not configured rather than pretending.
 */
const rawEndpoint = process.env.NEXT_PUBLIC_VV_SYNC_ENDPOINT ?? "";
const rawGoogleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/** Base URL of the sync endpoint, without a trailing slash. Empty = unset. */
export const SYNC_ENDPOINT = rawEndpoint.replace(/\/+$/, "");

/** Google OAuth client id for the Google Identity Services flow. */
export const GOOGLE_CLIENT_ID = rawGoogleClientId;

/** True when a build was given somewhere to sync to and a way to sign in. */
export const CLOUD_CONFIGURED = Boolean(SYNC_ENDPOINT && GOOGLE_CLIENT_ID);

/** Human-readable reason the cloud options are unavailable, for the UI. */
export const CLOUD_UNCONFIGURED_REASON =
  "This build has no sync endpoint configured, so projects stay on this device. " +
  "Set NEXT_PUBLIC_VV_SYNC_ENDPOINT and NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google backup.";
