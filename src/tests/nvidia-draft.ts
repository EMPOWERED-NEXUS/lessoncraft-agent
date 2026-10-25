import assert from "node:assert/strict";
import { loadFixture } from "../pathways/catalog.ts";
import { createState, runPathway } from "../pathways/run.ts";
import { attachNvidiaDraft, draftLearningResponse, selectedQuizAnswers, verifyNvidiaDraft } from "../pathways/nvidia-draft.ts";
import { completeNvidiaChat, NVIDIA_CHAT_TEMPLATE, NVIDIA_MAX_TOKENS, NvidiaCallError } from "../nvidia.ts";
import type { NvidiaClient, SupportingPassage } from "../pathways/types.ts";

type TestFn = (name: string, fn: () => Promise<void> | void) => Promise<void>;

const PASSAGE_TEXT = "How much of the work is complete?";

function passage(): SupportingPassage {
  return {
    passage_id: "pas-twe-75-done",
    passage_text: PASSAGE_TEXT,
    section_locator: "7.5 Progress Reports, opening questions",
    lessoncraft_competency_ids: ["comp-known-fact"],
    lessoncraft_mapping_note: "test",
    source_id: "src-twe-75",
    source_title: "Technical Writing Essentials 2nd Edition",
    creators: "Suzan Last",
    editor: "Suzan Last",
    source_url: "https://pressbooks.bccampus.ca/technicalwriting2ed/chapter/progressreports/",
    licence: "Creative Commons Attribution 4.0 International License",
    licence_url: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "Technical Writing Essentials 2nd Edition, section 7.5",
    review_status: "reviewed",
    not_official_standard: "true",
    official_standard_marker: "Not an official standard",
    access_scope: "approved_public",
    share_status: "published",
    content_origin: "approved public resource",
    training_use: "retrieval_only",
    language_code: "en",
  };
}

function goodDraft(): string {
  return JSON.stringify({
    explanation: "A status update should separate a known count from what is still open.",
    example: "I counted 12 cups. I do not know whether the delivery arrived. I will ask the depot.",
    followUp: "What fact can you point to from your own count?",
    evidenceQuote: PASSAGE_TEXT,
    passageId: "pas-twe-75-done",
  });
}

function client(content: string, usage = { promptTokens: 11, completionTokens: 7, totalTokens: 18 }): NvidiaClient {
  return async () => ({ content, model: "nvidia/nemotron-3.5-super-vl-120b-a12b", usage });
}

