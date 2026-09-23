import type { Gender, Person } from "@/lib/domain/types";

/**
 * Presentation helpers for people. Everything here is pure so it can be unit
 * tested and reused by the canvas, the panel and the exporter.
 */

export function getInitials(person: Pick<Person, "name" | "displayName">): string {
  const source = (person.displayName || person.name || "").trim();
  if (!source) return "?";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function getGreetingName(person: Pick<Person, "name" | "displayName">): string {
  return (person.displayName || person.name || "Unnamed").trim();
}

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  unknown: "Not specified",
};

/**
 * A calm, cultural palette for generated avatars - drawn from the same family
 * as the design tokens (indigo, saffron, teal, rose, clay) so initials never
 * clash with the identity.
 */
const AVATAR_TINTS: Record<string, { bg: string; fg: string }> = {
  indigo: { bg: "oklch(0.42 0.088 288 / 0.14)", fg: "oklch(0.38 0.09 288)" },
  saffron: { bg: "oklch(0.72 0.132 62 / 0.18)", fg: "oklch(0.42 0.1 58)" },
  teal: { bg: "oklch(0.55 0.055 195 / 0.18)", fg: "oklch(0.38 0.06 195)" },
  rose: { bg: "oklch(0.6 0.09 15 / 0.16)", fg: "oklch(0.42 0.1 15)" },
  clay: { bg: "oklch(0.58 0.07 40 / 0.18)", fg: "oklch(0.4 0.08 40)" },
  plum: { bg: "oklch(0.46 0.07 320 / 0.16)", fg: "oklch(0.38 0.08 320)" },
};

const TINT_KEYS = Object.keys(AVATAR_TINTS);

/** Stable hash so the same person always gets the same tint. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function avatarTint(seed: string): { bg: string; fg: string } {
  return AVATAR_TINTS[TINT_KEYS[hashString(seed) % TINT_KEYS.length]];
}

/** One-line summary used on nodes and cards. */
export function personSubtitle(person: Person): string {
  const parts: string[] = [];
  const birth = person.dateOfBirth?.slice(0, 4);
  const death = person.dateOfDeath?.slice(0, 4);
  if (birth && death) parts.push(`${birth}–${death}`);
  else if (birth) parts.push(`b. ${birth}`);
  else if (death) parts.push(`d. ${death}`);
  if (!parts.length && person.gender && person.gender !== "unknown") {
    parts.push(GENDER_LABELS[person.gender]);
  }
  return parts.join(" · ");
}

export function comparePeopleForListing(a: Person, b: Person): number {
  const aKey = (a.displayName || a.name).toLowerCase();
  const bKey = (b.displayName || b.name).toLowerCase();
  return aKey.localeCompare(bKey);
}

export function matchesQuery(person: Person, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    person.name.toLowerCase().includes(q) ||
    (person.displayName ?? "").toLowerCase().includes(q) ||
    (person.notes ?? "").toLowerCase().includes(q)
  );
}
