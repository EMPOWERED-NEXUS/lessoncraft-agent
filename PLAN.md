# LessonCraft plan (pre-existing)

This file is the earlier LessonCraft plan. The hackathon pathway is Nexus Pathways, documented in `README.md`. Do not treat this plan as the current product, and do not run the draft Zetaris SQL until it is explicitly approved.

# LessonCraft plan (pre-implementation)

Adaptive, source-grounded learning agent for the Open Agent Hackathon 2026. This document supersedes the earlier “one-topic CLI” sketch. **Do not implement or run Zetaris write SQL until local connection details and the exact statements are checked.**

## Product intent

LessonCraft helps a learner through a difficulty: it combines the learner’s response, **approved lesson evidence from Zetaris**, and **Meterless H-MEM learning memory** to explain the difficulty, teach with a visual, check understanding, then adapt or advance.

The product is **not** a Cameroon-only tutor. Cameroon is the **first curriculum context for validation**. Packs must be able to describe any country, education subsystem, age/grade or level, subject, and language.

## Non-negotiables

- **Cursor** is the primary development environment.
- **Zetaris** is the governed store for curriculum packs and approved lesson evidence. Taxi / TPCDS samples are connectivity checks only, never learning content.
- **Meterless H-MEM** holds learner memory (prior difficulties, answers, what helped, what did not).
- Secrets live in local env files (`.env.local`). **`.env.example` holds placeholders only.**
- Learner interaction is **visible in a simple browser screen** (not CLI-only).
- **No scrape, copy, store, or rehost** of material from eStudyUniverse, Kamerpower, MeetLearn, OpenExamPrep, or any other site based only on free web access.
- For sources **without confirmed reuse permission**: keep a **citation and link only**. Do not store body text, images, or PDFs.
- First working journey uses **content we created or have permission to use**. Topic stays **flexible until source material is selected**.

## Curriculum packs

A pack is a versioned, queryable unit. One country can have many packs (subsystem × language × grade band × subject).

### Pack identity

| Field | Purpose |
|---|---|
| `pack_id` | Stable id, e.g. `cm-anglophone-primary-p4-maths-en` |
| `country_code` | ISO 3166-1 alpha-2 (`CM` first) |
| `country_name` | Display name |
| `education_subsystem` | e.g. Cameroon Anglophone, Cameroon Francophone, later other national systems |
| `grade_or_level` | Age band, grade, form, or CEFR-style level as used in that subsystem |
| `subject` | Maths, science, language, etc. |
| `language_code` | BCP 47 (`en`, `fr`, later others) |
| `age_min` / `age_max` | Optional inclusive ages for UI filtering |
| `status` | `draft` \| `validated` \| `retired` |

### Pedagogy

| Field | Purpose |
|---|---|
| `learning_objectives` | List of objective ids + statements |
| `prerequisites` | Objective or pack ids the learner should already hold |
| `assessment_style` | How this pack checks understanding (short answer, MCQ, worked example, oral prompt, etc.) |
| `misconception_catalog` | Known difficulties this pack can diagnose |

Cameroon validation examples (not a product cap):

- Anglophone Primary 4 Mathematics, English
- Francophone CE2 Mathématiques, French

The same schema must accept, without code changes to the pack shape, e.g. a later `NG` or `GB` pack.

## Content classes and provenance

Every lesson artefact has a **source class** and reuse fields. The agent only **teaches from** artefacts that are approved for reuse. Citations without permission never become explanation text.

### Source class

| `source_class` | What we may store | What the agent may do |
|---|---|---|
| `original` | Full LessonCraft-authored text, visuals, questions | Retrieve, display, adapt |
| `licensed_oer` | Full text/assets under a confirmed open licence | Retrieve, display, adapt, **attribute** as required |
| `creator_authorized` | Full text/assets with recorded permission | Retrieve, display, adapt, **attribute** |
| `citation_only` | Title, owner, URL, note — **no body** | Show “see this source”; do not quote or rehost |

**Blocked as content sources (citation-only at most, and only if the user explicitly wants a pointer):** eStudyUniverse, Kamerpower, MeetLearn, OpenExamPrep, and similar exam/note sites. Default is **do not ingest them at all**.

### Provenance fields (every artefact)

| Field | Required |
|---|---|
| `source_title` | Yes |
| `source_owner` | Yes |
| `source_url` | If it exists |
| `licence_or_permission` | SPDX id, “LessonCraft original”, or “written permission dd-mm-yyyy” |
| `attribution` | Exact credit line to display |
| `page_or_section` | If applicable |
| `permission_evidence` | Internal note / filename of permission; never a secret |
| `reuse_ok` | Boolean; must be true to load body into Zetaris teachable tables |

## First end-to-end lesson (hackathon slice)

Build **one** adaptive lesson in the browser:

1. Learner (or demo selector) picks pack context: country, subsystem, grade/level, subject, language — Cameroon defaults, not hard-coded limits.
2. Learner answers a prompt or states a difficulty.
3. Agent combines: **this response** + **approved Zetaris evidence** + **H-MEM memories for this learner**.
4. Screen shows: diagnosis, evidence-backed explanation, **visual**, check question.
5. Learner answers in the same screen.
6. Agent **adapts** (reteach with a different visual/example) or **advances** (next objective / mastery note).
7. H-MEM stores what was hard, what was shown, and whether the check passed.

