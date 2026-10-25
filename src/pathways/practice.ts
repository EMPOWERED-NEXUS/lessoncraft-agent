import type { Activity, GradeResult, RubricItem } from "./types.ts";
import { matchesAny } from "./text-rules.ts";

export function gradeActivity(
  phase: "practice" | "transfer",
  activity: Activity,
  closedAnswer: string,
  openAnswer: string,
): GradeResult {
  const closedCorrect = activity.closed.answer.trim().toLowerCase() === closedAnswer.trim().toLowerCase();
  const open = gradeOpen(activity.open.rubric, openAnswer);
  return {
    phase,
    closedCorrect,
    open,
    label: labelFor(closedCorrect, open.result),
  };
}

function gradeOpen(rubric: RubricItem[], text: string): GradeResult["open"] {
  const met: string[] = [];
  const missed: string[] = [];
  for (const item of rubric) {
    if (text.trim() && matchesAny(text, item.patterns)) met.push(item.id);
    else missed.push(item.id);
  }
  const result = missed.length === 0 ? "met_rubric" : met.length === 0 ? "not_yet" : "partial";
  return { met, missed, result };
}

function labelFor(closedCorrect: boolean, openResult: GradeResult["open"]["result"]): string {
  const closed = closedCorrect ? "Closed question matched the answer key." : "Closed question did not match the answer key.";
  const open =
    openResult === "met_rubric"
      ? "Open response matched the rubric."
      : openResult === "partial"
        ? "Open response matched part of the rubric."
        : "Open response did not match the rubric yet.";
  return `${closed} ${open} This is not a school grade, a credential, or a hiring score.`;
}
