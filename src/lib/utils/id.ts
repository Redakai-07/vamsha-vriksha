/**
 * Ids are opaque strings. `crypto.randomUUID` exists in every browser we care
 * about and in Node 19+, but the app must never crash on an exotic webview
 * (Capacitor on old Android WebView), so there is a fallback.
 */
export function createId(prefix = ""): string {
  const globalCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  let raw: string;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    raw = globalCrypto.randomUUID();
  } else if (globalCrypto && typeof globalCrypto.getRandomValues === "function") {
    const bytes = globalCrypto.getRandomValues(new Uint8Array(16));
    raw = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    raw = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 12)}`;
  }
  return prefix ? `${prefix}_${raw}` : raw;
}

/** Deterministic, short, human-readable slug - used for exported file names. */
export function slugify(value: string, fallback = "vamsha"): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

export function nowIso(): string {
  return new Date().toISOString();
}
