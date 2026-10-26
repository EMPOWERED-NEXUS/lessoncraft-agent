# Judge quickstart

LessonCraft by Empowered Nexus. Pathways is the current learning experience. The prototype checks one workplace status-update skill. Empowered Nexus owns the product. GenAI Works operates the hackathon and HackOS. The hackathon does not manage LessonCraft learners or accounts.

`http://127.0.0.1:8787/pathways/` answers only on the computer that is running the server. A judge on another machine cannot open that address. There is no public deployment.

## What the demo does

1. The first screen states the benefit and four steps: choose a learning goal, use approved evidence, see what is demonstrated or still unclear, and take one next practice step. It says no account is needed.
2. Under **Try demo**, click **Demo A — quiz shows one gap**, then **Explain the next step**.
3. **What you can do now** is the local next step. The learner can **Accept**, **Edit**, or **Dismiss** it.
4. The origin line and **Decision trace** name the evidence. Practice and transfer use a stored key and a rubric. They are not a grade.
5. **Progress** holds optional Meterless memory.
6. The NVIDIA checkbox is off until the learner checks it.

Direct visits to `/login` say accounts are not available yet and link back with **Try demo**.

## Clean local run

Node.js 20 or later. Keep exactly one process on port 8787. If the server is already running, use it.

```powershell
cd c:\apps\lessoncraft-agent\lessoncraft-agent
copy .env.example .env.local
npm ci
npm run setup
npm test
npm run dev
```

`npm run setup` vendors Meterless H-MEM from the public GitHub pin `1742dec56a66e58eef9dda2d2b865823758ca8cd`. `vendor/` is gitignored. `.env.local` is gitignored by `.env.*`. `.env.example` contains empty placeholders. Do not print secret values.

The app starts without Zetaris, without an NVIDIA key, and with Meterless available after setup. Missing sponsors fall back as described below. They do not stop the page from loading.

## Zetaris

The pathway structure always comes from `data/pathways/pw-workplace-status-update.json`. Zetaris does not supply that structure.

When Lightning JDBC is configured, the app sends read-only SQL only. It lists Lightning databases, then reads `NEXUS_PATHWAYS.passages` where `access_scope` is `approved_public`, `share_status` is `published`, `training_use` is `retrieval_only`, and `content_origin` is `approved public resource`. A row is shown as a Zetaris supporting passage only after the app checks that metadata again.

On screen, a successful read looks like this:

- Origin: `Pathway structure comes from the local pathway fixture. Supporting passage from Zetaris: Technical Writing Essentials 2nd Edition, 7.5 Progress Reports…`
- Trace, Sources: `Supporting passage pas-twe-75-done, Technical Writing Essentials 2nd Edition, 7.5 Progress Reports, opening questions, comes from Zetaris. The pathway structure stays on the local fixture.`

The quoted text is from Technical Writing Essentials, 2nd edition, Suzan Last, editor, BCcampus, section 7.5, CC BY 4.0. Listed book exceptions, including figure 7.4.3, are excluded. `NY_TAXI` and `TPCDS` are not learning evidence.

This repository does not contain the Zetaris platform. On the builder’s computer the platform is the Zetaris download, run with Docker Compose inside WSL Ubuntu, with Docker Desktop providing Docker. The compose project starts postgres, a one-shot init, the query engine on port 10000, the API, the UI on port 3000, a one-shot bootstrap, and Caddy. `init` and `bootstrap` ending as `Exited (0)` means those setup jobs finished.

Reproducing that stack requires:

1. Docker Desktop, with enough memory for the query engine. The platform README asks for 8 GB.
2. WSL Ubuntu, or another Linux host that can run the same compose file.
3. The platform download unzipped locally. It is not in this Git repository.
4. A private registry login. The download page provides the `docker login zetarishackathon.azurecr.io` command. Do not copy that command, its username, or its password into LessonCraft or into a commit.
5. JDBC settings in `.env.local`, as placeholders:

```text
ZETARIS_JDBC_URL=jdbc:zetaris:lightning@127.0.0.1:10000
ZETARIS_JDBC_JAR=<path-to-the-lightning-jdbc-jar>
ZETARIS_JDBC_USER=<lightning-web-email>
ZETARIS_JDBC_PASSWORD=<lightning-password>
JAVA_BIN=<path-to-java>
```

The JDBC user is the email used for the Lightning web sign-in, not a numeric user id. Use the Lightning JDBC jar from the gateway `jdbc/` folder. Do not use a Hive or Spark driver. A portable JDK may live in gitignored `tools/jdk/`.

