import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { readFileSync } from "node:fs";
import { nvidiaMessages } from "../studio/agents.ts";
import { handleStudio } from "../studio/http.ts";
import { sampleSource } from "../studio/sample.ts";
import { StudioApp, tempStudioDir } from "../studio/service.ts";

async function listen(app: StudioApp): Promise<{ base: string; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const handled = await handleStudio(req, res, url, app, () => null);
    if (!handled) res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function cookieFrom(response: Response): string {
  return (response.headers.getSetCookie?.() ?? []).map((item) => item.split(";")[0]).join("; ");
}

function blankSource(extra: Record<string, unknown> = {}) {
  return {
    creator: "The teacher",
    title: "Original class note",
    url: "",
    license: "Original note written by the teacher",
    permissionNote: "",
    attribution: "The teacher, original note",
    subject: "Science",
    level: "1",
    topic: "Change",
    language: "en",
    reviewStatus: "approved" as const,
    excerpt: "The meeting is on Wednesday.",
    privateUse: true,
    classShare: false,
    publish: false,
    training: false,
    ...extra,
  };
}

export async function studioTests(test: (name: string, fn: () => Promise<void> | void) => Promise<void>): Promise<void> {
  await test("local accounts sign up, sign in, sign out, and keep roles apart", async () => {
    const { dir, memoryDir } = tempStudioDir();
    const app = new StudioApp(dir, memoryDir);
    const teacher = app.register("Teacher@Example.com", "local-pass-1", "teacher");
    const learner = app.register("learner@example.com", "local-pass-2", "learner");
    assert.equal(teacher.user.role, "teacher");
    assert.equal(learner.user.email, "learner@example.com");
    assert.equal(app.login("teacher@example.com", "local-pass-1").user.id, teacher.user.id);
    assert.throws(() => app.login("teacher@example.com", "wrong-pass"), /does not match/);
    assert.throws(() => app.createPack(learner.token, { title: "No", subject: "A", level: "1", language: "en" }), /teacher/);
    const raw = fs.readFileSync(`${dir}/accounts.json`, "utf8");
    assert.equal(raw.includes("local-pass-1"), false);
    assert.equal(raw.includes("local-pass-2"), false);
    const httpApp = new StudioApp(dir, memoryDir);
    const server = await listen(httpApp);
    try {
      const signed = await fetch(`${server.base}/api/studio/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "teacher@example.com", password: "local-pass-1" }),
      });
      const body = await signed.json() as { csrf: string };
      const cookie = cookieFrom(signed);
      assert.match(cookie, /lc_studio=/);
      assert.match(signed.headers.get("set-cookie") || "", /HttpOnly/);
      assert.match(signed.headers.get("set-cookie") || "", /SameSite=Lax/);
      const denied = await fetch(`${server.base}/api/studio/logout`, { method: "POST", headers: { cookie } });
      assert.equal(denied.status, 403);
      const signedOut = await fetch(`${server.base}/api/studio/logout`, {
        method: "POST",
        headers: { cookie, "x-csrf-token": body.csrf },
      });
      assert.equal(signedOut.status, 200);
      assert.match(signedOut.headers.get("set-cookie") || "", /Max-Age=0/);
    } finally {
      await server.close();
    }
  });

  await test("another account cannot read or change a teacher's pack", () => {
    const { dir, memoryDir } = tempStudioDir();
    const app = new StudioApp(dir, memoryDir);
    const owner = app.register("owner@example.com", "local-pass-1", "teacher");
    const other = app.register("other@example.com", "local-pass-2", "teacher");
    const pack = app.createPack(owner.token, {
      title: "Shop notes",
      subject: "Communication",
      level: "Introductory",
      language: "en",
    });
    assert.equal(pack.countryCode, "");
    assert.equal(pack.published, false);
    assert.throws(() => app.getPack(other.token, pack.id), /not shared/);
    assert.throws(() => app.saveObjectives(other.token, pack.id, ["Name the action"], true), /created this pack/);
    app.deleteAccount(owner.token, "local-pass-1");
    assert.throws(() => app.getPack(owner.token, pack.id), /Sign in/);
  });

  await test("syllabus text is reviewed and edited before objectives are saved", async () => {
    const { dir, memoryDir } = tempStudioDir();
    const app = new StudioApp(dir, memoryDir);
    const teacher = app.register("owner@example.com", "local-pass-1", "teacher");
    const pack = app.createPack(teacher.token, { title: "Notes", subject: "Science", level: "1", language: "en" });
    const proposed = app.propose(teacher.token, pack.id, "1. Learners will name the change.\nHeading");
    assert.equal(proposed.saved, false);
    assert.equal(app.getPack(teacher.token, pack.id).objectives.length, 0);
    assert.throws(() => app.saveObjectives(teacher.token, pack.id, ["Learners will name the change."], false), /Review and confirm/);
    const saved = app.saveObjectives(teacher.token, pack.id, ["Learners will name the edited change."], true);
    assert.equal(saved[0].text, "Learners will name the edited change.");
    const image = await app.importFile(teacher.token, pack.id, "scan.png", Buffer.from([1, 2, 3]));
    assert.equal(image.saved, false);
    assert.match(image.message, /not saved/);
    const textFile = await app.importFile(teacher.token, pack.id, "syllabus.txt", Buffer.from("2. Learners will describe the limit.\n"));
    assert.equal(textFile.saved, false);
    assert.match(textFile.proposals[0].text, /describe the limit/);
  });

  await test("questions keep source permission separate from training and class sharing", () => {
    const { dir, memoryDir } = tempStudioDir();
    const app = new StudioApp(dir, memoryDir);
    const teacher = app.register("owner@example.com", "local-pass-1", "teacher");
    const pack = app.createPack(teacher.token, { title: "Notes", subject: "Science", level: "1", language: "fr" });
    assert.throws(() => app.addSource(teacher.token, pack.id, blankSource({ license: "", permissionNote: "" })), /license or a written permission/);
    const source = app.addSource(teacher.token, pack.id, blankSource({ training: false, classShare: false, publish: false }));
    assert.equal(source.training, false);
    assert.equal(source.classShare, false);
    assert.equal(source.publish, false);
    const objective = app.saveObjectives(teacher.token, pack.id, ["Name the change"], true)[0];
    const question = app.addQuestion(teacher.token, pack.id, {
      objectiveId: objective.id,
      prompt: "What changed?",
      requiredIdeas: ["wednesday"],
      solution: "The meeting is on Wednesday.",
      sourceId: source.id,
      kind: "practice",
    });
    assert.equal(question.sourceId, source.id);
    const learner = app.register("learner@example.com", "local-pass-2", "learner");
    assert.throws(() => app.getPack(learner.token, pack.id), /not shared/);
  });

  await test("saved objectives and questions remain in the account file for a later session", () => {
    const { dir, memoryDir } = tempStudioDir();
    const first = new StudioApp(dir, memoryDir);
    const teacher = first.register("owner@example.com", "local-pass-1", "teacher");
    const pack = first.createPack(teacher.token, { title: "Shop notes", subject: "Science", level: "1", language: "en" });
    first.saveObjectives(teacher.token, pack.id, ["Name the edited meeting day."], true);
    const source = first.addSource(teacher.token, pack.id, blankSource());
    const objectiveId = first.getPack(teacher.token, pack.id).objectives[0].id;
    first.addQuestion(teacher.token, pack.id, {
      objectiveId,
      prompt: "What day should the reader use?",
      requiredIdeas: ["wednesday"],
      solution: "The reader should use Wednesday.",
      sourceId: source.id,
      kind: "practice",
    });
    const second = new StudioApp(dir, memoryDir);
    const again = second.login("owner@example.com", "local-pass-1");
    const loaded = second.getPack(again.token, pack.id);
    assert.equal(loaded.objectives[0].text, "Name the edited meeting day.");
    assert.equal(loaded.questions[0].prompt, "What day should the reader use?");
    assert.equal(loaded.questions[0].solution, "The reader should use Wednesday.");
    assert.equal(loaded.sources[0].title, "Original class note");
    const learner = second.register("learner@example.com", "local-pass-2", "learner");
    assert.throws(() => second.getPack(learner.token, pack.id), /not shared/);
  });

  await test("a learner receives cited material, evaluator feedback, and an adaptive branch", async () => {
    const { dir, memoryDir } = tempStudioDir();
    const app = new StudioApp(dir, memoryDir);
    const learner = app.register("learner@example.com", "local-pass-2", "learner");
    const open = app.getPack(learner.token, "pack-sample-notice");
    assert.equal(open.sample, true);
    assert.equal(JSON.stringify(open.questions).includes("reviewed sample answer"), false);
    const lesson = await app.ask(learner.token, "pack-sample-notice", "identify the action a short notice asks", false, null);
    assert.match(lesson.teaching.explanation, /Wednesday/);
    assert.match(lesson.teaching.citation, /Original sample/);
    assert.equal(lesson.modelCalled, false);
    const wrong = app.answer(learner.token, lesson.id, "I am not sure about the room.");
    assert.equal(wrong.judgement?.branch, "practise");
    assert.equal(wrong.judgement?.competency, "unclear");
    const right = app.answer(learner.token, lesson.id, "The reader should use Wednesday.");
    assert.equal(right.judgement?.branch, "advance");
    assert.equal(right.judgement?.competency, "demonstrated");
    assert.match(right.judgement?.nextAction || "", /does not change/);
    assert.ok(right.teaching.trace.some((step) => step.agent === "evaluator"));
  });

  await test("progress is stored only with consent and reset deletes it", async () => {
    const { dir, memoryDir } = tempStudioDir();
    const app = new StudioApp(dir, memoryDir);
    const learner = app.register("learner@example.com", "local-pass-2", "learner");
    const lesson = await app.ask(learner.token, "pack-sample-notice", "action the notice asks", false, null);
    app.answer(learner.token, lesson.id, "Use Wednesday.");
    const skipped = await app.remember(learner.token, lesson.id, false);
    assert.equal(skipped.stored, false);
    assert.equal(skipped.records.length, 0);
    const saved = await app.remember(learner.token, lesson.id, true);
    assert.equal(saved.stored, true);
    assert.equal(saved.records[0].status, "demonstrated");
    assert.equal(saved.records[0].next.includes("Wednesday"), false);
    const deleted = await app.reset(learner.token);
    assert.ok(deleted.length >= 1);
    const after = await app.remember(learner.token, lesson.id, false);
    assert.equal(after.records.length, 0);
  });

  await test("an unavailable or ungrounded model falls back and private text is not sent without consent", async () => {
    const { dir, memoryDir } = tempStudioDir();
    const app = new StudioApp(dir, memoryDir);
    const learner = app.register("learner@example.com", "local-pass-2", "learner");
    let calls = 0;
    const client = {
      async complete() {
        calls += 1;
        throw new Error("unavailable");
      },
    };
    const blocked = await app.ask(learner.token, "pack-sample-notice", "action the notice asks", false, client);
    assert.equal(calls, 0);
    assert.equal(blocked.modelCalled, false);
    assert.equal(app.lastModelRequest()?.called, false);
    const failed = await app.ask(learner.token, "pack-sample-notice", "action the notice asks", true, client);
    assert.equal(calls, 1);
    assert.match(failed.teaching.explanation, /Wednesday/);
    assert.ok(failed.teaching.trace.some((step) => /local explanation/i.test(step.result)));
    const ungrounded = await app.ask(learner.token, "pack-sample-notice", "action the notice asks", true, {
      async complete() {
        return { content: "The reader is now qualified for a new job.", model: "mock" };
      },
    });
    assert.match(ungrounded.teaching.explanation, /This notice does not change anyone's job/);
    assert.ok(ungrounded.teaching.trace.some((step) => /not used/i.test(step.result)));
    const request = app.lastModelRequest();
    assert.equal(request?.called, true);
    const payload = JSON.stringify(request?.messages);
    assert.match(payload, /Wednesday team check-in/);
    assert.equal(payload.includes("reviewed sample answer"), false);
    assert.equal(payload.includes(learner.user.email), false);
    const direct = nvidiaMessages({ question: "What should the reader do?", excerpt: sampleSource.excerpt, answer: "Wednesday" });
    assert.equal(JSON.stringify(direct).includes("reviewed sample answer"), false);
  });

  await test("studio pages have English and French labels, keyboard fields, and a narrow layout", () => {
    const html = readFileSync(new URL("../../public/studio/index.html", import.meta.url), "utf8");
    const app = readFileSync(new URL("../../public/studio/app.js", import.meta.url), "utf8");
    const css = readFileSync(new URL("../../public/studio/studio.css", import.meta.url), "utf8");
    assert.match(html, /id="lang-en"/);
    assert.match(html, /id="lang-fr"/);
    assert.match(html, /<label for="email"/);
    assert.match(html, /<label for="password"/);
    assert.match(html, /<label for="syllabus"/);
    assert.match(html, /<label for="answer"/);
    assert.match(html, /id="saved-questions"/);
    assert.match(app, /lessoncraft-studio-pack/);
    assert.match(app, /\$\("objectives"\)\.value = data\.objectives\.map/);
    assert.match(app, /Signed out/);
    assert.match(app, /\$\("pack-id"\)\.replaceChildren\(\)/);
    assert.match(css, /@media \(max-width: 420px\)/);
    assert.match(css, /overflow-wrap: anywhere/);
    assert.doesNotMatch(css, /min-width:\s*[5-9]\d\dpx/);
    const keys = (name) => {
      const start = app.indexOf(`const ${name} = {`);
      const end = app.indexOf("\n};", start);
      return [...app.slice(start, end).matchAll(/^\s+(\w+):/gm)].map((item) => item[1]).sort();
    };
    assert.deepEqual(keys("en"), keys("fr"));
    assert.match(app, /local-demo|localDemo|cet ordinateur|this computer/i);
  });
}
