export interface ProposedObjective {
  text: string;
  uncertain: boolean;
  reason: string;
}

const OBJECTIVE_LINE = /^(\d+[.)\]]|[-*•])\s+\S+/;
const OBJECTIVE_WORDS = /objective|will be able to|learners? will|students? will|be able to/i;

export function proposeObjectives(text: string): ProposedObjective[] {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const marked = lines.filter((line) => OBJECTIVE_LINE.test(line) || OBJECTIVE_WORDS.test(line));
  const chosen = marked.length ? marked : lines;
  return chosen.map((line) => {
    const textOnly = line.replace(/^(\d+[.)\]]|[-*•])\s+/, "").trim();
    const uncertain = textOnly.length < 12 || !/[a-z]/i.test(textOnly) || (!OBJECTIVE_LINE.test(line) && !OBJECTIVE_WORDS.test(line));
    return {
      text: textOnly,
      uncertain,
      reason: uncertain
        ? "This line is not a clear objective. Correct it or remove it before saving."
        : "Extracted from the pasted text. Review the wording before saving.",
    };
  });
}

export function objectivesNeedReview(items: ProposedObjective[]): boolean {
  return items.length === 0 || items.some((item) => item.uncertain);
}
