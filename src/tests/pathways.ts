import assert from "node:assert/strict";
import { loadFixture } from "../pathways/catalog.ts";
import { parseLearnerMemory, recallLearner, rememberLearner, resetLearner } from "../pathways/memory.ts";
import { gradeActivity } from "../pathways/practice.ts";
import { applyPassageRead, createState, modelModeFor, runPathway } from "../pathways/run.ts";
import { PASSAGE_SQL, readPassages } from "../pathways/zetaris-read.ts";
import { saveMemory, startRun } from "../pathways/service.ts";
import { regressionCases, runRegression } from "../pathways/regression.ts";
import { verificationAgent } from "../pathways/verifier.ts";
import { assertReadOnlySql } from "../zetaris.ts";

type TestFn = (name: string, fn: () => Promise<void> | void) => Promise<void>;

function passageRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    passage_id: "pas-twe-75-done",
    passage_text: "How much of the work is complete?",
    section_locator: "7.5 Progress Reports, opening questions",
    lessoncraft_competency_ids: "comp-known-fact",
    lessoncraft_mapping_note: "LessonCraft mapping for the Nexus Pathways status-update pathway.",
    source_id: "src-twe-75",
    source_title: "Technical Writing Essentials 2nd Edition",
    creators: "Suzan Last; Eduard Cojoc-Wisernig; Loren Gaudet; Justin Lewis; Candice Neveu; Sushil Saini; Monika Smith. Editor: Suzan Last.",
    editor: "Suzan Last",
    source_url: "https://pressbooks.bccampus.ca/technicalwriting2ed/chapter/progressreports/",
    licence: "Creative Commons Attribution 4.0 International License",
    licence_url: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "Last, Suzan, and the listed authors. Edited by Suzan Last. Section 7.5.",
    review_status: "reviewed",
    not_official_standard: "true",
    official_standard_marker: "Not an official standard",
    access_scope: "approved_public",
    share_status: "published",
    content_origin: "approved public resource",
    training_use: "retrieval_only",
    language_code: "en",
    ...overrides,
  };
}

