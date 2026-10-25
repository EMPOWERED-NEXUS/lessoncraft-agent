# LessonCraft by Empowered Nexus

LessonCraft helps a learner use trusted learning materials to check what they understand, see what remains unclear, and practice one useful next step.

**Product:** LessonCraft by Empowered Nexus. Empowered Nexus owns the product.  
**Current experience:** Pathways.  
**Track:** The Agent That Can Explain Why, Open Agent Hackathon 2026. GenAI Works operates the hackathon and HackOS. The hackathon does not manage LessonCraft learners or accounts.  
**Prototype:** one workplace status-update skill. This is not universal subject coverage, a full curriculum, a video course, or a production service.

There is no numeric person score. The demo does not ask the learner to choose a country.

The fraction tutor at [/](http://127.0.0.1:8787/) was already in this working tree before Pathways. It is kept as an earlier lesson. The hackathon surface is [/pathways/](http://127.0.0.1:8787/pathways/). That address is reachable only on the computer running the server.

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

No account is needed. **Try demo** opens Pathways. A direct visit to [http://127.0.0.1:8787/login](http://127.0.0.1:8787/login) says accounts are not available yet and returns to the demo. Zetaris credentials are not a learner login.

`npm run setup` vendors Meterless H-MEM at commit `1742dec56a66e58eef9dda2d2b865823758ca8cd`. `vendor/` is gitignored. There is no separate typecheck or production-build script. `npm test` runs the project checks with `tsx`.

The spoken script, recording checklist, and slide outline are in [docs/DEMO.md](docs/DEMO.md). The editable deck is [docs/lessoncraft-pathways.pptx](docs/lessoncraft-pathways.pptx). Judge setup is in [docs/JUDGE.md](docs/JUDGE.md), with reproduction and fallback notes in [docs/JUDGE-QUICKSTART.md](docs/JUDGE-QUICKSTART.md). The launch roadmap is in [docs/ROADMAP.md](docs/ROADMAP.md). No video has been recorded in this repository.

## What the pathway does

1. The learner can start from Demo A, B, C, or D, or enter their own quiz answers and an optional note.
2. Evidence Analyst maps chosen quiz answers and the note to competency claims: demonstrated, needs more evidence, or not assessed.
3. Pathway Planner proposes one next step, asks one question, or abstains.
4. Verification Agent blocks unsupported claims, missing provenance, the wrong language, a supplied country that does not match the resource, blocked datasets, and hiring language. The demo sends International (`ZZ`) and does not show a country selector. The planner may revise once. Repairs stop at two, then the run escalates.
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

Pathways can ask NVIDIA’s hosted OpenAI-compatible API for one extra learning draft. The checkbox is off until the learner checks it. The request sends the selected quiz answers and the approved Zetaris passages only. It does not send an uploaded file, other notes, a name, an email address, or Meterless memory. Uploaded materials are not used to train the model.

The request model is `nvidia/nemotron-3.5-super-vl-120b-a12b` unless `NVIDIA_MODEL` is set. The trace shows the model id the API returns. A consented check returned the served id `private/nvidia/nemotron-3.5-super-120b-a12b`. Sampling is temperature `1.0` and `top_p` `0.95`. Reasoning is turned off with `chat_template_kwargs.enable_thinking` set to false, and the output limit is 512 tokens. The explanation may paraphrase. A separate evidence quote must be an exact substring of the approved passage named by its passage id. The local competency check still decides the next step. The draft is labeled as an AI draft and names the Zetaris source. If the call times out, errors, returns empty or invalid text, or fails the check, the local next step remains and the trace says the draft was not used. One repair call is the limit.

Set `NVIDIA_API_KEY`, and optionally `NVIDIA_BASE_URL` and `NVIDIA_MODEL`, in `.env.local`. Leave the key blank to keep the call off. The default base URL is `https://integrate.api.nvidia.com/v1`. Tests use a mock client and do not call NVIDIA. `LLM_BASE_URL` is a separate unused endpoint: with it empty the pathway mode stays `deterministic-no-llm`, and tests stay on `deterministic-test`.

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
| `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL` | Optional Nemotron draft. Blank key means no call. A call also needs the learner checkbox, a selected answer, and an approved passage |
| `ZETARIS_JDBC_URL`, `ZETARIS_JDBC_JAR`, `ZETARIS_JDBC_USER`, `ZETARIS_JDBC_PASSWORD`, `JAVA_BIN` | Optional read-only Lightning JDBC. A portable JDK may live in gitignored `tools/jdk/` |
| `ZETARIS_BASE_URL` and the other UI-proxy names | Existing diagnostic only. Do not guess |
| `AUTH_PROVIDER` | Leave blank. A name here does not enable sign-in |

## Tests

`npm test` covers the fraction tutor, the pathway regression, Zetaris passage acceptance and rejection, Meterless without private evidence, both interface languages, file extraction and refusal, consent, contribution deletion, the unconfigured model path, and mocked NVIDIA success, exact-quote checks, unsupported passage ids, reasoning disabled, empty output, refusal, timeout, API failure, verifier rejection, and fallback.

The 15 synthetic cases expect supported, unsupported, or uncertain outcomes. Abstaining when evidence is insufficient counts as uncertain and is correct. This is internal QA. It is not evidence of learning gain or job placement.

## Known limits

- One workplace status-update skill. No universal subject coverage, full curriculum, video course, public library, class sharing, accounts, OCR, speech, video, or model training.
- No 3D view on this pathway.
- Open responses are rubric matches, not an examination grade.
- The app is a local server on the development computer. `http://127.0.0.1:8787/` is not a public address. Offline use is not claimed.
- No hiring, school-grade, diagnosis, treatment, or eligibility decision.

## Sponsors

- **Cursor** is the development environment. No Cursor SDK runtime is required.
- **Zetaris** supplies only a filtered, rechecked public passage. Structure stays on the local fixture.
- **Meterless H-MEM** stores, recalls, and deletes the consented minimum.
- **NVIDIA** drafts an optional learning response only after the learner checks the consent box and an approved Zetaris passage is available. The request model is `nvidia/nemotron-3.5-super-vl-120b-a12b`. The trace records the served model id. The local pathway check still decides the next step. The current content demonstrates one skill. It is not sent as training data, and it does not train Nemotron.
