# LessonCraft by Empowered Nexus

LessonCraft Pathways helps a learner compare evidence they choose with one skill requirement, see what that evidence does and does not show, and take one next step they can accept, edit, or dismiss.

**Product:** LessonCraft by Empowered Nexus. Pathways is the evidence area.  
**Track:** The Agent That Can Explain Why, Open Agent Hackathon 2026.  
**Demo:** one workplace status-update pathway. This is not a general course platform, and it does not claim to teach every subject.

A country is optional context. The default is International (`ZZ`). Cameroon is one optional context, not the product boundary and not an official hiring or qualification standard. There is no numeric person score.

The fraction tutor at [/](http://127.0.0.1:8787/) was already in this working tree before the pathway. It is kept. The hackathon surface is [/pathways/](http://127.0.0.1:8787/pathways/).

## Demo command

Node.js 20 or later.

```powershell
cd c:\apps\lessoncraft-agent\lessoncraft-agent
copy .env.example .env.local
npm ci
npm run setup
npm test
npm run dev
```

Open [http://127.0.0.1:8787/pathways/](http://127.0.0.1:8787/pathways/). If that server is already running, use it. Do not start a second process on port 8787.

Sign-in at [http://127.0.0.1:8787/login](http://127.0.0.1:8787/login) is unavailable. **Try demo** opens Pathways without an account. Zetaris credentials are not a learner login.

`npm run setup` vendors Meterless H-MEM at commit `1742dec56a66e58eef9dda2d2b865823758ca8cd`. `vendor/` is gitignored. There is no separate typecheck or production-build script. `npm test` runs the project checks with `tsx`.

The spoken script and slide outline are in [docs/DEMO.md](docs/DEMO.md).

## What the pathway does

1. The learner can start from Demo A, B, C, or D, or enter their own quiz answers and an optional note.
2. Evidence Analyst maps chosen quiz answers and the note to competency claims: demonstrated, needs more evidence, or not assessed.
3. Pathway Planner proposes one next step, asks one question, or abstains.
4. Verification Agent blocks unsupported claims, missing provenance, the wrong language, a country mismatch, blocked datasets, and hiring language. The planner may revise once. Repairs stop at two, then the run escalates.
5. The page shows why, what is uncertain, the sources, and one action the learner can accept, edit, or dismiss.
6. Practice and transfer use a stored answer key for closed items and a teacher-approved rubric for open responses. That match is not a grade.
7. Optional Meterless memory stores only the consented minimum, and the learner can delete it.

The roles share one run. The trace names each role. Recommendations are produced in this repository. They are not model output.

## Current capabilities

- English and French interface. Source excerpts, quiz prompts, and the open-education passage stay in their original language. Page language, explanation language, and document language are separate. Source auto-detection is not available.
- Readable files, up to 8 MB: TXT, Markdown, DOCX, PPTX, and digital PDF text. The learner can correct extracted text before lesson use.
- Refused, and never sent into the lesson request: JPG/PNG (OCR is not configured), CSV/XLSX, audio, video, empty files, and PDFs with no extractable text.
- Lesson text and contribution drafts stay in this page’s memory for the current visit. Delete one item, delete all, or reload the page. They are not written to browser storage.
- Browser storage is limited to the tour-done flag and the page language.
- The LessonCraft mark is the header mark, favicon, and app icon. The EmpowerEd Nexus logo is used as supplied.

## Privacy

| Data | Where it lives |
|---|---|
| Reviewed lesson text and contribution drafts | This page’s memory for the current visit only |
| Tour completion and UI language | `localStorage` on this browser only |
| Consented memory | Meterless H-MEM under `.lessoncraft/pathways-hmem/`: pseudonymous id, goal, demonstrated competency ids, outcome, and feedback |
| Learner notes, file bytes, and drafts | Not sent to Zetaris or Meterless |
| Passwords | Not stored. No account is created |

Using text for the current lesson does not contribute it for other people and does not permit model training. A contribution draft is not submitted, reviewed, or shared. A license choice is the learner’s declaration, not a rights check. Model training stays off.

## Zetaris

Pathway structure always comes from `data/pathways/pw-workplace-status-update.json`.

When Lightning JDBC is configured, the app sends one read-only statement for `NEXUS_PATHWAYS.passages`, filtered to `approved_public`, `published`, `retrieval_only`, and `approved public resource`. A row is labeled as a Zetaris supporting passage only after that metadata is checked again in the app. If JDBC is unset, login fails, the query fails, no row returns, or the metadata is invalid, the page stays on the fixture and says so. Private uploads are rejected. `NY_TAXI` and `TPCDS` are not learning evidence.

Do not execute `sql/02_nexus_pathways_draft.sql` until that load is separately approved. The app does not copy CSV files into Zetaris.

`npm run jdbc-ping` checks `SELECT 1` only. `npm run diagnostic` is the older UI-proxy check and stays idle when those variables are unset.

## Meterless H-MEM

Real calls against the pinned reference engine, actor `nexus-pathways`:

| Step | Service |
|---|---|
| Mine the consented summary | `MemoryMiningService` |
| Store goal, demonstrated ids, outcome, feedback | `MemoryStoreService` |
| Recall that record | `MemoryRetrievalService` |
| Record helpful or not helpful | `feedback` |
| Reset | `MemoryStoreService.delete` |

Consent off means nothing is written. The typed note and uploaded files are not in the stored sentence.

## NVIDIA Nemotron

A live Nemotron call is not a submission requirement. The published rules require every submission to integrate Zetaris and Meterless. They say to integrate NVIDIA technology wherever it contributes. Best use of NVIDIA Nemotron is a separate in-kind prize.

This pathway does not call Nemotron or any other model. If `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` are set, the run mode is `foundation-model-unused` and the trace says the endpoint was not called. With those variables empty, the mode is `deterministic-no-llm`. Tests use `deterministic-test`. Nothing here pretends a model answered.

A live Nemotron run would need a real Meterless Nightshift or NVIDIA endpoint, a real token (the placeholder `rt-local` is not a credential), and a model id that actually serves Nemotron. Those values are not configured for this demo, and this pathway would still need a separate reviewed change before any model text could appear in a recommendation.

## Sources

| Source | What it is | Reuse |
|---|---|---|
| `src-np-en-01`, `src-np-fr-01` | Original LessonCraft status-update text | Teach and recommend |
| `src-np-rubric-01` | Teacher-approved rubric | Match open responses |
| `src-quiz-01` | Original synthetic quiz | Evidence for quiz claims |
| `src-synth-cert-01` | Fictional certificate | Only if the learner chooses to share it, and only for a fact it can support |
| `src-ilo-youth-2024`, `src-wb-jobs` | ILO and World Bank citations | Context links only. Not learner evidence |
| `src-twe-75` | Technical Writing Essentials, 2nd edition, Suzan Last, editor, BCcampus, section 7.5 Progress Reports. CC BY 4.0. Quoted rows exclude listed book exceptions, including figure 7.4.3. | Supporting passage only when a reviewed public Zetaris row passes the filter. Not an official standard |

ESCO was not copied. Public course sites are not ingested.

## Environment

Copy `.env.example` to `.env.local`. Do not commit secrets. Leave a value blank rather than guessing.

| Variable | Purpose |
|---|---|
| `PORT` | Server port, default `8787` |
| `LEARNER_ID`, `LESSON_PACK_ID` | Fraction-tutor demo only |
| `LESSONCRAFT_TEST_MODE` | `1` forces the deterministic test path |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Optional OpenAI-compatible endpoint. Empty is valid. Pathways does not call it |
| `ZETARIS_JDBC_URL`, `ZETARIS_JDBC_JAR`, `ZETARIS_JDBC_USER`, `ZETARIS_JDBC_PASSWORD`, `JAVA_BIN` | Optional read-only Lightning JDBC. A portable JDK may live in gitignored `tools/jdk/` |
| `ZETARIS_BASE_URL` and the other UI-proxy names | Existing diagnostic only. Do not guess |
| `AUTH_PROVIDER` | Leave blank. A name here does not enable sign-in |

## Tests

`npm test` covers the fraction tutor, the pathway regression, Zetaris passage acceptance and rejection, Meterless without private evidence, both interface languages, file extraction and refusal, consent, contribution deletion, and the unconfigured model path.

The 15 synthetic cases expect supported, unsupported, or uncertain outcomes. Abstaining when evidence is insufficient counts as uncertain and is correct. This is internal QA. It is not evidence of learning gain or job placement.

## Known limits

- One pathway. No public library, class sharing, accounts, OCR, speech, video, or model training.
- No 3D view on this pathway.
- Open responses are rubric matches, not an examination grade.
- The app is a local server. Offline use is not claimed.
- No hiring, school-grade, diagnosis, treatment, or eligibility decision.

## Sponsors

- **Cursor** is the development environment. No Cursor SDK runtime is required.
- **Zetaris** supplies only a filtered, rechecked public passage. Structure stays on the local fixture.
- **Meterless H-MEM** stores, recalls, and deletes the consented minimum.
- **NVIDIA** is not called. See above.
