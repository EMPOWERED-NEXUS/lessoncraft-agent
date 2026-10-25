# LessonCraft Pathways demo

About three and a half minutes. Open `http://127.0.0.1:8787/pathways/` before you start. The page opens on International until a prepared demo is clicked. Those demos select Cameroon as the example context. The interface can stay in English, then switch to French for one beat.

Say only what the screen shows. This pathway is one workplace writing activity. It is not a grade, a hiring decision, or a qualification.

## Script

1. **Problem (25 seconds).** A quiz score does not say which part of a skill the evidence supports. LessonCraft compares the evidence a learner chooses with one status-update requirement and offers one next step they can accept, edit, or dismiss.
2. **No account (15 seconds).** Point at **Sign in**. Open it only if asked: the page says sign-in is unavailable. Return with **Try demo**.
3. **Evidence (30 seconds).** Click **Demo A — quiz shows one gap**, then **Explain the next step**. The fact, next action, plain language, and no-overclaim items are demonstrated. Naming an unknown needs more evidence because that quiz item did not match the key.
4. **Why (40 seconds).** Leave the NVIDIA box unchecked. Read the next step and open **Decision trace**. The planner’s first draft overstated the skill and used a hiring phrase. The verifier blocked it. The revised step is only the missing practice. The trace says NVIDIA was not called and the explanation was prepared in the app. If the box is checked, an AI draft appears under that next step with an exact Zetaris quote. The next step stays the decision. An uploaded file is not sent and does not train the model.
5. **Human control (20 seconds).** Click **Accept**. Mention **Edit** and **Dismiss**. Nothing is stored yet.
6. **Practice (35 seconds).** Click **Fill a sample answer**, then **Check practice** and **Check transfer**. Closed items use the stored key. The open response uses the rubric in the pathway file. Say that this is not a grade.
7. **Memory (25 seconds).** On **Progress**, leave consent off and say nothing is written. Then tick consent, save, and reset that id. Meterless keeps the goal, demonstrated competency ids, outcome, and feedback. The note is not stored.
8. **Materials and drafts (30 seconds).** Open **My materials**. Readable files are TXT, Markdown, DOCX, PPTX, and digital PDF text, up to 8 MB. An image, spreadsheet, audio file, or video is refused and is not added to the lesson. **Delete** and **Delete materials from this visit** clear page memory. A contribution draft says it is held in this page only, and that it is not submitted, reviewed, or shared. Training stays off.
9. **French and limits (20 seconds).** Switch the page to **Français**. The country can stay International. Quiz wording and the open-education passage stay in their source language. If the origin line names a Zetaris passage, it is one reviewed public excerpt and the pathway structure is still the local fixture. If Zetaris is unavailable, the page says it is on the fixture.

If time remains: **Demo B** asks one question because there is no evidence. **Demo D** abstains because a job-ready badge is not an approved source. **Demo C** uses a French note.

## Slides

Use these only for claims the running app demonstrates. Official scoring is Impact 30, Technical 20, Innovation 15, Demo 15, Product and UX 10, Sponsor tech 10.

| Slide | Say this | Criterion |
|---|---|---|
| 1. Problem and user | A learner needs a sourced reason for one next step, not a score. The user is someone practicing a workplace status update. ILO and World Bank links are context only. | Impact, 30 |
| 2. One pathway | Optional country, chosen evidence, three evidence states, one action, accept / edit / dismiss, practice, transfer. English and French. | Product and UX, 10 |
| 3. Shared run | Evidence Analyst, Pathway Planner, Verification Agent, and the orchestrator read one run. Repairs are capped and written into the trace. | Technical, 20 |
| 4. The checker | Unsupported claims, missing sources, wrong language, country mismatch, blocked datasets, and hiring language are rejected in code. | Technical, 20; Innovation, 15 |
| 5. The screen | Show the live why / evidence / uncertain / do-now panel and the trace. | Demo, 15 |
| 6. Zetaris | Structure is the local fixture. A supporting passage is labeled Zetaris only when the filtered public row is returned and checked again. The optional NVIDIA draft quotes that passage and names its id. Failure stays on the fixture. | Sponsor tech, 10 |
| 7. Meterless | Consent on stores the goal, demonstrated competency ids, outcome, and feedback. Consent off and reset do not keep the note or the file. Meterless memory is not sent to NVIDIA. | Sponsor tech, 10 |
| 8. What is not claimed | No account, no OCR, no training, no public sharing. NVIDIA is optional and off until the learner consents. The requested model is `nvidia/nemotron-3.5-super-vl-120b-a12b`; the trace shows the served id. The local check stays the decision. Uploaded materials are not sent and do not train the model. A contribution draft is page memory for this visit and is not submitted. | Demo, 15 |
| 9. Sources | Original pathway text, plus Technical Writing Essentials 2nd edition, section 7.5, CC BY 4.0, only as a reviewed public passage. | Impact; sponsor tech |

## Sample lines from Demo A

- Naming what is still unknown needs more evidence. Quiz `q2` did not match the answer key.
- The verifier removed an overstated, job-ready draft. The next step is the English practice for that gap.
- One missed item is not a score.
- With the NVIDIA box unchecked, the trace says NVIDIA was not called and no external model was used.
- With the box checked, the AI draft sits under the next step, names the Zetaris passage, and does not replace that step. Uploaded materials are not sent and do not train the model.
