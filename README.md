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

---

## Data model

| Entity | Purpose | Key fields |
| --- | --- | --- |
| `Project` | One independent family tree | `name`, `description`, `kinshipSystem`, `createdAt`, `updatedAt` |
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

96 unit tests across six suites, all pure (fake IndexedDB, no browser):

- `viewport` — pan/zoom math, screen↔world round-trips, fit-to-content
- `layout` — generation assignment (couples, sibling chains, cycles), overlap
  freedom, determinism, component separation
- `relationship-engine` — traversal, normalisation, classification, template
  phrases, terminology resolution, confidence, gap handling
- `relationships` — storage invariants, direction rules, duplicate/cycle refusal
- `kinship` — terms, script rendering and the result view helper
- `db` — repositories, cascades, migrations, backups, placement writes

Verified by hand in a browser as well: offline reload with the network off,
add/edit/persist, relationship creation, finder path highlighting, guide search,
and the "unnamed relationship" path.

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
- No authentication, cloud sync or collaboration yet — by design for this phase.
- Backup files are plain JSON (readable, no encryption).

---

## Roadmap

Cloud sync as an *optional* enhancement (Google auth), multi-device merge with
per-record vector clocks, printed pedigree charts, audio-recorded oral
histories attached to a person, and Capacitor builds for Android/iOS.
