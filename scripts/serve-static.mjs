/**
 * Dependency-free static server for the built export.
 *
 * Used to verify the offline story the way a user experiences it: build, serve
 * `out/`, open the app, then switch the network off and reload.
 *
 *   npm run build && npm start
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(process.cwd(), process.argv[2] ?? "out");

/** Port from `--port`/`PORT`, falling back to 4173 when unset or nonsensical. */
function resolvePort() {
  const flagIndex = process.argv.indexOf("--port");
  const fromFlag = flagIndex > -1 ? process.argv[flagIndex + 1] : undefined;
  const value = Number(fromFlag ?? process.env.PORT ?? 4173);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 4173;
}

const port = resolvePort();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const candidates = [];

  if (decoded.endsWith("/")) {
    candidates.push(path.join(root, decoded, "index.html"));
  } else {
    candidates.push(path.join(root, decoded));
    candidates.push(path.join(root, `${decoded}.html`));
    candidates.push(path.join(root, decoded, "index.html"));
  }
  candidates.push(path.join(root, "404.html"));

  for (const candidate of candidates) {
    if (!candidate.startsWith(root)) continue;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const server = createServer((request, response) => {
  const file = resolveFile(request.url ?? "/");
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
    return;
  }

  const extension = path.extname(file).toLowerCase();
  const headers = {
    "Content-Type": MIME[extension] ?? "application/octet-stream",
    // The service worker must never be served stale, or the app can get stuck.
    "Cache-Control": path.basename(file) === "sw.js" ? "no-store" : "no-cache",
  };

  response.writeHead(200, headers);
  createReadStream(file).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  console.log(`Vamsha-Vriksha static server: http://127.0.0.1:${boundPort}`);
  console.log(`Serving ${root}`);
});
