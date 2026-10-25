import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "../env.ts";
import { loadPacks } from "../catalog.ts";
import { loadHMEM } from "../hmem.ts";
import { diagnose, checkAnswer, resetSessions } from "../journey.ts";
import { citationOnlyRecords, sanitizeArtefact, teachableEvidence } from "../provenance.ts";
import { assertReadOnlySql, diagnoseZetaris } from "../zetaris.ts";
import { dropUnsupported, verifyExplanation } from "../verify.ts";
import { attemptLogin, authStatus } from "../auth.ts";
import { pathwayTests } from "./pathways.ts";
import { pathwayUiTests } from "./pathways-ui.ts";
import { nvidiaDraftTests } from "./nvidia-draft.ts";
import type { Artefact, TeachableEvidence } from "../types.ts";

loadEnv();
process.env.LESSONCRAFT_TEST_MODE = "1";
process.env.NODE_ENV = "test";

let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`fail  ${name}`);
    console.error(error);
  }
}

await test("packs are generic records, not a Cameroon singleton type", () => {
  const packs = loadPacks();
  assert.ok(packs.length >= 1);
  const p = packs[0];
  for (const key of [
    "country_code",
    "education_subsystem",
    "grade_or_level",
    "subject",
    "language_code",
    "learning_objectives",
    "prerequisites",
    "assessment_style",
  ]) {
    assert.ok(key in p, key);
  }
  assert.match(p.disclaimer, /not official/i);
});

await test("citation-only and stuffed bodies never become teachable evidence", () => {
  const packs = loadPacks();
  const packed = packs[0].artefacts;
  const citations = citationOnlyRecords(packed);
  assert.ok(citations.length >= 1);
  const teach = teachableEvidence(packed);
  assert.ok(teach.every((t) => Boolean(t.body)));
  assert.ok(packed.some((a) => a.source_class === "citation_only" && a.body === null));

  const blocked = sanitizeArtefact({
    artefact_id: "x",
    source_class: "licensed_oer",
    source_title: "n",
    source_owner: "o",
    source_url: "https://www.kamerpower.com/notes",
    licence_or_permission: "none",
    attribution: "a",
    page_or_section: null,
    permission_evidence: "none",
    reuse_ok: true,
    body: "stolen notes",
  } as Artefact);
  assert.equal(blocked.reuse_ok, false);
  assert.equal(blocked.body, null);
  assert.equal(blocked.source_class, "citation_only");
});

await test("read-only Zetaris adapter rejects writes and does not guess URLs", async () => {
  assert.doesNotThrow(() => assertReadOnlySql("SELECT 1 AS one"));
  assert.throws(() => assertReadOnlySql("CREATE LIGHTNING DATABASE X"));
  assert.throws(() => assertReadOnlySql("SELECT 1; DROP TABLE y"));
  const previous = { ...process.env };
  delete process.env.ZETARIS_BASE_URL;
  delete process.env.ZETARIS_REST_URL;
  delete process.env.ZETARIS_ORG_ID;
  delete process.env.ZETARIS_API_KEY;
  delete process.env.ZETARIS_USERNAME;
  delete process.env.ZETARIS_PASSWORD;
  const d = await diagnoseZetaris();
  assert.equal(d.status, "not_configured");
  assert.equal(d.configured, false);
  assert.match(d.message, /will not guess/i);
  Object.assign(process.env, previous);
});

await test("verifier rejects unsupported claims and drops them", () => {
  const evidence: TeachableEvidence[] = [
    {
      artefact_id: "a",
      source_title: "t",
      source_owner: "LessonCraft",
      source_url: null,
      page_or_section: "Section A",
      attribution: "orig",
      licence_or_permission: "LessonCraft original",
      body: "Multiplying 1/2 × 1/2 means taking a part of a part. The product 1/4 is smaller than 1/2.",
    },
  ];
  const bad = verifyExplanation("The moon is made of cheese. The product 1/4 is smaller than 1/2.", evidence);
  assert.equal(bad.ok, false);
  const dropped = dropUnsupported(
    "The moon is made of cheese. The product 1/4 is smaller than 1/2.",
    evidence,
  );
  assert.ok(!dropped.text.toLowerCase().includes("moon"));
  assert.ok(dropped.text.includes("1/4"));
});

await test("H-MEM real engine add/query/feedback", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lc-hmem-"));
  const loaded = await loadHMEM({ persistDir: dir, clock: () => 1_700_000_000_000 });
  assert.equal(loaded.source, "vendor/hmem");
  const rec = loaded.hmem.add({
    content: "Learner demo-learner pack=cm-anglophone-primary-p5-maths-en found multiplying hard",
    type: "factual",
    source: "lessoncraft:test",
    chatId: "demo-learner",
  });
  const q = loaded.hmem.query("multiplying hard pack maths", { threshold: 0.01, chatId: "demo-learner" });
  assert.ok(q.memories.length >= 1);
  loaded.hmem.feedback(rec.id, "helpful");
  assert.ok(fs.existsSync(path.join(dir, "state.json")));
});

await test("journey diagnose + reteach + advance uses H-MEM", async () => {
  resetSessions();
  const first = await diagnose({
    learnerId: "test-learner",
    diagnosticAnswer: "Multiplying makes numbers bigger, so 1/2 × 1/2 is 1",
  });
  assert.equal(first.diagnosis.misconception_id, "multiply_makes_bigger");
  assert.ok(first.explanation.length > 20);
  assert.ok(first.visual.mermaid.includes("flowchart"));
  assert.equal(first.verification.ok, true);
  assert.ok(first.evidence.every((e) => e.artefact_id !== "citation-only-mineduc-portal"));
  assert.ok(first.trace.some((t) => t.role === "hmem"));
  assert.ok(first.trace.some((t) => t.role === "verifier"));

  const reteach = await checkAnswer({
    sessionId: first.sessionId,
    answer: "it gets bigger",
  });
  assert.equal(reteach.branch, "reteach");
  assert.equal(reteach.correct, false);

  const second = await diagnose({
    learnerId: "test-learner-2",
    diagnosticAnswer: "I think 1/2 × 1/2 is 1 because multiplying makes it larger",
  });
  const advance = await checkAnswer({
    sessionId: second.sessionId,
    answer: "smaller, 1/6",
  });
  assert.equal(advance.branch, "advance");
  assert.equal(advance.correct, true);
});

await test("learner sign-in stays unavailable without a provider", () => {
  const previous = process.env.AUTH_PROVIDER;
  delete process.env.AUTH_PROVIDER;
  try {
    const status = authStatus();
    assert.equal(status.configured, false);
    assert.equal(status.authenticated, false);
    const rejected = attemptLogin("judge@example.com", "not-a-real-session");
    assert.equal(rejected.ok, false);
    assert.equal(rejected.authenticated, false);
    assert.equal(JSON.stringify(rejected).includes("not-a-real-session"), false);
    const invalid = attemptLogin("not-an-email", "short");
    assert.equal(invalid.ok, false);
    assert.ok(invalid.errors.email);
    assert.ok(invalid.errors.password);
  } finally {
    if (previous !== undefined) process.env.AUTH_PROVIDER = previous;
  }
});

await pathwayTests(test);
await pathwayUiTests(test);
await nvidiaDraftTests(test);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
