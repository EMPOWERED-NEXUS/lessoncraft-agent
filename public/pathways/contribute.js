/**
 * Contribution drafts live in this page's memory for the current visit.
 * They are not written to localStorage, an account, Zetaris, or Meterless.
 * A license here is the learner's declaration. It is not a rights check.
 * Saving a draft does not permit model training.
 */

export const CONTRIBUTION_LICENSES = ["CC BY 4.0", "CC BY-SA 4.0", "CC0 1.0", "All rights reserved"];

export function submitContribution(input) {
  const preview = String(input.preview || "").trim();
  const attribution = String(input.attribution || "").trim();
  const license = String(input.license || "");
  const refused = {
    ok: false,
    published: false,
    training: false,
    savedToZetaris: false,
    savedToMeterless: false,
  };
  if (!preview) return { ...refused, errorKey: "contrib_need_preview" };
  if (!input.removedPersonal) return { ...refused, errorKey: "contrib_need_redact" };
  if (!input.rights) return { ...refused, errorKey: "contrib_need_rights" };
  if (!attribution) return { ...refused, errorKey: "contrib_need_attribution" };
  if (!CONTRIBUTION_LICENSES.includes(license)) return { ...refused, errorKey: "contrib_need_license" };
  if (input.training) return { ...refused, errorKey: "contrib_training_off" };
  return {
    ok: true,
    draft: {
      id: String(input.id || "draft"),
      status: "private_draft",
      preview,
      attribution,
      license,
      published: false,
      training: false,
      savedToZetaris: false,
      savedToMeterless: false,
      storedIn: "browser-tab-memory",
      persisted: false,
      licenseVerified: false,
      moderation: "unavailable",
    },
  };
}

export function createDraftStore() {
  const drafts = [];
  return {
    list: () => drafts.slice(),
    add(draft) {
      drafts.push(draft);
      return draft;
    },
    remove(id) {
      const index = drafts.findIndex((draft) => draft.id === id);
      if (index < 0) return false;
      drafts.splice(index, 1);
      return true;
    },
    clear() {
      drafts.length = 0;
    },
  };
}
