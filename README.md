# Vamsha-Vriksha

**ವಂಶ ವೃಕ್ಷ** — a family lineage.

An offline-first application for recording a family, its biodata, and the
 culturally specific relationships between its members, on an infinite canvas
that feels closer to Figma than to a CRUD dashboard.

Everything lives on the device. There is no server, no account, and no network
call on any code path: open the app, create a lineage, add people, record
relationships, close the browser, come back — offline, months later, and it is
all still there.

---

## Commands

```bash
npm install          # install dependencies
npm run dev          # dev server on http://localhost:3000
npm run build        # production build + service-worker generation
npm start            # serve the built app (static, offline-capable)
npm run typecheck    # tsc --noEmit
npm test             # vitest run (unit tests)
npm run icons        # regenerate PWA icons from the vector source
```

`npm run build` also writes the service worker (`scripts/generate-sw.mjs`),
precaching the whole shell so the app opens with the network switched off.

Cloud sync is opt-in at build time and needs no other change to the app:

```bash
NEXT_PUBLIC_VV_SYNC_ENDPOINT=https://your-endpoint npm run build
NEXT_PUBLIC_GOOGLE_CLIENT_ID=… npm run build
```

With neither set, the build is identical in behaviour to a purely local one and
the sign-in dialog says so.

---

## Architecture

The code is layered so that the interesting logic is pure, testable and
independent of React:

```
src/
  app/                      Next.js routes (dashboard, workspace, offline)
  components/
    canvas/                 canvas shell, nodes, edges, minimap, toolbar
    kinship/                relationship finder, path rendering, relationship guide
    person/                 profile panel, forms, biodata, relationship list
    projects/               lineage dashboard and cards
    shell/, settings/, ui/  providers, preferences, shadcn/ui primitives
  hooks/                    viewport controller, gestures, keyboard, live data
  stores/                   Zustand session state (selection, drag, finder mode)
  lib/
    domain/                 entities, invariants, the family graph
    db/                     Dexie schema, migrations, repositories, backup
    canvas/                 viewport math, layout engines, routing, placement
    relationship/           path finding + terminology (this is the core)
    sync/                   OPTIONAL replication: queue, merge, engine, backends
    auth/                   OPTIONAL Google sign-in (no credentials stored)
    utils/                  ids, dates, names, images, downloads
```

Rules that keep the layers honest:

- **The canvas never holds kinship.** Node positions are presentation state in
  their own table (`canvasStates`); a relationship only exists because there is
  a row for it. Dragging a node near another node cannot create a bond.
- **The layout engine is pluggable.** `lib/canvas/layout` registers engines
  behind one interface (`compute(request) → positions/bounds/generations`), so
  the renderer never imports an algorithm.
- **Kinship words are data, not code.** No component contains a kinship term;
  the vocabulary lives in `lib/relationship/terms/*`.
- **Sync is a leaf, never a dependency.** `lib/db` and `lib/domain` know
  nothing about it: repositories call one staging helper, and the merge, the
  queue and the backends are all pure or trivially injected, so the app (and its
  tests) run identically with no account, no endpoint and no network.

---

## Data model

| Entity | Purpose | Key fields |
| --- | --- | --- |
| `Project` | One independent family tree | `name`, `description`, `kinshipSystem`, `createdAt`, `updatedAt`, `sync?` |
| `Person` | A human being | `name`, `displayName`, `gender`, `dateOfBirth`, `dateOfDeath`, `placeOfBirth`, `occupation`, `education`, `biography`, `profilePhoto`, `notes` |
| `Relationship` | A recorded fact between two people | `projectId`, `type` (`parent` \| `spouse` \| `sibling` \| `other`), `fromPersonId`, `toPersonId`, `label`, `status`, `notes` |
| `Biodata` | Extended, optional detail | `placeOfBirth`, `placeOfDeath`, `occupation`, `education`, `biography`, `customFields[]` |
| `CanvasState` | Per-device presentation | `viewport`, `nodePositions`, `pinnedPersonIds` |
| `UserPreferences` | App settings | `theme`, `canvasBackdrop`, `wheelBehavior`, `canvasContrast`, `showMinimap`, `showCulturalTerms`, `defaultKinshipSystem`, `reduceMotion` |

Every field except `Person.name` is optional. Dates accept `1948`, `1948-03`
or a full date, and "unknown" is a first-class answer.

### Relationships are facts, not labels

Only primitives are stored:

- `parent` — direction-aware (`from` is the parent of `to`)
- `spouse` — canonicalised on write
- `sibling` — stored **only** when the parents are unknown
- `other` — guru, godparent, guardian, or any named bond

