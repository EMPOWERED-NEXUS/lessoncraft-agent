# Judge setup

LessonCraft by Empowered Nexus. Pathways is the current learning experience. This prototype demonstrates one workplace status-update skill. Empowered Nexus owns the product. GenAI Works operates the hackathon and HackOS and does not manage LessonCraft learners or accounts.

## Where it runs

`http://127.0.0.1:8787/pathways/` works only on the computer that is running the server. It is not a public site. Keep exactly one process listening on port 8787. If that server is already running, use it. Do not start a second one.

## Start

Node.js 20 or later.

```powershell
cd c:\apps\lessoncraft-agent\lessoncraft-agent
copy .env.example .env.local
npm ci
npm run setup
npm test
npm run dev
```

Leave secrets in `.env.local`. That file is gitignored. `.env.example` has empty placeholders. Do not print the NVIDIA or Zetaris values.

Open `http://127.0.0.1:8787/pathways/`. No account is needed. **Try demo** fills a prepared example. A direct visit to `/login` says accounts are not available yet and links back to the demo.

## What to click

1. Read the four steps on the first screen.
2. Click **Try demo**, then **Demo A — quiz shows one gap**, then **Explain the next step**.
3. Read **What you can do now** and open **Decision trace**.
4. Leave the NVIDIA box unchecked for the local trace. Check it only when you want the optional AI draft. The draft appears under the local next step, with a Zetaris source and an exact quote. It does not replace the decision.
5. Accept, edit, or dismiss the next step. Use practice and transfer. They are not a grade.
6. On **Progress**, Meterless writes only after consent, and only the goal, demonstrated competency ids, outcome, and feedback.
7. Switch the page to **Français** to see the same flow in French.

Do not upload a learner file for the NVIDIA check. Uploaded materials are not sent to NVIDIA and are not training data.

## What this build shows

- One skill, English and French.
- Chosen evidence marked demonstrated, needs more evidence, or not assessed.
- One next practice step, with the reason in the trace.
- A Zetaris supporting passage when the filtered public row is available. Otherwise the page stays on the local fixture and says so.
- Consented Meterless memory, with delete.
- An optional Nemotron draft after consent. The requested model is `nvidia/nemotron-3.5-super-vl-120b-a12b`. The trace shows the served model id.

## What this build does not show

- A public deployment, accounts, billing, or subscriptions.
- Universal subject coverage, a full curriculum, or a generated video course.
- Training of Nemotron, or use of uploaded materials as training data.
- Google web research. That is described as future work in `docs/ROADMAP.md` and is not implemented.
- OCR, speech, class sharing, or a public library.
