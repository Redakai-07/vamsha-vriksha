/**
 * Post-build step: writes `out/sw.js` with a precache manifest that lists every
 * file the static export actually produced, plus a cache version derived from
 * that list. Run automatically by `npm run build`.
 *
 * This is why the app works offline on the very first reload: the service
 * worker knows the hashed asset names instead of guessing them.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), process.argv[2] ?? "out");
const TEMPLATE = path.resolve(process.cwd(), "scripts", "sw-template.js");

/** Always-worth-caching URLs even if the walk skips them. */
const EXTRA_URLS = ["/", "/workspace/", "/offline/", "/manifest.webmanifest"];

/** Never precache: huge, or irrelevant to the shell. */
const SKIP = [/\.map$/, /^sw\.js$/, /\.DS_Store$/, /^_next\/cache\//];

function walk(directory, prefix = "") {
  const entries = [];
  for (const name of readdirSync(directory)) {
    const absolute = path.join(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync(absolute).isDirectory()) entries.push(...walk(absolute, relative));
    else entries.push(relative);
  }
  return entries;
}

function toUrl(relativePath) {
  if (relativePath.endsWith("/index.html")) {
    const base = relativePath.slice(0, -"index.html".length);
    return `/${base}`;
  }
  if (relativePath === "index.html") return "/";
  return `/${relativePath}`;
}

const files = walk(OUT_DIR).filter((relative) => !SKIP.some((pattern) => pattern.test(relative)));
const urls = new Set(EXTRA_URLS);
for (const file of files) urls.add(toUrl(file));

// Public-directory files (icons, manifest) are copied into out/ as well, so the
// walk already covers them; EXTRA_URLS simply guarantees the shell routes.
const manifest = [...urls].sort();
const cacheVersion = createHash("sha256")
  .update(manifest.join("|"))
  .update(readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"))
  .digest("hex")
  .slice(0, 12);

let template = readFileSync(TEMPLATE, "utf8");
template = template
  .replace("__CACHE_VERSION__", `vv-${cacheVersion}`)
  .replace("__PRECACHE_MANIFEST__", JSON.stringify(manifest, null, 2));

const target = path.join(OUT_DIR, "sw.js");
writeFileSync(target, template);
console.log(`service worker: ${manifest.length} precached URLs, cache vv-${cacheVersion}`);
