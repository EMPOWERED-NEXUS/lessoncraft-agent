export const BANNED =
  /job-ready|job ready|you are hired|eligible for|qualified for this job|diagnosis|permanent score|guarantee employment|prêt pour l'emploi|pret pour l'emploi|embauch/i;

export const OVERCLAIM =
  /whole status update|entire skill|all of the competencies|toute la compétence|toute la competence|compte-rendu entier/i;

export function containsBanned(text: string): boolean {
  return BANNED.test(text);
}

export function containsOverclaim(text: string): boolean {
  return OVERCLAIM.test(text);
}

export function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(text);
    } catch {
      return false;
    }
  });
}