Nothing else is stored. "Uncle", "cousin", "mava", "chikkappa" and friends are
*derived* every time they are needed:

```
Rama ──parent──▶ Krishna ──parent──▶ Arjuna
                                   ──parent──▶ Sahadeva     (same parents)
        ⇒ Arjuna is Sahadeva's brother  (derived, no row written)
```

Two siblings that share a recorded parent produce a **derived** sibling step
whose evidence (the shared parent) is carried on the step and highlighted in the
UI. That is why the app never duplicates a sibling row it can infer.

### Storage, migrations, backups

- Dexie/IndexedDB (`vamsha-vriksha`), one table per entity.
- Migrations are additive: each change adds a `this.version(n).stores({...})`
  block, optionally with `.upgrade(tx => ...)` rewriting rows in place. The
  database is never dropped and never reset at startup.
- No `localStorage` for data.
- Positions and viewport are read-modify-written **inside a transaction**, so a
  debounced viewport save can never roll back a node the user just placed.
- Full export / import (JSON) is available from Preferences & data, plus
  per-person export from the profile panel.

---

## Optional cloud backup & sync

The app is complete without an account; this section is the only thing that
changes that, and nothing else in the codebase branches on whether anyone is
signed in.

### What it does

- **`Continue without account` and `Sign in with Google` are offered side by
  side** (a chip in the dashboard header and the canvas toolbar opens the
  dialog). Signing in is never an onboarding wall.
- **IndexedDB stays the working database.** Sync is a replica layer: every
  repository writes locally first and queues as a side effect, inside the same
  transaction, so an edit can never block on the network and a failed sync is a
  delayed upload rather than a failed save.
- **Only what changed travels.** Pushes are driven by a coalesced per-entity
  outbox; pulls are incremental from a single watermark.
- **Status is stated plainly, and only when true:** `Local only`, `Offline`,
  `Offline · changes saved locally`, `Changes saved locally`, `Syncing…`,
  `Synced`.

### First sign-in

A device that has been used offline is asked, once:

> **You have existing local projects.** — *Back up these projects to your
> account* / *Keep them local* / *Do this later*

Nothing is uploaded before that answer. "Keep them local" is enforced in
`stageUpsert`/`stageDelete`, so a later edit cannot sneak the project back into
the queue; "Do this later" holds the lineages back and asks again next time.

### The shape of a synchronized record

Each entity gains an optional `sync` block plus a tombstone field:

| Field | Meaning |
| --- | --- |
| `sync.rev` | local revision, bumped by every local write |
| `sync.syncedRev` | the revision the provider acknowledged |
| `sync.cloudRev` | the provider revision this row descends from |
| `sync.origin` | device that produced the content (conflict tiebreaker) |
| `sync.state` | `local` / `pending` / `synced` / `conflict` |
| `deletedAt` | tombstone, so a delete cannot race an edit into oblivion |

Fields absent from `SYNC_PAYLOAD_FIELDS` never leave the device - most
importantly `CanvasState.viewport`, because where one person has scrolled to is
ergonomics, not genealogy. A delete is published as a tombstone rather than as
an absent row, which is what lets a device that is editing the same record
answer back with content instead of losing it.

### Conflicts

Every write to the provider is a **compare-and-set on `sync.cloudRev`**. A client
that is behind is *told* it is behind, and the answer is a three-way merge
against the last content both sides agreed on (`syncBase`):

1. a field only one side changed is taken from that side, silently - which is
   the common case, and means most "conflicts" never become conflicts;
2. a field both sides changed goes to the later `updatedAt`; ties are broken by
   comparing device ids, and then in favour of the cloud;
3. the losing value is written to the `conflicts` table and surfaced in the
   Backup & sync dialog, where one click puts it back and queues it;
4. list-like fields (canvas positions, pinned people, extra biodata fields) are
   merged by union, so two devices editing different things both keep their work;
5. a delete never destroys a concurrent edit, in either direction.

Last-write-wins is therefore never applied to a whole record, and nothing is
discarded without being kept somewhere the user can see and undo.

### Endpoints

`src/lib/sync/types.ts` defines the `SyncBackend` seam. Two implementations ship:

- `backend.local.ts` - the cloud simulated in a **separate** IndexedDB database
  (the "This browser" practice account). Used by the tests and by any build with
  no endpoint configured, so the whole engine is exercisable with no network.
- `backend.remote.ts` - JSON over HTTPS:

```
POST {base}/changes   { since, limit }  -> { records, cursor, hasMore }
GET  {base}/record    ?collection=&id=  -> { record } | 404
POST {base}/put       PutRecordInput     -> { record } | 409 { current }
GET  {base}/project   ?projectId=       -> { records }
GET  {base}/all                          -> { records }
```