`npm run jdbc-ping` runs `SELECT 1` only. `npm run diagnostic` is the older UI-proxy check and stays idle when those variables are unset. Do not execute `sql/02_nexus_pathways_draft.sql` from this repository. The app does not copy CSV files into Zetaris. A fresh platform download loads sample databases such as `NY_TAXI` and `TPCDS_DB`. It does not create `NEXUS_PATHWAYS` by itself. Without that database and its reviewed rows, LessonCraft stays on the fixture even when JDBC connects.

### If Zetaris is unavailable

The page still runs. The origin and trace say that no approved Zetaris passage was returned and that the pathway structure comes from the local fixture. The same fallback applies when JDBC is unset, the login is rejected, the query fails, no `NEXUS_PATHWAYS` database exists, no row matches the filter, or the row metadata fails the second check. The driver error and the password are not shown.

## Meterless

After `npm run setup`, Pathways calls the pinned H-MEM reference engine as actor `nexus-pathways`. Records live under `.lessoncraft/pathways-hmem/`, which is local to this computer.

Meterless stores a record only after the learner checks **I consent to store that minimum record for this pseudonymous id** and clicks **Save memory**. The stored fields are the pseudonymous id, goal, demonstrated competency ids, outcome, and feedback. The typed note and uploaded files are not in the stored sentence. **Reset this id** deletes that record. Consent left off means nothing is written.

### If Meterless is unavailable

`npm run setup` has not been run, or the vendored engine failed to install. Pathway recommendations still appear. **Save memory** cannot store a record until setup succeeds. Notes and files are never sent to Meterless.

## NVIDIA Nemotron

The checkbox **Send my selected answers and the approved supporting passage to NVIDIA to draft a learning response** starts off. Unchecked means no NVIDIA call. The trace says NVIDIA was not called because consent was not given.

A call also needs a selected quiz answer, an approved supporting passage, and `NVIDIA_API_KEY` in `.env.local`. The request goes to `NVIDIA_BASE_URL` (default `https://integrate.api.nvidia.com/v1`) for `NVIDIA_MODEL` (default `nvidia/nemotron-3.5-super-vl-120b-a12b`). Sampling is temperature 1.0 and top_p 0.95. Reasoning is disabled with `chat_template_kwargs.enable_thinking` set to false. The output limit is 512 tokens. The request does not include uploaded files, other notes, a name, an email address, or Meterless memory. This content does not train Nemotron.

The local competency check still decides **What you can do now**. A successful draft appears below that step, labeled as an AI draft, with the Zetaris source and an exact evidence quote. The quote must be an exact substring of the approved passage named by the passage id. The explanation may paraphrase. At most one repair is attempted. If the call times out, errors, returns empty or invalid text, or fails that check, the local next step remains and the trace says the draft was not used.

A consented check on this project returned the served model id `private/nvidia/nemotron-3.5-super-120b-a12b`. The trace shows the id the API returns.

### If NVIDIA is unavailable

Leave the key blank or leave the checkbox off. The local pathway response is shown. The trace distinguishes “not called” from “called, then not used.” Tests use a mock client and do not call NVIDIA.

## What a judge still cannot reproduce from this repository alone

- Opening `127.0.0.1` from another computer.
- The live Zetaris passage, unless they have the platform download, registry access, a running Lightning gateway, JDBC credentials, and a loaded `NEXUS_PATHWAYS.passages` table. This repo does not ship those images or execute that load.
- A live Nemotron draft, unless they place their own key in `.env.local`.
- Accounts, billing, public uploads, Google search, or an Android app. None of those are in this build.

## Printed-text photos

My materials can read clear printed English or French text from a JPG, JPEG, or PNG, up to 8 MB. The learner chooses that language. The page language is not used, and the language is not detected from the photo. OCR runs in the browser. The engine and language files are served by this app. The image is not saved in the browser, sent to the server, or sent to NVIDIA, Zetaris, or Meterless. The learner must review and confirm the text before it can enter the pathway request. That request shows at most 500 characters.

A blank image stays out of the lesson. Handwriting, equations, diagrams, and scanned PDFs are not claimed. **Take a photo** is an optional browser control. Phone camera capture has not been tested. Use **Choose an image** for the demo. The optional beat is in [docs/DEMO.md](DEMO.md) and should be skipped if it would push the recording past 4 minutes.

The recording checklist is in [docs/DEMO.md](DEMO.md). No video file is in the repository.
