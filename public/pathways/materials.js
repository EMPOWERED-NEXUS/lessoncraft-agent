/**
 * Lesson text is held in this page's memory for the current visit.
 * It is not written to localStorage, an account, Zetaris, or Meterless.
 * A file that was not read cannot be kept for the lesson.
 */

export const UNREAD_FILE_STATUSES = ["later", "unavailable", "no_text", "empty", "error", "unsupported"];

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

export function textForLesson({ fileSelected, status, preview, note }) {
  if (fileSelected && UNREAD_FILE_STATUSES.includes(status)) {
    return { ok: false, errorKey: "extract_not_in_lesson", preview: "" };
  }
  const text = String(preview || "").trim() || String(note || "").trim();
  if (!text) return { ok: false, errorKey: "extract_empty", preview: "" };
  if (fileSelected && status !== "extracted" && status !== "edited") {
    return { ok: false, errorKey: "extract_not_in_lesson", preview: "" };
  }
  return { ok: true, preview: text };
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
