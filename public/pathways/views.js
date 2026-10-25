export const PATHWAY_VIEWS = ["learn", "materials", "progress", "about"];

export function viewFromHash(hash) {
  const name = String(hash || "").replace(/^#/, "").split(/[?&]/)[0];
  return PATHWAY_VIEWS.includes(name) ? name : "learn";
}

export function railStage({ view, hasRun, practiceOpen }) {
  if (view === "materials") return "explore";
  if (!hasRun) return "bring";
  if (practiceOpen) return "practice";
  return "next";
}