`/put` **must** be a compare-and-set on `baseRev` and **must** answer `409` with
the current row when the client is behind. That is the only guarantee the merge
logic relies on.

### Configuration & security

```bash
NEXT_PUBLIC_VV_SYNC_ENDPOINT=https://…   # absent: sync stays device-local
NEXT_PUBLIC_GOOGLE_CLIENT_ID=…           # absent: the dialog says so
```

Google sign-in uses Google Identity Services: **the password is never seen,
stored or transmitted by this app**, and the short-lived access token lives in a
module variable - never in IndexedDB, `localStorage` or a cookie. After a reload
the app asks Google to renew silently and, if Google requires interaction, says
"Sign in again to sync" rather than pretending. A deployment that wants
long-lived sessions should exchange the token for its own session at the
endpoint. Error messages carry status codes, never payloads - no family data is
logged. **Signing out removes the account row and keeps every project.**

### Verifying without a provider

The practice account exercises the whole engine - queue, push, pull, tombstones,
merges, conflicts, recovery - against a mirror in this browser. It is labelled as
device-local everywhere it appears and is never presented as a backup.

---

## The relationship engine

`src/lib/relationship` answers one question: *how are these two people related,
and why?*

```ts
describeRelationship(graph, personAId, personBId, { system: "kn" })
```

```ts
{
  found, sourcePersonId, targetPersonId, sourceName, targetName,
  path: { personIds, steps, tokens, edgeIds, derivedSiblingPairs },
  relationshipType: { kind, bloodRelated, generationDelta, direction, hasMarriage },
  relationshipTerm: { language, term, script, englishMeaning, explanation, confidence, ruleId },
  terms: RelationshipTermMatch[],
  explanation, forwardExplanation, branchSummary, literal, inverseLiteral,
  confidence, seniorityUnknown,
}
```

**Traversal** — breadth-first shortest path over primitive facts with
visited-node protection, a depth cap and a cycle guard. `findRawPaths` returns
several distinct simple paths (shortest first) so the finder can say "also
connected: …" instead of hiding a second route. The graph is treated as a graph,
never a tree: marriage, remarriage and cross-family links are all normal.

**Normalisation** — the raw walk is collapsed into idiomatic tokens
(`F` father, `M` mother, `s` son, `d` daughter, `b` brother, `z` sister,
`H` husband, `W` wife). `F + s` becomes `b`, `Mb + d` becomes `z`, and so on, so
the path phrases read the way a person would say them.

**Classification** — graph-derived and cultural-assumption-free: lineal,
collateral, affinal or mixed, plus generation delta, direction, whether a
marriage was crossed and whether dates settled elder/younger.

**Terminology** — one declarative rule table per language
(`terms/english.ts`, `terms/hindi.ts`, `terms/kannada.ts`). A rule says: *when
the normalised path is exactly these tokens, and the relative is this gender and
this seniority, the family word is X* — with script, English meaning, curated
note, assumptions and region. The resolver matches rules against a path, so a
new language is a new file, not a rewrite of the UI.

### Three levels of confidence

The engine will not invent a word:

| Confidence | Meaning | Example |
| --- | --- | --- |
| `exact` | The graph carries everything the term needs | Krishna is Radha's husband → **hendathi / ಹೆಂಡತಿ** |
| `general` | A real term applies, but it is a secondary or regional sense (`note` shown) | `mava` in some districts |
| `uncertain` | The path is known but the vocabulary cannot name it — the explanation is shown instead | Arjuna → *father's wife* → Radha: she may or may not be his mother |