export async function nvidiaDraftTests(test: TestFn): Promise<void> {
  const answers = selectedQuizAnswers(
    [{
      id: "q1",
      prompt: "What did you count?",
      competency_ids: ["comp-known-fact"],
      options: [{ id: "b", text: "Email learner@example.com", competency_ids: ["comp-known-fact"] }],
    }],
    { q1: "b" },
  );
  const privateNote = "counted-private-cups-zz";

  await test("NVIDIA draft succeeds only from the selected answer and approved passage", async () => {
    const seen: string[] = [];
    const mock: NvidiaClient = async (messages) => {
      seen.push(JSON.stringify(messages));
      return client(goodDraft())(messages);
    };
    const report = await draftLearningResponse({
      consent: true,
      testMode: false,
      languageCode: "en",
      selectedAnswers: answers,
      passages: [passage()],
      client: mock,
    });
    assert.equal(report.called, true);
    assert.equal(report.fallback, false);
    assert.equal(report.verifier, "passed");
    assert.equal(report.repairAttempted, false);
    assert.equal(report.model, "nvidia/nemotron-3.5-super-vl-120b-a12b");
    assert.equal(report.draft?.passageId, "pas-twe-75-done");
    assert.equal(report.draft?.evidenceQuote, PASSAGE_TEXT);
    assert.equal(report.draft?.explanation.includes(PASSAGE_TEXT), false);
    assert.deepEqual(report.passageIds, ["pas-twe-75-done"]);
    assert.equal(report.usage?.totalTokens, 18);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].includes(privateNote), false);
    assert.equal(seen[0].includes("learner@example.com"), false);
    assert.equal(seen[0].includes("Meterless"), false);
    assert.equal(seen[0].includes(PASSAGE_TEXT), true);
    assert.equal(answers[0].includes("[redacted]"), true);
  });

  await test("NVIDIA is not called without consent", async () => {
    let calls = 0;
    const report = await draftLearningResponse({
      consent: false,
      testMode: false,
      languageCode: "en",
      selectedAnswers: answers,
      passages: [passage()],
      client: async () => {
        calls += 1;
        throw new Error("should not be called");
      },
    });
    assert.equal(calls, 0);
    assert.equal(report.called, false);
    assert.equal(report.reason, "no_consent");
    assert.equal(report.draft, null);
    const state = await runPathway({
      learnerId: "nvidia-off",
      countryCode: "ZZ",
      languageCode: "en",
      skipZetaris: true,
      quizAnswers: { q1: "b" },
      workSample: privateNote,
      nvidiaConsent: false,
      nvidiaClient: async () => {
        calls += 1;
        throw new Error("should not be called");
      },
    });
    assert.equal(calls, 0);
    assert.equal(state.nvidia.called, false);
    const off = state.trace.find((event) => event.role === "nvidia");
    assert.match(off?.summary ?? "", /not called/i);
    assert.equal(JSON.stringify(off).includes(privateNote), false);
  });

  await test("NVIDIA timeout or API failure falls back without a second call", async () => {
    for (const code of ["timeout", "api_error"] as const) {
      let calls = 0;
      const report = await draftLearningResponse({
        consent: true,
        testMode: false,
        languageCode: "en",
        selectedAnswers: answers,
        passages: [passage()],
        client: async () => {
          calls += 1;
          throw new NvidiaCallError(code);
        },
      });
      assert.equal(calls, 1);
      assert.equal(report.called, true);
      assert.equal(report.fallback, true);
      assert.equal(report.repairAttempted, false);
      assert.equal(report.draft, null);
      assert.equal(report.fallbackReason, code);
    }
  });

  await test("NVIDIA verifier rejection allows one repair and then falls back", async () => {
    let calls = 0;
    const hired = JSON.stringify({
      explanation: "You are hired because the count is enough.",
      example: "The whole skill is done.",
      followUp: "Should you be hired?",
      evidenceQuote: PASSAGE_TEXT,
      passageId: "pas-twe-75-done",
    });
    const before = "Rewrite the vague note into one fact.";
    const state = createState({
      learnerId: "nvidia-reject",
      countryCode: "ZZ",
      languageCode: "en",
      skipZetaris: true,
    });
    state.supportingPassages = [passage()];
    state.proposal = {
      resource_id: "res-en-practice",
      addressed_competency_id: "comp-unknown",
      why: before,
      evidence_summary: "Evidence ids: quiz:q1.",
      uncertain: "This is not a score.",
      next_action: before,
      source_ids: ["src-np-en-01"],
      overstates: false,
    };
    await attachNvidiaDraft(state, {
      learnerId: "nvidia-reject",
      countryCode: "ZZ",
      languageCode: "en",
      quizAnswers: { q1: "b" },
      workSample: privateNote,
      nvidiaConsent: true,
      nvidiaClient: async () => {
        calls += 1;
        return { content: hired, model: "nvidia/nemotron-3.5-super-vl-120b-a12b", usage: null };
      },
    });
    assert.equal(calls, 2);
    assert.equal(state.nvidia.called, true);
    assert.equal(state.nvidia.repairAttempted, true);
    assert.equal(state.nvidia.verifier, "failed");
    assert.equal(state.nvidia.fallback, true);
    assert.equal(state.nvidia.draft, null);
    assert.equal(state.proposal?.next_action, before);
    const trace = state.trace.find((event) => event.role === "nvidia");
    assert.match(trace?.summary ?? "", /fallback=yes/);
    assert.equal(JSON.stringify(trace).includes(privateNote), false);
    assert.equal(JSON.stringify(trace).includes("You are hired"), false);
  });

  await test("invalid NVIDIA structure falls back after one repair", async () => {
    let calls = 0;
    const report = await draftLearningResponse({
      consent: true,
      testMode: false,
      languageCode: "fr",
      selectedAnswers: answers,
      passages: [passage()],
      client: async () => {
        calls += 1;
        return { content: "not json", model: "nvidia/nemotron-3.5-super-vl-120b-a12b", usage: null };
      },
    });
    assert.equal(calls, 2);
    assert.equal(report.fallback, true);
    assert.equal(report.verifier, "failed");
    assert.equal(report.repairAttempted, true);
    assert.equal(report.draft, null);
  });

  await test("consent without an approved passage does not call NVIDIA", async () => {
    let calls = 0;
    const state = await runPathway({
      learnerId: "nvidia-no-passage",
      countryCode: "ZZ",
      languageCode: "en",
      skipZetaris: true,
      quizAnswers: { q1: "b" },
      nvidiaConsent: true,
      nvidiaClient: async () => {
        calls += 1;
        throw new Error("should not be called");
      },
    });
    assert.equal(calls, 0);
    assert.equal(state.nvidia.called, false);
    assert.equal(state.nvidia.reason, "no_passage");
    assert.equal(state.decision, "propose");
    assert.ok(state.proposal?.next_action);
  });

  await test("a paraphrased explanation passes when the evidence quote is exact", () => {
    const checked = verifyNvidiaDraft(goodDraft(), [passage()]);
    assert.equal(checked.ok, true);
    if (!checked.ok) return;
    assert.equal(checked.draft.explanation.includes(PASSAGE_TEXT), false);
    assert.equal(passage().passage_text.includes(checked.draft.evidenceQuote), true);
    const quoted = verifyNvidiaDraft(JSON.stringify({
      explanation: "A status update should separate a known count from what is still open.",
      example: "I counted 12 cups.",
      followUp: "What fact can you point to?",
      evidence_quote: `"${PASSAGE_TEXT}"`,
      passageIds: ["pas-twe-75-done"],
    }), [passage()]);
    assert.equal(quoted.ok, true);
  });

  await test("an unsupported passage id or a quote from another passage is rejected", () => {
    const unknown = verifyNvidiaDraft(JSON.stringify({
      explanation: "A status update should separate a known count from what is still open.",
      example: "I counted 12 cups.",
      followUp: "What fact can you point to?",
      evidenceQuote: PASSAGE_TEXT,
      passageId: "pas-not-approved",
    }), [passage()]);
    assert.equal(unknown.ok, false);
    if (unknown.ok) return;
    assert.equal(unknown.codes.includes("unknown_passage"), true);

    const other = passage();
    other.passage_id = "pas-twe-75-status";
    other.passage_text = "It should review the work completed, work in progress, and work remaining to be done on the project.";
    const mismatch = verifyNvidiaDraft(JSON.stringify({
      explanation: "A status update should separate a known count from what is still open.",
      example: "I counted 12 cups.",
      followUp: "What fact can you point to?",
      evidenceQuote: other.passage_text,
      passageId: "pas-twe-75-done",
    }), [passage(), other]);
    assert.equal(mismatch.ok, false);
    if (mismatch.ok) return;
    assert.equal(mismatch.codes.includes("ungrounded"), true);
  });

  await test("unsupported passage ids fall back after one repair", async () => {
    let calls = 0;
    const bad = JSON.stringify({
      explanation: "A status update should separate a known count from what is still open.",
      example: "I counted 12 cups.",
      followUp: "What fact can you point to?",
      evidenceQuote: PASSAGE_TEXT,
      passageId: "pas-not-approved",
    });
    const report = await draftLearningResponse({
      consent: true,
      testMode: false,
      languageCode: "en",
      selectedAnswers: answers,
      passages: [passage()],
      client: async () => {
        calls += 1;
        return { content: bad, model: "nvidia/nemotron-3.5-super-vl-120b-a12b", usage: null };
      },
    });
    assert.equal(calls, 2);
    assert.equal(report.repairAttempted, true);
    assert.equal(report.fallback, true);
    assert.equal(report.verifier, "failed");
    assert.equal(report.draft, null);
  });

  await test("short or empty NVIDIA output falls back after one repair", async () => {
    for (const content of ["", "ok"]) {
      let calls = 0;
      const report = await draftLearningResponse({
        consent: true,
        testMode: false,
        languageCode: "en",
        selectedAnswers: answers,
        passages: [passage()],
        client: async () => {
          calls += 1;
          return { content, model: "nvidia/nemotron-3.5-super-vl-120b-a12b", usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 } };
        },
      });
      assert.equal(calls, 2);
      assert.equal(report.fallback, true);
      assert.equal(report.repairAttempted, true);
      assert.equal(report.draft, null);
      assert.equal(report.usage?.totalTokens, 6);
    }
  });

  await test("NVIDIA client sends sampling settings and does not echo the key", async () => {
    const previousKey = process.env.NVIDIA_API_KEY;
    const previousBase = process.env.NVIDIA_BASE_URL;
    const previousModel = process.env.NVIDIA_MODEL;
    process.env.NVIDIA_API_KEY = "nvidia-test-key";
    process.env.NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
    process.env.NVIDIA_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
    try {
      let seenUrl = "";
      let seenBody = "";
      let seenAuth = "";
      const result = await completeNvidiaChat(
        [{ role: "user", content: "selected answer only" }],
        (async (url, init) => {
          seenUrl = String(url);
          seenAuth = String((init?.headers as Record<string, string>).Authorization);
          seenBody = String(init?.body);
          return new Response(JSON.stringify({
            model: "private/nvidia/nemotron-3.5-super-120b-a12b",
            choices: [{ message: { content: goodDraft(), reasoning_content: "hidden reasoning trail" } }],
            usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
          }), { status: 200 });
        }) as typeof fetch,
      );
      assert.equal(seenUrl, "https://integrate.api.nvidia.com/v1/chat/completions");
      assert.equal(seenAuth, "Bearer nvidia-test-key");
      const body = JSON.parse(seenBody) as {
        temperature: number;
        top_p: number;
        max_tokens: number;
        model: string;
        chat_template_kwargs: { enable_thinking: boolean };
      };
      assert.equal(body.temperature, 1);
      assert.equal(body.top_p, 0.95);
      assert.equal(body.max_tokens, NVIDIA_MAX_TOKENS);
      assert.equal(body.max_tokens, 512);
      assert.deepEqual(body.chat_template_kwargs, NVIDIA_CHAT_TEMPLATE);
      assert.equal(body.chat_template_kwargs.enable_thinking, false);
      assert.equal(body.model, "nvidia/nemotron-3.5-super-vl-120b-a12b");
      assert.equal(result.model, "private/nvidia/nemotron-3.5-super-120b-a12b");
      assert.equal(result.content, goodDraft());
      assert.equal(JSON.stringify(result).includes("hidden reasoning trail"), false);
      assert.equal(result.usage?.totalTokens, 7);
      let failed = false;
      try {
        await completeNvidiaChat(
          [{ role: "user", content: "selected answer only" }],
          (async () => new Response(JSON.stringify({ error: { message: "nvidia-test-key rejected" } }), { status: 401 })) as typeof fetch,
        );
      } catch (error) {
        failed = true;
        assert.ok(error instanceof NvidiaCallError);
        assert.equal(error.code, "api_error");
        assert.equal(error.message.includes("nvidia-test-key"), false);
      }
      assert.equal(failed, true);
    } finally {
      restore("NVIDIA_API_KEY", previousKey);
      restore("NVIDIA_BASE_URL", previousBase);
      restore("NVIDIA_MODEL", previousModel);
    }
    assert.ok(loadFixture().quiz.some((item) => item.id === "q1"));
  });
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
