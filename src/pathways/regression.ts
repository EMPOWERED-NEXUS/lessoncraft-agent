import { loadFixture } from "./catalog.ts";
import { runPathway } from "./run.ts";
import type { Outcome, PathwayFile, RunInput } from "./types.ts";

export interface RegressionCase {
  id: string;
  expected: Outcome;
  input: RunInput;
  decision?: RunInput extends never ? never : "propose" | "ask" | "abstain" | "escalate";
  resourceId?: string;
  demonstrated?: string[];
  notDemonstrated?: string[];
  minRepairs?: number;
  modelPrefix?: string;
}

const fullEn = "I counted 12 cups. I do not know if the delivery arrived. I will ask the depot.";
const fullFr = "Le stock est de 12 sacs. La date est inconnue. Prochaine etape: appeler le depot.";

export function regressionCases(): RegressionCase[] {
  return [
    {
      id: "supported-quiz-gap",
      expected: "supported",
      decision: "propose",
      resourceId: "res-en-practice",
      demonstrated: ["comp-known-fact", "comp-next-action"],
      notDemonstrated: ["comp-unknown"],
      minRepairs: 1,
      input: base({
        learnerId: "demo-a",
        quizAnswers: { q1: "b", q2: "a", q3: "a", q4: "b" },
      }),
    },
    {
      id: "supported-work-sample",
      expected: "supported",
      decision: "propose",
      resourceId: "res-en-transfer",
      demonstrated: ["comp-known-fact", "comp-unknown", "comp-next-action", "comp-plain-language", "comp-no-overclaim"],
      minRepairs: 0,
      input: base({ learnerId: "demo-b", workSample: fullEn }),
    },
    {
      id: "supported-french-sample",
      expected: "supported",
      decision: "propose",
      resourceId: "res-fr-transfer",
      input: base({ learnerId: "demo-c", languageCode: "fr", workSample: fullFr }),
    },
    {
      id: "uncertain-no-evidence",
      expected: "uncertain",
      decision: "ask",
      input: base({ learnerId: "demo-d" }),
    },
    {
      id: "uncertain-certificate-not-shared",
      expected: "uncertain",
      decision: "ask",
      notDemonstrated: ["comp-known-fact"],
      input: base({
        learnerId: "demo-e",
        certificate: {
          shared: false,
          title: "Synthetic counted-stock note",
          claimedCompetencyIds: ["comp-known-fact"],
          sourceId: "src-synth-cert-01",
        },
      }),
    },
    {
      id: "unsupported-certificate",
      expected: "unsupported",
      decision: "abstain",
      input: base({
        learnerId: "demo-f",
        certificate: {
          shared: true,
          title: "Job-ready badge",
          claimedCompetencyIds: ["job-ready"],
          sourceId: "src-unapproved-badge",
        },
      }),
    },
    {
      id: "unsupported-taxi-source",
      expected: "unsupported",
      decision: "abstain",
      minRepairs: 1,
      input: base({
        learnerId: "demo-g",
        quizAnswers: { q1: "b", q2: "a", q3: "a", q4: "b" },
        catalog: taxiCatalog(),
      }),
    },
    {
      id: "uncertain-missing-source",
      expected: "uncertain",
      decision: "abstain",
      minRepairs: 1,
      input: base({
        learnerId: "demo-h",
        quizAnswers: { q1: "b", q2: "a", q3: "a", q4: "b" },
        catalog: missingSourceCatalog(),
      }),
    },
    {
      id: "uncertain-language-mismatch",
      expected: "uncertain",
      decision: "abstain",
      input: base({
        learnerId: "demo-i",
        languageCode: "fr",
        workSample: fullFr,
        catalog: englishOnlyCatalog(),
      }),
    },
    {
      id: "unsupported-country-mismatch",
      expected: "unsupported",
      decision: "abstain",
      minRepairs: 1,
      input: base({
        learnerId: "demo-j",
        countryCode: "NG",
        workSample: fullEn,
      }),
    },
    {
      id: "supported-after-verifier-rejection",
      expected: "supported",
      decision: "propose",
      resourceId: "res-en-practice",
      notDemonstrated: ["comp-unknown", "comp-next-action"],
      minRepairs: 1,
      input: base({
        learnerId: "demo-k",
        quizAnswers: { q1: "b" },
      }),
    },
    {
      id: "uncertain-repair-limit",
      expected: "uncertain",
      decision: "escalate",
      minRepairs: 2,
      input: base({
        learnerId: "demo-l",
        quizAnswers: { q1: "b", q2: "a", q3: "a", q4: "b" },
        forceOverclaim: true,
      }),
    },
    {
      id: "supported-model-unavailable",
      expected: "supported",
      decision: "propose",
      modelPrefix: "deterministic",
      input: base({ learnerId: "demo-m", workSample: fullEn }),
    },
    {
      id: "uncertain-ambiguous-sample",
      expected: "uncertain",
      decision: "ask",
      notDemonstrated: ["comp-known-fact", "comp-unknown", "comp-next-action"],
      input: base({ learnerId: "demo-n", workSample: "I did the thing and it is fine." }),
    },
    {
      id: "supported-quiz-plus-sample",
      expected: "supported",
      decision: "propose",
      resourceId: "res-en-transfer",
      demonstrated: ["comp-next-action", "comp-known-fact", "comp-unknown"],
      input: base({
        learnerId: "demo-o",
        quizAnswers: { q1: "b", q2: "b", q3: "c", q4: "b" },
        workSample: "I will ask the depot.",
      }),
    },
  ];
}

