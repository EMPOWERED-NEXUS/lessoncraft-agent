import type { ObjectiveRecord, QuestionRecord, SourceRecord } from "../accounts/store.ts";

export type Competency = "demonstrated" | "needs_more" | "unclear";
export type Branch = "practise" | "clarify" | "advance";

export interface TraceStep {
  agent: "mapper" | "retriever" | "tutor" | "evaluator";
  action: string;
  result: string;
}

export interface Teaching {
  objective: ObjectiveRecord | null;
  evidence: SourceRecord | null;
  explanation: string;
  citation: string;
  hint: string;
  tryPrompt: string;
  question: QuestionRecord | null;
  trace: TraceStep[];
  grounded: boolean;
}

export interface AnswerJudgement {
  competency: Competency;
  branch: Branch;
  feedback: string;
  missing: string[];
  nextAction: string;
  trace: TraceStep[];
}

function tokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

export function mapObjective(query: string, objectives: ObjectiveRecord[]): ObjectiveRecord | null {
  const words = new Set(tokens(query));
  let best: ObjectiveRecord | null = null;
  let score = 0;
  for (const objective of objectives) {
    const overlap = tokens(objective.text).filter((word) => words.has(word) && word.length > 3).length;
    if (overlap > score) {
      best = objective;
      score = overlap;
    }
  }
  return score > 0 ? best : objectives[0] ?? null;
}

export function selectEvidence(objective: ObjectiveRecord | null, sources: SourceRecord[], questions: QuestionRecord[]): SourceRecord | null {
  if (!objective) return null;
  const linked = questions.find((question) => question.objectiveId === objective.id);
  const source = sources.find((item) => item.id === linked?.sourceId) ?? sources[0];
  if (!source || source.reviewStatus !== "approved" || source.training) return null;
  if (!source.excerpt.trim()) return null;
  return source;
}

export function localTeaching(source: SourceRecord | null, question: QuestionRecord | null): { explanation: string; hint: string; tryPrompt: string } {
  if (!source) {
    return {
      explanation: "",
      hint: "No approved source is available, so this step will not invent an explanation.",
      tryPrompt: "Choose another objective or ask the teacher to approve a source.",
    };
  }
  return {
    explanation: source.excerpt,
    hint: "Use only what the cited notice says. Do not add a fact that is not written there.",
    tryPrompt: question?.prompt || "Say what the reader should do, using the notice.",
  };
}

export function draftIsGrounded(explanation: string, source: SourceRecord | null): boolean {
  if (!source) return explanation.trim() === "";
  const quote = source.excerpt.trim();
  return quote.length > 0 && explanation.includes(quote);
}

export function teach(input: {
  query: string;
  objectives: ObjectiveRecord[];
  sources: SourceRecord[];
  questions: QuestionRecord[];
  modelDraft?: string | null;
}): Teaching {
  const objective = input.query.trim() ? mapObjective(input.query, input.objectives) : null;
  const trace: TraceStep[] = [{
    agent: "mapper",
    action: input.query.trim() ? "Match the request to a reviewed objective." : "Wait for a concept or objective.",
    result: objective ? objective.text : "No objective selected.",
  }];
  if (!objective) {
    return {
      objective: null,
      evidence: null,
      explanation: "",
      citation: "",
      hint: "Name a concept or choose an objective.",
      tryPrompt: "",
      question: null,
      trace,
      grounded: false,
    };
  }
  const question = input.questions.find((item) => item.objectiveId === objective.id) ?? null;
  const evidence = selectEvidence(objective, input.sources, input.questions);
  trace.push({
    agent: "retriever",
    action: "Select an approved source linked to that objective.",
    result: evidence ? `${evidence.title} (${evidence.id})` : "No approved source.",
  });
  const local = localTeaching(evidence, question);
  let explanation = local.explanation;
  let grounded = draftIsGrounded(explanation, evidence);
  trace.push({
    agent: "tutor",
    action: "Propose an explanation made only from the approved excerpt.",
    result: grounded ? "Local excerpt is ready for the evaluator." : "No excerpt to teach from.",
  });
  if (input.modelDraft && evidence) {
    const modelGrounded = draftIsGrounded(input.modelDraft, evidence);
    trace.push({
      agent: "evaluator",
      action: "Check the model draft against the approved excerpt.",
      result: modelGrounded ? "The draft contains the excerpt." : "The draft does not contain the excerpt, so it was not used.",
    });
    if (modelGrounded) explanation = input.modelDraft;
    else {
      trace.push({
        agent: "tutor",
        action: "Revise after the evaluator rejected the model draft.",
        result: "Returned to the approved excerpt.",
      });
    }
    grounded = draftIsGrounded(explanation, evidence);
  }
  trace.push({
    agent: "evaluator",
    action: "Accept the explanation only when it contains the approved excerpt.",
    result: grounded ? "Explanation accepted." : "Explanation withheld.",
  });
  return {
    objective,
    evidence,
    explanation: grounded ? explanation : "",
    citation: evidence ? `${evidence.attribution} ${evidence.title}`.trim() : "",
    hint: local.hint,
    tryPrompt: local.tryPrompt,
    question,
    trace,
    grounded,
  };
}

export function judgeAnswer(answer: string, question: QuestionRecord | null, nextQuestion: QuestionRecord | null): AnswerJudgement {
  const text = answer.trim().toLowerCase();
  if (!question) {
    return {
      competency: "unclear",
      branch: "clarify",
      feedback: "Choose an objective before answering.",
      missing: [],
      nextAction: "Choose an objective.",
      trace: [{ agent: "evaluator", action: "Check the answer.", result: "No reviewed question is open." }],
    };
  }
  if (!text) {
    return {
      competency: "unclear",
      branch: "clarify",
      feedback: "Write what the reader should do.",
      missing: question.requiredIdeas,
      nextAction: "Answer the question in your own words.",
      trace: [{ agent: "evaluator", action: "Check the answer against the reviewed ideas.", result: "The answer was empty." }],
    };
  }
  const missing = question.requiredIdeas.filter((idea) => !text.includes(idea.toLowerCase()));
  if (missing.length === 0) {
    const nextAction = nextQuestion
      ? `Try the next question: ${nextQuestion.prompt}`
      : "This objective is demonstrated. Choose another objective.";
    return {
      competency: "demonstrated",
      branch: "advance",
      feedback: "The reviewed ideas are present. This is not a grade.",
      missing: [],
      nextAction,
      trace: [{ agent: "evaluator", action: "Compare the answer with the reviewed ideas.", result: "Advance." }],
    };
  }
  if (missing.length === question.requiredIdeas.length) {
    return {
      competency: "unclear",
      branch: "practise",
      feedback: "The reviewed ideas are not in the answer yet. Read the cited notice and try again.",
      missing,
      nextAction: "Practise this question again.",
      trace: [{ agent: "evaluator", action: "Compare the answer with the reviewed ideas.", result: "Practise again." }],
    };
  }
  return {
    competency: "needs_more",
    branch: "clarify",
    feedback: `Add the missing idea: ${missing[0]}.`,
    missing,
    nextAction: "Answer the clarifying question, then try again.",
    trace: [{ agent: "evaluator", action: "Compare the answer with the reviewed ideas.", result: "Ask a clarifying question." }],
  };
}

export function nvidiaMessages(input: { question: string; excerpt: string; answer: string }): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: "Explain only from the supplied excerpt. Include that excerpt exactly. Do not add facts, and do not treat this as training data.",
    },
    {
      role: "user",
      content: `Question: ${input.question}\nExcerpt: ${input.excerpt}\nLearner response: ${input.answer}`,
    },
  ];
}