An unnamed relationship is never a dead end: the panel shows the literal path
("father's wife"), the sentence ("Arjuna is Radha's husband's son."), the branch
it runs through, and what the graph is missing ("Needs: no term in this
vocabulary for this path"). Where a term needs dates the graph does not have
(elder vs younger brother), seniority is reported as unsettled instead of
picking one.

### Relationship Finder (canvas mode)

1. Select person A (or open the finder with someone already selected).
2. Click person B on the canvas.
3. **Find relationship** — the engine walks the graph, outlines and dims the
   canvas so the whole path stands out, and explains it: the term (script +
   transliteration), the path chain (`A — father — Krishna — wife — Radha`), the
   classification, the branch, alternatives, and *Frame the path* to fly the
   camera to it.

A list-based picker is available for the same computation without the canvas.

### Relationship guide

A searchable reference for the vocabulary itself: term, transliteration, native
script, English meaning, who is who, the example path and token string, gender
and age assumptions, generation, and region — per language (English, Hindi,
Kannada), with typed search such as `mother's brother`, `tamma` or `ಅಮ್ಮ`.

It also lists **Not asserted**: relationships the app deliberately declines to
name, with the reason and what families say instead. A guide that only showed
confident terms would teach people to trust guesses, so the gaps are part of the
reference.

---

## Canvas

Infinite pan/zoom with wheel, trackpad pinch, touch and keyboard; fit-to-content,
zoom to selection, focus a path, tidy-up layouts, minimap, drag-to-place with
snapping, and a subtle dot grid that fades as you zoom out. Quick actions appear
around the person you are working with (add parent / child / spouse / sibling /
other) rather than as permanent buttons on every node.

Keyboard: `F` or `0` fit, `+`/`-` zoom, `1` reset zoom to 100%, `N` new person,
`L` tidy up, `C` centre the selected person, `M` minimap, `/` relationship
finder, `G` relationship guide, `?` shortcut sheet, arrow keys pan,
`Delete`/`Backspace` remove the selected person, `Esc` backs out of the innermost
mode. Typing in any field disables every shortcut.

---

## PWA & native shell

- `public/manifest.webmanifest` + generated icons → installable.
- A generated service worker precaches the shell; the app opens offline and
  shows an explicit offline route when a navigation misses the cache.
- `capacitor.config.json` is in place, and the build output is a static export,
  so wrapping for Android/iOS later needs no architectural change.

---

## Tests

```bash
npm test
```

150 unit tests across eleven suites, all pure (fake IndexedDB, no browser):

- `viewport` — pan/zoom math, screen↔world round-trips, fit-to-content
- `layout` — generation assignment (couples, sibling chains, cycles), overlap
  freedom, determinism, component separation
- `relationship-engine` — traversal, normalisation, classification, template
  phrases, terminology resolution, confidence, gap handling
- `relationships` — storage invariants, direction rules, duplicate/cycle refusal
- `kinship` — terms, script rendering and the result view helper
- `db` — repositories, cascades, migrations, backups, placement writes
- `sync-merge` — three-way merge, union merges, deterministic tie-breaking,
  delete-vs-edit in both directions, preservation of the losing value
- `sync-queue` — staging inside the writer's transaction, coalescing, tombstones
  with their base revision, cascades, and "keep it local" exclusions
- `sync-engine` — offline behaviour, incremental pushes, a second device editing
  the same person (clean merge *and* conflict), delete resurrection, recovery on
  a wiped device, and work that predates sync entirely

Verified by hand in a browser as well: offline reload with the network off,
add/edit/persist, relationship creation, finder path highlighting, guide search,
the "unnamed relationship" path, and the full optional-sync walkthrough -
offline use, sign-in, the first-sign-in question, backup, a reload, an offline
edit, reconnecting, a change arriving from another device, and signing out.

---

## Known limitations

- **Kannada and Hindi coverage is intentionally partial.** Only terms that are
  in common use are asserted; regional and dual-sense cases are marked `general`
  or left unnamed. Adding Tamil, Telugu, Marathi is a new terms file plus a
  `LanguageCode` entry.
- Seniority (elder/younger sibling) needs recorded dates; without them the
  engine reports the relationship as seniority-unknown rather than guessing.
- `other` relationships are recorded and displayed but not traversed for
  kinship naming.
- The layout is a single-pass layered layout with a sibling-group rule; very
  large or heavily interconnected graphs can still produce long edges. Manual
  drag, pinning and tidy-up exist for that reason.
- Cloud sync is optional and unverified against a real provider: the HTTP
  adapter implements the documented contract, but the endpoint itself is an
  external service this repository does not contain. Builds without
  `NEXT_PUBLIC_VV_SYNC_ENDPOINT` never leave the device.
- Google tokens are deliberately not persisted, so a signed-in session needs
  silent renewal (or one tap) after a reload, and true long-lived sessions need
  a token exchange at the endpoint.
- "Keep them local" is per device, not per account: a project kept back on this
  browser stays back even if another account signs in here.
- Sharing and access control are not implemented - a project belongs to the
  account that backed it up and to no one else.
- Merge granularity is the field, not the value inside it: two devices editing
  the same free-text biography produce one winner plus a preserved copy rather
  than an interleaved merge.
- Backup files are plain JSON (readable, no encryption).

---

## Roadmap

A first provider integration (verified end to end against a real endpoint),
sharing a lineage with relatives who may only edit part of it, per-field conflict
resolution UI for long text, printed pedigree charts, audio-recorded oral
histories attached to a person, and Capacitor builds for Android/iOS.