export async function pathwayTests(test: TestFn): Promise<void> {
  await test("pathway fixture is original and blocks taxi content", () => {
    const file = loadFixture();
    assert.equal(file.pathway_id, "pw-workplace-status-update");
    assert.match(file.disclaimer, /not an official/i);
    const blob = JSON.stringify(file.resources) + JSON.stringify(file.requirements);
    assert.equal(/ny_taxi|tpcds/i.test(blob), false);
    assert.ok(file.sources.some((source) => source.source_class === "citation_only" && source.reuse_ok === false));
  });

  await test("regression cases cover supported, unsupported, and uncertain outcomes", async () => {
    const cases = regressionCases();
    assert.equal(cases.length, 15);
    for (const outcome of ["supported", "unsupported", "uncertain"]) {
      assert.ok(cases.some((item) => item.expected === outcome), outcome);
    }
    const result = await runRegression();
    if (result.failures.length) console.error(result.failures.join("\n"));
    assert.ok(result.passed >= 12, `${result.passed}/${result.total}`);
    assert.equal(result.passed, 15, result.failures.join("\n"));
  });

  await test("international setup does not pretend the learner is in Cameroon", () => {
    const state = createState({
      learnerId: "demo-a",
      countryCode: "ZZ",
      languageCode: "en",
      skipZetaris: true,
    });
    state.decision = "propose";
    state.proposal = {
      resource_id: "res-en-practice",
      addressed_competency_id: "comp-unknown",
      why: "Why this next step: the unknown part still needs practice.",
      evidence_summary: "Evidence ids: quiz:q2.",
      uncertain: "This is not a score.",
      next_action: "Rewrite the note.",
      source_ids: ["src-np-en-01"],
      overstates: false,
    };
    verificationAgent(state);
    assert.equal(state.findings.some((finding) => finding.code === "country_mismatch"), false);
  });

  await test("verifier rejects a resource in the wrong language", () => {
    const state = createState({
      learnerId: "demo-a",
      countryCode: "CM",
      languageCode: "fr",
      skipZetaris: true,
    });
    state.decision = "propose";
    state.proposal = {
      resource_id: "res-en-practice",
      addressed_competency_id: "comp-unknown",
      why: "Why this next step: the unknown part still needs practice.",
      evidence_summary: "Evidence ids: quiz:q2.",
      uncertain: "This is not a score.",
      next_action: "Rewrite the note.",
      source_ids: ["src-np-en-01"],
      overstates: false,
    };
    verificationAgent(state);
    assert.equal(state.verificationOk, false);
    assert.ok(state.findings.some((finding) => finding.code === "language_mismatch"));
  });

  await test("model-unavailable mode stays deterministic", () => {
    const previous = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;
    assert.equal(modelModeFor(false, false), "deterministic-no-llm");
    assert.equal(modelModeFor(true, false), "deterministic-test");
    if (previous) process.env.LLM_API_KEY = previous;
  });

  await test("closed answers use the stored key and open answers use the rubric", () => {
    const activity = loadFixture().practice.en;
    const good = gradeActivity("practice", activity, "b", "4 boxes were opened. I do not know the missing items. I will write them down.");
    assert.equal(good.closedCorrect, true);
    assert.equal(good.open.result, "met_rubric");
    const bad = gradeActivity("practice", activity, "c", "All good.");
    assert.equal(bad.closedCorrect, false);
    assert.equal(bad.open.result, "not_yet");
    assert.match(bad.label, /not a school grade/i);
  });

  await test("pathway memory mines, stores, retrieves, takes feedback, and resets", async () => {
    const state = createState({
      learnerId: "test-mem-1",
      countryCode: "CM",
      languageCode: "en",
      skipZetaris: true,
    });
    state.claims = [
      {
        claim_id: "claim-comp-known-fact",
        competency_id: "comp-known-fact",
        state: "demonstrated",
        evidence_ids: ["work-sample"],
        source_ids: ["src-np-rubric-01"],
        rationale: "sample",
      },
    ];
    const memory = await rememberLearner(state, "helpful");
    assert.ok(memory.mined.length >= 1);
    assert.ok(memory.retrieved.includes(memory.stored));
    const removed = await resetLearner("test-mem-1");
    assert.ok(removed.includes(memory.stored));
  });

  await test("normal evidence case explains each status and records a correction", async () => {
    const state = await runPathway({
      learnerId: "case-normal",
      countryCode: "CM",
      languageCode: "en",
      skipZetaris: true,
      quizAnswers: { q1: "b", q2: "a" },
    });
    const claim = (id: string) => state.claims.find((item) => item.competency_id === id);
    assert.equal(claim("comp-known-fact")?.state, "demonstrated");
    assert.match(claim("comp-known-fact")?.rationale ?? "", /matched the stored answer key/);
    assert.equal(claim("comp-unknown")?.state, "needs_more_evidence");
    assert.match(claim("comp-unknown")?.rationale ?? "", /did not match the stored answer key/);
    assert.equal(claim("comp-next-action")?.state, "unknown");
    assert.match(claim("comp-next-action")?.rationale ?? "", /No chosen evidence/);
    assert.ok(state.repairs.length >= 1);
    assert.equal(state.verificationOk, true);
    assert.equal(state.decision, "propose");
    assert.equal(state.proposal?.overstates, false);
    assert.match(state.proposal?.next_action ?? "", /Do this now/);
    assert.match(state.proposal?.next_action ?? "", /Leave out any job, grade, or eligibility claim/);
    assert.doesNotMatch(`${state.proposal?.why} ${state.proposal?.next_action}`, /job-ready|should be hired|employment outcome/i);
    assert.ok(state.trace.some((event) => event.summary.startsWith("Correction recorded:")));
    assert.ok(state.pathway.practice.en?.closed.prompt);
    assert.equal(state.dataOrigin, "local-fixture");
    const retrieval = state.trace.find((event) => event.role === "retrieval");
    assert.match(retrieval?.summary ?? "", /Fixture mode/);
    assert.doesNotMatch(retrieval?.summary ?? "", /Retrieved pathway rows from Zetaris/);
  });

  await test("no evidence leaves every requirement unknown and asks one question", async () => {
    const state = await runPathway({
      learnerId: "case-none",
      countryCode: "CM",
      languageCode: "en",
      skipZetaris: true,
    });
    assert.equal(state.decision, "ask");
    assert.equal(state.proposal, null);
    assert.equal(state.question, "What is one fact you can point to from a count or a note you made?");
    assert.equal(state.repairs.length, 0);
    assert.ok(state.claims.every((item) => item.state === "unknown"));
    assert.ok(state.claims.every((item) => /No chosen evidence/.test(item.rationale)));
    assert.match(state.trace.find((event) => event.role === "retrieval")?.summary ?? "", /Fixture mode/);
  });

  await test("unsupported claim abstains and does not recommend from the badge", async () => {
    const state = await runPathway({
      learnerId: "case-badge",
      countryCode: "CM",
      languageCode: "en",
      skipZetaris: true,
      certificate: {
        shared: true,
        title: "Job-ready badge",
        claimedCompetencyIds: ["job-ready"],
        sourceId: "src-unapproved-badge",
      },
    });
    assert.equal(state.outcome, "unsupported");
    assert.equal(state.decision, "abstain");
    assert.equal(state.proposal, null);
    assert.match(state.abstainReason ?? "", /certificate/i);
    assert.ok(state.claims.some((item) => item.rejected && item.competency_id === "job-ready"));
    assert.equal(state.trace.some((event) => /Retrieved pathway rows from Zetaris/.test(event.summary)), false);
    assert.match(state.trace.find((event) => event.role === "retrieval")?.summary ?? "", /Fixture mode/);
  });

  await test("meterless recall across runs omits private evidence", async () => {
    const learnerId = "test-mem-3";
    const secret = "counted-private-cups-zz";
    await resetLearner(learnerId);
    const first = await startRun({
      learnerId,
      countryCode: "CM",
      languageCode: "en",
      skipZetaris: true,
      quizAnswers: { q1: "b" },
      workSample: secret,
    });
    assert.deepEqual(first.priorMemory, []);
    const saved = await saveMemory(first.runId, true, "helpful");
    const savedBlob = JSON.stringify({ priorMemory: saved.priorMemory, memoryDelta: saved.memoryDelta, memory: saved.memory });
    assert.equal(savedBlob.includes(secret), false);
    assert.equal(parseLearnerMemory("mem-x", secret), null);
    const second = await startRun({
      learnerId,
      countryCode: "CM",
      languageCode: "en",
      skipZetaris: true,
      quizAnswers: { q1: "b", q3: "a" },
    });
    assert.ok(second.priorMemory?.some((item) => item.demonstrated.includes("comp-known-fact")));
    assert.equal(JSON.stringify(second.priorMemory).includes(secret), false);
    assert.ok(second.memoryDelta?.added.includes("comp-next-action"));
    const recalled = await recallLearner(learnerId);
    assert.ok(recalled.records.some((item) => item.goal === "pw-workplace-status-update"));
    await resetLearner(learnerId);
  });

  await test("valid zetaris passage stays separate from the fixture pathway", async () => {
    const seen: string[] = [];
    const remote = await readPassages(async (sql) => {
      seen.push(sql);
      if (sql.startsWith("SHOW")) {
        return { columns: ["name"], rows: [{ name: "NEXUS_PATHWAYS" }], rowCount: 1 };
      }
      return { columns: ["passage_id"], rows: [passageRow()], rowCount: 1 };
    });
    assert.deepEqual(seen, ["SHOW LIGHTNING DATABASES", PASSAGE_SQL]);
    assert.doesNotThrow(() => assertReadOnlySql(PASSAGE_SQL));
    assert.equal(remote.ok, true);
    assert.equal(remote.passages[0]?.passage_text, "How much of the work is complete?");
    assert.deepEqual(remote.passages[0]?.lessoncraft_competency_ids, ["comp-known-fact"]);
    assert.equal(remote.passages[0]?.content_origin, "approved public resource");
    const state = createState({ learnerId: "case-passage", countryCode: "CM", languageCode: "en", skipZetaris: true });
    const requirementIds = state.pathway.requirements.map((item) => item.requirement_id).join(",");
    applyPassageRead(state, remote);
    assert.equal(state.pathway.requirements.map((item) => item.requirement_id).join(","), requirementIds);
    assert.equal(state.pathway.pathway_id, "pw-workplace-status-update");
    assert.equal(state.dataOrigin, "local-fixture");
    assert.equal(state.supportingPassages.length, 1);
    const retrieval = state.trace.filter((event) => event.role === "retrieval").at(-1);
    assert.match(retrieval?.summary ?? "", /Pathway structure comes from the local fixture/);
    assert.match(retrieval?.summary ?? "", /Supporting passage pas-twe-75-done comes from Zetaris/);
    assert.doesNotMatch(retrieval?.summary ?? "", /Retrieved pathway rows from Zetaris|Retrieved from Zetaris/);
  });

  await test("rejected passage metadata stays on the fixture", async () => {
    const remote = await readPassages(async (sql) => {
      if (sql.startsWith("SHOW")) {
        return { columns: ["name"], rows: [{ name: "NEXUS_PATHWAYS" }], rowCount: 1 };
      }
      return {
        columns: ["passage_id"],
        rows: [
          passageRow({ access_scope: "private_learner_upload" }),
          passageRow({ passage_id: "pas-empty", passage_text: " " }),
          passageRow({ passage_id: "pas-class", share_status: "class_only" }),
          passageRow({ passage_id: "pas-train", training_use: "train" }),
          passageRow({ passage_id: "pas-origin", content_origin: "private learner upload" }),
          passageRow({ passage_id: "pas-note", lessoncraft_mapping_note: "author framework" }),
        ],
        rowCount: 6,
      };
    });
    assert.equal(remote.ok, false);
    assert.equal(remote.passages.length, 0);
    const state = createState({ learnerId: "case-rejected", countryCode: "CM", languageCode: "en", skipZetaris: true });
    applyPassageRead(state, remote);
    assert.equal(state.dataOrigin, "local-fixture");
    assert.equal(state.supportingPassages.length, 0);
    const retrieval = state.trace.filter((event) => event.role === "retrieval").at(-1);
    assert.match(retrieval?.summary ?? "", /Fixture mode/);
    assert.match(retrieval?.summary ?? "", /local fixture/);
    assert.doesNotMatch(retrieval?.summary ?? "", /comes from Zetaris/);
  });

  await test("no passage rows stay on the fixture", async () => {
    const remote = await readPassages(async (sql) => {
      if (sql.startsWith("SHOW")) {
        return { columns: ["name"], rows: [{ name: "NEXUS_PATHWAYS" }], rowCount: 1 };
      }
      return { columns: ["passage_id"], rows: [], rowCount: 0 };
    });
    assert.equal(remote.ok, false);
    assert.equal(remote.passages.length, 0);
    assert.match(remote.note, /Fixture mode/);
    assert.match(remote.note, /pathway structure comes from the local fixture/i);
    const state = createState({ learnerId: "case-empty", countryCode: "CM", languageCode: "en", skipZetaris: true });
    applyPassageRead(state, remote);
    assert.match(state.trace.filter((event) => event.role === "retrieval").at(-1)?.summary ?? "", /Fixture mode/);
  });

  await test("passage query failure stays on the fixture and hides the driver error", async () => {
    const remote = await readPassages(async () => {
      throw new Error("jdbc:zetaris:lightning@127.0.0.1:10000 peer token secret-token");
    });
    assert.equal(remote.ok, false);
    assert.equal(remote.passages.length, 0);
    assert.match(remote.note, /Fixture mode/);
    assert.match(remote.note, /pathway structure comes from the local fixture/i);
    const blob = JSON.stringify(remote);
    assert.equal(blob.includes("secret-token"), false);
    assert.equal(blob.includes("jdbc:zetaris:lightning"), false);
    const state = createState({ learnerId: "case-fail", countryCode: "CM", languageCode: "en", skipZetaris: true });
    applyPassageRead(state, remote);
    assert.equal(state.dataOrigin, "local-fixture");
    assert.match(state.trace.filter((event) => event.role === "retrieval").at(-1)?.summary ?? "", /Fixture mode/);
  });

  await test("jdbc adapter still rejects writes before any driver call", () => {
    assert.throws(() => assertReadOnlySql("CREATE LIGHTNING DATABASE NEXUS_PATHWAYS"));
    assert.doesNotThrow(() => assertReadOnlySql("SHOW LIGHTNING DATABASES"));
  });
}
