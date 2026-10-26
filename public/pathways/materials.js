/**
 * Lesson text is held in this page's memory for the current visit.
 * It is not written to localStorage, an account, Zetaris, or Meterless.
 * A file that was not read cannot be kept for the lesson.
 */

export const UNREAD_FILE_STATUSES = ["later", "unavailable", "no_text", "empty", "error", "unsupported"];

export function materialPhase({ file, status, note, preview, notice }) {
  if (status === "reading") return "reading";
  if (status === "selected") return "selected";
  if (status === "extracted" || status === "edited") return "ready";
  if (UNREAD_FILE_STATUSES.includes(status)) return "not_readable";
  if (file) return "selected";
  if (notice === "removed") return "removed";
  if (String(note || "").trim() || String(preview || "").trim()) return "ready";
  return "idle";
}

const CLOSED = {
  ok: false,
  errorKey: "use_unavailable",
  purpose: "lesson",
  trainingRequested: false,
  trainingApplied: false,
  sharedWithClass: false,
  published: false,
  savedToAccount: false,
  sessionOnly: true,
  savedToZetaris: false,
  savedToMeterless: false,
  sendsToExternalModel: false,
};

export function assessUse(choice) {
  const purpose = choice?.purpose || "lesson";
  if (purpose !== "lesson" || choice?.training) return { ...CLOSED, purpose };
  return {
    ok: true,
    purpose: "lesson",
    trainingRequested: false,
    trainingApplied: false,
    sharedWithClass: false,
    published: false,
    savedToAccount: false,
    sessionOnly: true,
    savedToZetaris: false,
    savedToMeterless: false,
    sendsToExternalModel: false,
    license: "",
  };
}

export function textForLesson({ fileSelected, status, preview, note, ocr = false, reviewed = false }) {
  if (fileSelected && UNREAD_FILE_STATUSES.includes(status)) {
    return { ok: false, errorKey: "extract_not_in_lesson", preview: "" };
  }
  const text = String(preview || "").trim() || String(note || "").trim();
  if (!text) return { ok: false, errorKey: "extract_empty", preview: "" };
  if (fileSelected && status !== "extracted" && status !== "edited") {
    return { ok: false, errorKey: "extract_not_in_lesson", preview: "" };
  }
  if (ocr && !reviewed) return { ok: false, errorKey: "ocr_review_required", preview: "" };
  return { ok: true, preview: text };
}

export const LESSON_TEXT_LIMIT = 500;

export function pathwayText({ sample = "", items = [], limit = LESSON_TEXT_LIMIT } = {}) {
  const attached = items
    .filter((item) => item.purpose === "lesson" && !UNREAD_FILE_STATUSES.includes(item.status) && String(item.preview || "").trim())
    .map((item) => String(item.preview).trim())
    .join("\n");
  const full = [String(sample || "").trim(), attached].filter(Boolean).join("\n");
  const text = full.slice(0, limit);
  return { text, limit, count: text.length, omitted: Math.max(0, full.length - text.length) };
}

export function createSessionMaterials() {
  const items = [];
  return {
    list() {
      return items.map((item) => ({ ...item }));
    },
    add(item) {
      const use = assessUse(item);
      if (!use.ok) return use;
      if (UNREAD_FILE_STATUSES.includes(item.status) || !String(item.preview || "").trim()) {
        return { ok: false, errorKey: "extract_not_in_lesson", ...use, ok: false };
      }
      const stored = {
        id: item.id,
        name: item.name,
        preview: String(item.preview || ""),
        status: item.status,
        ...use,
      };
      items.push(stored);
      return { ok: true, item: { ...stored } };
    },
    remove(id) {
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) items.splice(index, 1);
    },
    clear() {
      items.length = 0;
    },
  };
}

export function lessonPreview(items, limit = 500) {
  return items
    .filter((item) => item.purpose === "lesson" && !UNREAD_FILE_STATUSES.includes(item.status) && item.preview.trim())
    .map((item) => item.preview.trim())
    .join("\n")
    .slice(0, limit);
}