**Topic is not chosen yet.** After a permitted source is selected (original LessonCraft piece or confirmed OER/permission), bind one `lesson_id` and one misconception to that pack. Until then, keep lesson JSON as a schema + placeholders, not copied web notes.

## Architecture (smallest that still matches the product)

```
Browser (simple single page)
  → local LessonCraft server (Node/TypeScript)
       → Zetaris REST/UI-proxy (read-only until writes are approved)
       → Meterless H-MEM (local persist dir)
```

- **Cursor**: all development in this repo; no Cursor SDK required for v1.
- **No Next.js** for v1: static HTML + a small local HTTP server is enough for a visible learner screen.
- **LLM** optional: rule-based diagnosis for the first lesson; env-configured model only if free-text teaching needs it.
- **Visuals**: Mermaid (or SVG) generated from approved `visual_spec` in Zetaris, rendered in the page.

### Zetaris data (logical)

Read path after objects exist:

- `curriculum_packs` — pack identity + pedagogy fields
- `lessons` — teachable artefacts with `reuse_ok = true` only
- `lesson_objectives`, `prerequisites`, `check_items`
- `source_records` — provenance; citation-only rows have **no body columns populated**

Write path: **deferred**. Register objects only after:

1. Local `ZETARIS_BASE_URL` / `ZETARIS_REST_URL`, org id, and auth method are confirmed.
2. Exact `CREATE`/`CACHE` SQL is reviewed (dry-run).
3. Explicit go-ahead.

Until then, the server may load the same JSON from disk **only as a development stand-in**, clearly labelled, so the browser journey can be wired. Production retrieval is Zetaris.

### Meterless H-MEM

Named services (judges look for this):

| Journey step | Engine |
|---|---|
| Store difficulty + answer | MemoryMiningService / MemoryStoreService |
| Recall what helped this learner | MemoryRetrievalService |
| Record check outcome | `feedback` / TrustLedger as available |
| Optional later | SleepCycleService — not required for first demo |

Keys in memory content should include `pack_id`, `learner_id` (local demo id), `objective_id`, language — so packs do not bleed across countries or levels.

## Learner screen (v1)

One page, no login product:

- Context chips: country, subsystem, grade, subject, language
- Prompt / learner input
- Diagnosis + explanation (quotes only from `reuse_ok` evidence)
- Visual panel
- Check question + answer box
- Adapt / advance outcome
- Attribution footer from provenance fields
- Hidden-from-learner but demo-visible: “evidence from Zetaris” and “memory from H-MEM” so the hackathon path is obvious

## Secrets and runbook (to document at implementation)

`.env.example` placeholders only:

```dotenv
ZETARIS_BASE_URL=http://localhost:3000
ZETARIS_REST_URL=http://localhost:8888/api/v1.0
ZETARIS_ORG_ID=
ZETARIS_API_KEY=
ZETARIS_USERNAME=
ZETARIS_PASSWORD=
ZETARIS_QUERY_LIMIT=100
LESSON_PACK_ID=
LEARNER_ID=demo-learner
LLM_API_KEY=
LLM_BASE_URL=
LLM_MODEL=
PORT=8787
```

Document in README when code exists:

1. Copy `.env.example` → `.env.local`
2. `npm install` and Meterless `npm run setup` (vendors H-MEM; `vendor/` gitignored)
3. `npm run dev` — opens the learner page
4. Read-only Zetaris check: `SELECT 1` and `SHOW LIGHTNING DATABASES` — not taxi content
5. Writes: only after connection + SQL review

## Files to add at implementation (not created yet except this plan)

| Path | Role |
|---|---|
| `.gitignore` | `.env`, `.env.local`, `node_modules/`, `vendor/`, `.lessoncraft/` |
| `.env.example` | Placeholders |
| `package.json`, `tsconfig.json` | Node/TS server + H-MEM setup |
| `src/server.ts` | Local HTTP API + static page |
| `src/zetaris.ts` | One SQL statement per call; read-only by default |
| `src/hmem.ts` | Vendored H-MEM loader |
| `src/journey.ts` | Diagnose → evidence → visual → check → adapt |
| `src/provenance.ts` | Enforce `reuse_ok`; strip citation-only bodies |
| `public/index.html` | Learner screen |
| `packs/schema.json` | Pack + artefact JSON schema |
| `packs/cm-validation/` | Cameroon validation pack **after** source is chosen |
| `sql/00_readonly_check.sql` | `SELECT 1`; `SHOW LIGHTNING DATABASES` |
| `sql/01_create_curriculum.sql` | Draft only; do not run until approved |
| `README.md` | How to run |

Do **not** add scraped notes, PDFs, or HTML dumps from blocked or unlicensed sites.

## Blockers (still true)

1. Repo has no app code; only README + this plan.
2. No Zetaris connection details in this workspace.
3. **Zetaris writes blocked** until connection and SQL are checked.
4. First lesson **source material not selected**; topic remains open.
5. Meterless H-MEM not vendored until install/setup (later).
6. Optional LLM key only if we drop rule-based copy.

## Implementation order (when unblocked)

1. Gitignore, env example, schema, empty Cameroon pack **structure**, provenance enforcement.
2. Browser page + local server with disk stand-in and H-MEM (no Zetaris writes).
3. Confirm Zetaris read connectivity.
4. Review create SQL → wait for go-ahead → register approved tables only.
5. Bind the chosen original/permitted lesson; run the full adaptive loop in the browser.
