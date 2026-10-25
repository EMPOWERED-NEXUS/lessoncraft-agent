export interface DemoPreset {
  id: string;
  label: string;
  learnerId: string;
  countryCode: string;
  languageCode: string;
  quizAnswers: Record<string, string> | null;
  workSample: string;
  certificate: {
    shared: boolean;
    title: string;
    claimedCompetencyIds: string[];
    sourceId: string;
  } | null;
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: "gap",
    label: "Demo A — quiz shows one gap",
    learnerId: "demo-a",
    countryCode: "ZZ",
    languageCode: "en",
    quizAnswers: { q1: "b", q2: "a", q3: "a", q4: "b" },
    workSample: "",
    certificate: null,
  },
  {
    id: "none",
    label: "Demo B — no evidence yet",
    learnerId: "demo-b",
    countryCode: "ZZ",
    languageCode: "en",
    quizAnswers: null,
    workSample: "",
    certificate: null,
  },
  {
    id: "french",
    label: "Demo C — French note",
    learnerId: "demo-c",
    countryCode: "ZZ",
    languageCode: "fr",
    quizAnswers: null,
    workSample: "Le stock est de 12 sacs. La date est inconnue. Prochaine étape: appeler le dépôt.",
    certificate: null,
  },
  {
    id: "badge",
    label: "Demo D — unsupported badge",
    learnerId: "demo-d",
    countryCode: "ZZ",
    languageCode: "en",
    quizAnswers: null,
    workSample: "",
    certificate: {
      shared: true,
      title: "Job-ready badge",
      claimedCompetencyIds: ["job-ready"],
      sourceId: "src-unapproved-badge",
    },
  },
];
