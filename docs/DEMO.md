# LessonCraft Pathways demo

About three and a half minutes. On the computer running the server, open `http://127.0.0.1:8787/pathways/` before you start. That address is not reachable from another machine. The interface can stay in English, then switch to French for one beat.

Say only what the screen shows. LessonCraft by Empowered Nexus helps a learner use trusted materials to check what they understand, see what remains unclear, and practice one useful next step. Pathways is the current learning experience. This prototype is one workplace status-update skill. It is not a grade, a hiring decision, a qualification, a full curriculum, or a video course.

Empowered Nexus owns LessonCraft. GenAI Works operates the hackathon and HackOS. The hackathon does not manage LessonCraft learners or accounts.

## Script

1. **Promise (20 seconds).** Read the first screen. It names the benefit and the four steps: choose a learning goal, use approved evidence, see what is demonstrated or still unclear, and take one next practice step. Say that no account is needed.
2. **Evidence (30 seconds).** Click **Try demo**, then **Demo A — quiz shows one gap**, then **Explain the next step**. The fact, next action, plain language, and no-overclaim items are demonstrated. Naming an unknown needs more evidence because that quiz item did not match the key.
3. **Why (40 seconds).** Leave the NVIDIA box unchecked. Read the next step and open **Decision trace**. The planner’s first draft overstated the skill and used a hiring phrase. The verifier blocked it. The revised step is only the missing practice. The trace says NVIDIA was not called and the explanation was prepared in the app. If the box is checked, an AI draft appears under that next step with an exact Zetaris quote. The next step stays the decision. An uploaded file is not sent, and this content does not train Nemotron.
4. **Human control (20 seconds).** Click **Accept**. Mention **Edit** and **Dismiss**. Nothing is stored yet.
5. **Practice (35 seconds).** Click **Fill a sample answer**, then **Check practice** and **Check transfer**. Closed items use the stored key. The open response uses the rubric in the pathway file. Say that this is not a grade.
6. **Memory (25 seconds).** On **Progress**, leave consent off and say nothing is written. Then tick consent, save, and reset that id. Meterless keeps the goal, demonstrated competency ids, outcome, and feedback. The note is not stored.
7. **Materials and drafts (30 seconds).** Open **My materials**. Readable files are TXT, Markdown, DOCX, PPTX, and digital PDF text, up to 8 MB. An image, spreadsheet, audio file, or video is refused and is not added to the lesson. **Delete** and **Delete materials from this visit** clear page memory. A contribution draft says it is held in this page only, and that it is not submitted, reviewed, or shared. Training stays off.
8. **French and limits (20 seconds).** Switch the page to **Français**. Quiz wording and the open-education passage stay in their source language. If the origin line names a Zetaris passage, it is one reviewed public excerpt and the pathway structure is still the local fixture. If Zetaris is unavailable, the page says it is on the fixture. The page does not ask for a country.

If time remains: **Demo B** asks one question because there is no evidence. **Demo D** abstains because a job-ready badge is not an approved source. **Demo C** uses a French note.

## Slides

Use these only for claims the running app demonstrates. Official scoring is Impact 30, Technical 20, Innovation 15, Demo 15, Product and UX 10, Sponsor tech 10.

| Slide | Say this | Criterion |
|---|---|---|
| 1. Problem and user | A learner needs to see what trusted material shows and what is still unclear, then practice one next step. The user is someone practicing a workplace status update. ILO and World Bank links are context only. | Impact, 30 |
| 2. One skill | Pathways is the current LessonCraft experience. The prototype is one status-update skill: chosen evidence, three evidence states, one action, accept / edit / dismiss, practice, transfer. English and French. No account. | Product and UX, 10 |
| 3. Shared run | Evidence Analyst, Pathway Planner, Verification Agent, and the orchestrator read one run. Repairs are capped and written into the trace. | Technical, 20 |
| 4. The checker | Unsupported claims, missing sources, wrong language, a supplied country mismatch, blocked datasets, and hiring language are rejected in code. The demo does not collect a country. | Technical, 20; Innovation, 15 |
| 5. The screen | Show the live why / evidence / uncertain / do-now panel, the decision trace, and, when consented, the NVIDIA draft under the local next step. | Demo, 15 |
| 6. Zetaris | Structure is the local fixture. A supporting passage is labeled Zetaris only when the filtered public row is returned and checked again. The optional NVIDIA draft quotes that passage and names its id. Failure stays on the fixture. | Sponsor tech, 10 |
| 7. Meterless | Consent on stores the goal, demonstrated competency ids, outcome, and feedback. Consent off and reset do not keep the note or the file. Meterless memory is not sent to NVIDIA. | Sponsor tech, 10 |
| 8. What is not claimed | No account, no OCR, no training, no public sharing, no universal curriculum, no video course. NVIDIA is optional and off until the learner consents. The requested model is `nvidia/nemotron-3.5-super-vl-120b-a12b`; the trace shows the served id. The local check stays the decision. This content demonstrates one skill and does not train Nemotron. A contribution draft is page memory for this visit and is not submitted. | Demo, 15 |
| 9. Sources | Original pathway text, plus Technical Writing Essentials 2nd edition, section 7.5, CC BY 4.0, only as a reviewed public passage. | Impact; sponsor tech |

## Sample lines from Demo A

- Naming what is still unknown needs more evidence. Quiz `q2` did not match the answer key.
- The verifier removed an overstated, job-ready draft. The next step is the English practice for that gap.
- One missed item is not a score.
- With the NVIDIA box unchecked, the trace says NVIDIA was not called and no external model was used.
- With the box checked, the AI draft sits under the next step, names the Zetaris passage, and does not replace that step. Uploaded materials are not sent, and this content does not train Nemotron.

## Sponsor technology

- **Cursor** is the development environment. The running demo does not require the Cursor SDK.
- **Zetaris** supplies a filtered public passage after the app checks the row again. The pathway structure stays on the local fixture. A failed or empty retrieval stays on that fixture.
- **Meterless H-MEM** stores, recalls, and deletes only the consented minimum: pseudonymous id, goal, demonstrated competency ids, outcome, and feedback.
- **NVIDIA Nemotron** writes an optional draft after consent, using the selected quiz answers and the approved passage. The requested model is `nvidia/nemotron-3.5-super-vl-120b-a12b`. A consented check returned the served id `private/nvidia/nemotron-3.5-super-120b-a12b`. Temperature is 1.0, top_p is 0.95, reasoning is off, and the output limit is 512 tokens. The local pathway decision stays authoritative. The current content demonstrates one skill and does not train Nemotron.