function base(partial: Partial<RunInput> & { learnerId: string }): RunInput {
  return {
    countryCode: "ZZ",
    languageCode: "en",
    skipZetaris: true,
    ...partial,
  };
}

function taxiCatalog(): PathwayFile {
  const catalog = structuredClone(loadFixture());
  const source = catalog.sources.find((item) => item.source_id === "src-np-en-01");
  if (!source) throw new Error("missing source");
  source.source_id = "NY_TAXI.customers";
  source.source_title = "NY_TAXI customers";
  for (const row of [...catalog.resources, ...catalog.requirements]) {
    if (row.source_id === "src-np-en-01") row.source_id = "NY_TAXI.customers";
  }
  return catalog;
}

function missingSourceCatalog(): PathwayFile {
  const catalog = structuredClone(loadFixture());
  for (const resource of catalog.resources) {
    if (resource.language_code === "en") resource.source_id = "src-missing";
  }
  return catalog;
}

function englishOnlyCatalog(): PathwayFile {
  const catalog = structuredClone(loadFixture());
  catalog.resources = catalog.resources.filter((resource) => resource.language_code !== "fr");
  return catalog;
}

export async function runRegression(): Promise<{ passed: number; total: number; failures: string[] }> {
  const failures: string[] = [];
  for (const item of regressionCases()) {
    try {
      const state = await runPathway(item.input);
      if (state.outcome !== item.expected) {
        failures.push(`${item.id}: outcome ${state.outcome} != ${item.expected}`);
      }
      if (item.decision && state.decision !== item.decision) {
        failures.push(`${item.id}: decision ${state.decision} != ${item.decision}`);
      }
      if (item.resourceId && state.proposal?.resource_id !== item.resourceId) {
        failures.push(`${item.id}: resource ${state.proposal?.resource_id ?? "none"} != ${item.resourceId}`);
      }
      for (const competencyId of item.demonstrated ?? []) {
        const claim = state.claims.find((entry) => entry.competency_id === competencyId);
        if (claim?.state !== "demonstrated") failures.push(`${item.id}: ${competencyId} is ${claim?.state}`);
      }
      for (const competencyId of item.notDemonstrated ?? []) {
        const claim = state.claims.find((entry) => entry.competency_id === competencyId);
        if (claim?.state === "demonstrated") failures.push(`${item.id}: ${competencyId} should not be demonstrated`);
      }
      if (item.minRepairs != null && state.repairs.length < item.minRepairs) {
        failures.push(`${item.id}: repairs ${state.repairs.length} < ${item.minRepairs}`);
      }
      if (item.modelPrefix && !state.modelMode.startsWith(item.modelPrefix)) {
        failures.push(`${item.id}: model ${state.modelMode}`);
      }
      if (state.proposal && state.proposal.source_ids.length === 0) {
        failures.push(`${item.id}: recommendation has no source`);
      }
    } catch (error) {
      failures.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const total = regressionCases().length;
  return { passed: total - failures.length, total, failures };
}
