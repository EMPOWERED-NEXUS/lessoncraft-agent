import { applyLanguage, getLang, setLang, t as translate } from "./i18n.js";
import { MODEL_TASKS, spatialViewFor } from "./capabilities.js";
import { createDraftStore, submitContribution } from "./contribute.js";
import { extractBuffer, MAX_FILE_BYTES } from "./extract.js";
import { assessUse, createSessionMaterials, lessonPreview, textForLesson, UNREAD_FILE_STATUSES } from "./materials.js";
import { PARSER_REGISTRY } from "./parsers.js";
import { tourStore } from "./tour.js";

const state = {
  catalog: null,
  run: null,
  practiceChoice: "b",
  transferChoice: "b",
  savedMemory: null,
  lang: "en",
  materials: createSessionMaterials(),
  drafts: createDraftStore(),
  view: "learn",
  file: null,
  extraction: { status: "idle", text: "", messageKey: "extract_idle" },
  materialStatusKey: "",
};
const tours = tourStore(localStorage);

function t(key, vars) {
  return translate(state.lang, key, vars);
}

const $ = (id) => document.getElementById(id);

function presetLabel(preset) {
  const key = `preset_${preset.id}`;
  const translated = t(key);
  return translated === key ? preset.label : translated;
}

function renderPresets() {
  if (!state.catalog) return;
  $("presets").replaceChildren();
  for (const preset of state.catalog.presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = presetLabel(preset);
    button.addEventListener("click", () => applyPreset(preset));
    $("presets").appendChild(button);
  }
}

async function loadCatalog() {
  const response = await fetch("/api/pathways/catalog");
  const catalog = await response.json();
  state.catalog = catalog;
  $("goal").textContent = catalog.title;
  paintDisclaimer();
  renderPresets();
  $("quiz").replaceChildren();
  for (const item of catalog.quiz) {
    const field = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = item.prompt;
    field.appendChild(legend);
    for (const option of item.options) {
      const label = document.createElement("label");
      label.className = "option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = item.id;
      input.value = option.id;
      label.append(input, ` ${option.id}) ${option.text}`);
      field.appendChild(label);
    }
    $("quiz").appendChild(field);
  }
}

function applyPreset(preset) {
  $("learner").value = preset.learnerId;
  $("country").value = preset.countryCode;
  $("language").value = preset.languageCode;
  $("sample").value = preset.workSample || "";
  $("cert").checked = Boolean(preset.certificate?.shared);
  for (const item of state.catalog.quiz) {
    for (const input of document.querySelectorAll(`input[name="${item.id}"]`)) {
      input.checked = preset.quizAnswers?.[item.id] === input.value;
    }
  }
  $("status").textContent = t("preset_filled", { label: presetLabel(preset) });
}

function quizAnswers() {
  const answers = {};
  let any = false;
  for (const item of state.catalog.quiz) {
    const selected = document.querySelector(`input[name="${item.id}"]:checked`);
    if (selected) {
      answers[item.id] = selected.value;
      any = true;
    }
  }
  return any ? answers : null;
}

function countryCode() {
  if ($("country").value === "custom") return $("country-custom").value.trim().toUpperCase();
  return $("country").value.trim().toUpperCase();
}

function payload() {
  const note = $("sample").value.trim();
  const attached = lessonPreview(state.materials.list());
  const workSample = [note, attached].filter(Boolean).join("\n").slice(0, 500);
  return {
    learnerId: $("learner").value.trim(),
    countryCode: countryCode(),
    languageCode: $("language").value,
    quizAnswers: quizAnswers(),
    workSample,
    certificate: $("cert").checked
      ? {
          shared: true,
          title: "Job-ready badge",
          claimedCompetencyIds: ["job-ready"],
          sourceId: "src-unapproved-badge",
        }
      : null,
    nvidiaConsent: $("nvidia-consent").checked,
  };
}

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showRun(run) {
  state.run = run;
  $("next-wait")?.classList.add("hidden");
  $("result").classList.remove("hidden");
  $("origin").textContent = originText(run);
  renderNvidia(run);
  $("repairs").textContent = run.repairs?.length
    ? t(run.verificationOk ? "correction_plain" : "correction_plain_bad")
    : t("draft_plain");
  if (run.decision === "propose" && run.proposal) {
    $("why").textContent = run.proposal.why;
    $("uncertain").textContent = run.proposal.uncertain;
    $("action").textContent = run.editedText || run.proposal.next_action;
    $("edit").value = run.editedText || run.proposal.next_action;
    $("edit-wrap").classList.remove("hidden");
    $("review-row").classList.remove("hidden");
  } else if (run.decision === "ask" && run.question) {
    $("why").textContent = run.question;
    $("uncertain").textContent = t("uncertain_ask");
    $("action").textContent = run.editedText || run.question;
    $("edit").value = run.editedText || run.question;
    $("edit-wrap").classList.remove("hidden");
    $("review-row").classList.remove("hidden");
  } else {
    $("why").textContent = run.question || run.abstainReason || run.escalation || t("no_recommendation");
    $("uncertain").textContent = run.escalation || run.abstainReason || t("not_enough");
    $("action").textContent = run.question || t("no_step");
    $("edit-wrap").classList.add("hidden");
    $("review-row").classList.toggle("hidden", run.decision !== "propose");
  }
  showCheck(run);
  $("claims").replaceChildren();
  for (const claim of run.claims.filter((item) => !item.rejected)) {
    const li = document.createElement("li");
    li.className = `state-${claim.state}`;
    const statement = state.catalog?.competencies?.find((item) => item.id === claim.competency_id)?.statement || claim.competency_id;
    const label = t(`state_${claim.state}`);
    const help = t(`state_help_${claim.state}`);
    li.textContent = `${statement} — ${label}. ${help} ${claim.rationale}`;
    $("claims").appendChild(li);
  }
  for (const claim of run.claims.filter((item) => item.rejected)) {
    const li = document.createElement("li");
    li.className = "state-needs_more_evidence";
    li.textContent = `${t("unsupported")} (${claim.competency_id}). ${claim.rationale}`;
    $("claims").appendChild(li);
  }
  renderSources($("sources"), run.citedSources);
  renderSources($("context-sources"), run.contextSources);
  renderTrace(run);
  renderMemory(run);
  const ready = run.reviewStatus === "accepted" || run.reviewStatus === "edited";
  $("practice").classList.toggle("hidden", !(ready && run.decision === "propose"));
  if (ready && run.decision === "propose") fillActivity("practice", run.practice);
  if (run.practiceResult) {
    $("practice-result").textContent = run.practiceResult.label;
    $("transfer").classList.remove("hidden");
    fillActivity("transfer", run.transfer);
  }
  if (run.transferResult) $("transfer-result").textContent = run.transferResult.label;
  const finished = Boolean(run.transferResult);
  $("contribute")?.classList.toggle("hidden", !finished);
  if (finished && $("contrib-preview") && !$("contrib-preview").dataset.touched) {
    $("contrib-preview").value = run.editedText || run.proposal?.next_action || "";
  }
  paintRailFromState();
}

function renderSources(list, sources) {
  list.replaceChildren();
  if (!sources?.length) {
    const li = document.createElement("li");
    li.textContent = t("none");
    list.appendChild(li);
    return;
  }
  for (const source of sources) {
    const li = document.createElement("li");
    const link = source.source_url ? ` ${source.source_url}` : "";
    const section = source.page_or_section || "n/a";
    li.textContent = `${source.source_title} — ${source.source_owner}. ${source.licence_or_permission} ${source.attribution} ${t("section_label")} ${section}.${link}`;
    list.appendChild(li);
  }
}

function showCheck(run) {
  if (run.decision === "propose" && run.practice?.closed?.prompt) {
    $("check").textContent = t("check_propose", { prompt: run.practice.closed.prompt });
    return;
  }
  $("check").textContent = run.decision === "ask" ? t("check_ask") : t("check_none");
}

function originText(run) {
  const passage = run.supportingPassages?.[0];
  if (passage?.passage_text) {
    return t("origin_passage", {
      title: passage.source_title,
      section: passage.section_locator,
      licence: passage.licence,
    });
  }
  if (/NEXUS_PATHWAYS/i.test(run.zetarisNote || "")) return t("origin_no_db");
  return t("origin_fixture");
}

function modelTrace(run) {
  if (run.nvidia?.called && run.nvidia.fallback) return t("trace_model_nvidia_fallback");
  if (run.nvidia?.called) return t("trace_model_nvidia");
  const value = String(run.modelMode || "");
  if (value.startsWith("deterministic")) return t("trace_model_local");
  if (value === "foundation-model-unused") return t("trace_model_unused");
  return t("trace_model_other");
}

function renderNvidia(run) {
  const panel = $("nvidia-panel");
  const draftBox = $("nvidia-draft");
  const report = run.nvidia;
  if (!panel || !draftBox) return;
  if (!report || report.reason === "no_consent") {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  if (report.draft && !report.fallback) {
    const draft = report.draft;
    const passage = (run.supportingPassages || []).find((item) => item.passage_id === draft.passageId);
    $("nvidia-status").textContent = t("nvidia_used", { model: report.model || "" });
    draftBox.classList.remove("hidden");
    $("nvidia-source").textContent = t("nvidia_source", {
      title: passage?.source_title || "",
      section: passage?.section_locator || "",
      id: draft.passageId,
    });
    $("nvidia-quote").textContent = draft.evidenceQuote;
    $("nvidia-explanation").textContent = draft.explanation;
    $("nvidia-example").textContent = draft.example;
    $("nvidia-follow").textContent = draft.followUp;
    return;
  }
  draftBox.classList.add("hidden");
  $("nvidia-status").textContent = t(nvidiaStatusKey(report.reason));
}

function nvidiaStatusKey(reason) {
  const known = {
    no_answer: "nvidia_no_answer",
    no_passage: "nvidia_no_passage",
    not_configured: "nvidia_not_configured",
    timeout: "nvidia_timeout",
    api_error: "nvidia_api_error",
    invalid_structure: "nvidia_invalid",
    verification_failed: "nvidia_rejected",
  };
  return known[reason] || "nvidia_fallback";
}

function nvidiaTraceLine(report) {
  if (!report?.called) {
    if (report?.reason === "no_answer") return t("nvidia_no_answer");
    if (report?.reason === "no_passage") return t("nvidia_no_passage");
    if (report?.reason === "not_configured") return t("nvidia_not_configured");
    return t("nvidia_not_called");
  }
  const line = t(report.fallback ? "nvidia_trace_fallback" : "nvidia_trace_called", {
    model: report.model || "",
    passages: (report.passageIds || []).join(", "),
    verifier: report.verifier,
  });
  if (!report.usage) return line;
  return `${line} ${t("nvidia_trace_tokens", {
    prompt: String(report.usage.promptTokens),
    completion: String(report.usage.completionTokens),
    total: String(report.usage.totalTokens),
  })}`;
}

function renderTrace(run) {
  const passage = run.supportingPassages?.[0];
  const lines = [
    [t("trace_role_sources"), passage?.passage_text
      ? t("trace_passage", { id: passage.passage_id, title: passage.source_title, section: passage.section_locator })
      : t("trace_fixture")],
    [t("trace_role_evidence"), t("trace_evidence")],
    [t("trace_role_step"), t(`trace_decision_${run.decision}`)],
    [t("trace_role_check"), run.repairs?.length
      ? t(run.verificationOk ? "correction_plain" : "correction_plain_bad")
      : t("draft_plain")],
    [t("trace_role_result"), t(`trace_outcome_${run.outcome}`)],
    [t("trace_role_memory"), run.priorMemory?.length
      ? t("memory_recall", { lines: run.priorMemory.map(memoryLine).join(" ") })
      : t("memory_empty")],
    [t("trace_role_nvidia"), nvidiaTraceLine(run.nvidia)],
    [t("trace_role_model"), modelTrace(run)],
  ];
  $("trace").replaceChildren();
  for (const [role, text] of lines) {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = role;
    li.append(name, document.createTextNode(` ${text}`));
    $("trace").appendChild(li);
  }
}

function renderMemory(run) {
  const host = $("memory-recall");
  if (!host) return;
  if (Array.isArray(run.priorMemory)) {
    host.textContent = run.priorMemory.length
      ? t("memory_recall", { lines: run.priorMemory.map(memoryLine).join(" ") })
      : t("memory_empty");
    return;
  }
  const saved = state.savedMemory;
  if (!saved || saved.learnerId !== run.learnerId) {
    host.textContent = "";
    return;
  }
  const now = demonstratedNow(run);
  const added = now.filter((id) => !saved.demonstrated.includes(id));
  host.textContent = `Last Meterless save for this id stored ${saved.stored} and retrieved ${saved.retrieved.join(", ") || "none"}. Demonstrated then: ${saved.demonstrated.join(", ") || "none"}. This run lists: ${now.join(", ") || "none"}. ${added.length ? `Newly listed: ${added.join(", ")}.` : "No new competency is listed."} The note you typed was not stored.`;
}

function memoryLine(item) {
  return `Goal ${item.goal}. Demonstrated: ${item.demonstrated.join(", ") || "none"}. Outcome: ${item.outcome}. Feedback: ${item.feedback}.`;
}

function demonstratedNow(run) {
  return (run.claims || [])
    .filter((claim) => claim.state === "demonstrated" && !claim.rejected)
    .map((claim) => claim.competency_id);
}

function fillActivity(prefix, activity) {
  if (!activity) return;
  $(`${prefix}-prompt`).textContent = activity.prompt;
  if ($(`${prefix}-note`)) $(`${prefix}-note`).textContent = activity.note;
  $(`${prefix}-closed-prompt`).textContent = activity.closed.prompt;
  const host = $(`${prefix}-options`);
  host.replaceChildren();
  for (const option of activity.closed.options) {
    const label = document.createElement("label");
    label.className = "option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `${prefix}-closed`;
    input.value = option.id;
    label.append(input, ` ${option.id}) ${option.text}`);
    host.appendChild(label);
  }
  const fill = document.createElement("button");
  fill.type = "button";
  fill.className = "secondary";
  fill.textContent = t("fill_sample");
  fill.addEventListener("click", () => fillSample(prefix));
  host.appendChild(fill);
  const rubric = $(`${prefix}-rubric`);
  rubric.replaceChildren();
  for (const item of activity.open.rubric) {
    const li = document.createElement("li");
    li.textContent = item.description;
    rubric.appendChild(li);
  }
}

function selected(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

$("run").addEventListener("click", async () => {
    if (!/^[A-Za-z]{2}$/.test(countryCode())) {
      $("status").textContent = t("country_error");
      return;
    }
    $("status").textContent = t("checking");
  try {
    showRun(await post("/api/pathways/run", payload()));
    $("status").textContent = t("review_status");
    renderProgress();
    showFormat();
  } catch (error) {
    $("status").textContent = error.message;
  }
});

$("accept").addEventListener("click", async () => {
  showRun(await post("/api/pathways/review", { runId: state.run.runId, action: "accept" }));
});

$("save-edit").addEventListener("click", async () => {
  showRun(await post("/api/pathways/review", { runId: state.run.runId, action: "edit", editedText: $("edit").value }));
});

$("dismiss").addEventListener("click", async () => {
  showRun(await post("/api/pathways/review", { runId: state.run.runId, action: "dismiss" }));
  $("practice").classList.add("hidden");
  $("status").textContent = t("dismissed");
});

$("practice-submit").addEventListener("click", async () => {
  const run = await post("/api/pathways/practice", {
    runId: state.run.runId,
    phase: "practice",
    closedAnswer: selected("practice-closed"),
    openAnswer: $("practice-open").value,
  });
  showRun(run);
});

$("transfer-submit").addEventListener("click", async () => {
  showRun(await post("/api/pathways/practice", {
    runId: state.run.runId,
    phase: "transfer",
    closedAnswer: selected("transfer-closed"),
    openAnswer: $("transfer-open").value,
  }));
});

$("save-memory").addEventListener("click", async () => {
  if (!state.run) {
    $("memory-status").textContent = t("memory_need_run");
    return;
  }
  const result = await post("/api/pathways/memory", {
    runId: state.run.runId,
    consent: $("consent").checked,
    feedback: $("feedback").value,
  });
  showRun(result);
  if (result.memory) {
    state.savedMemory = {
      learnerId: result.learnerId,
      stored: result.memory.stored,
      retrieved: result.memory.retrieved,
      demonstrated: demonstratedNow(result),
    };
    const added = result.memoryDelta?.added?.length
      ? t("memory_added", { ids: result.memoryDelta.added.join(", ") })
      : t("memory_same");
    $("memory-status").textContent = t("memory_saved", {
      stored: result.memory.stored,
      retrieved: result.memory.retrieved.join(", ") || t("none"),
      added,
    });
    renderProgress();
  } else {
    $("memory-status").textContent = t("memory_none");
  }
});

$("reset-memory").addEventListener("click", async () => {
  const result = await post("/api/pathways/memory/reset", { learnerId: $("learner").value.trim() });
  $("memory-status").textContent = result.deleted.length
    ? t("memory_removed", { ids: result.deleted.join(", ") })
    : t("memory_absent");
  renderProgress();
});

const SAMPLES = {
  practice: {
    en: { closed: "b", open: "4 boxes were opened. I do not know the missing items. I will write them down." },
    fr: { closed: "b", open: "4 boites ont ete ouvertes. La liste est inconnue. Je vais ecrire les articles." },
  },
  transfer: {
    en: { closed: "b", open: "3 names are on the morning list. I do not know the start time. I will check the roster." },
    fr: { closed: "b", open: "3 noms sont sur la liste du matin. L'heure est inconnue. Je vais verifier le tableau." },
  },
};

function fillSample(prefix) {
  const sample = SAMPLES[prefix][$("language").value] || SAMPLES[prefix].en;
  const input = document.querySelector(`input[name="${prefix}-closed"][value="${sample.closed}"]`);
  if (input) input.checked = true;
  $(`${prefix}-open`).value = sample.open;
}

function paintDisclaimer() {
  if ($("disclaimer")) $("disclaimer").textContent = t("disclaimer_ui");
}

function setLanguage(lang) {
  state.lang = lang === "fr" ? "fr" : "en";
  setLang(localStorage, state.lang);
  document.documentElement.lang = state.lang;
  applyLanguage(document, state.lang);
  paintDisclaimer();
  paintMaterialChrome();
  renderParsers();
  renderModelTasks();
  $("lang-en").setAttribute("aria-pressed", state.lang === "en" ? "true" : "false");
  $("lang-fr").setAttribute("aria-pressed", state.lang === "fr" ? "true" : "false");
  if (state.run) showRun(state.run);
  renderPresets();
  renderMaterials();
  renderTour();
}

function paintRail(stage) {
  for (const item of document.querySelectorAll(".transform-rail li")) {
    item.classList.toggle("is-current", item.dataset.stage === stage);
  }
}

function paintRailFromState() {
  if (state.view === "materials") return paintRail("bring");
  if (state.view === "progress") return paintRail("next");
  if (state.run?.transferResult) return paintRail("next");
  if (state.run && !$("practice").classList.contains("hidden")) return paintRail("practice");
  if (state.run) return paintRail("next");
  paintRail(state.view === "learn" ? "explore" : "explore");
}

function showView(name) {
  state.view = name;
  for (const panel of document.querySelectorAll("[data-view-panel]")) {
    panel.classList.toggle("hidden", panel.dataset.viewPanel !== name);
  }
  for (const link of document.querySelectorAll("[data-view]")) {
    if (link.dataset.view === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (name === "materials") renderMaterials();
  if (name === "progress") renderProgress();
  paintRailFromState();
}

function renderProgress() {
  const empty = $("progress-empty");
  const summary = $("progress-summary");
  if (!state.run) {
    empty.classList.remove("hidden");
    summary.textContent = "";
    return;
  }
  empty.classList.add("hidden");
  const counts = { demonstrated: 0, needs_more_evidence: 0, unknown: 0 };
  for (const claim of state.run.claims || []) {
    if (!claim.rejected && counts[claim.state] !== undefined) counts[claim.state] += 1;
  }
  summary.textContent = `${t("state_demonstrated")}: ${counts.demonstrated}. ${t("state_needs_more_evidence")}: ${counts.needs_more_evidence}. ${t("state_unknown")}: ${counts.unknown}.`;
}

function showFormat() {
  const format = $("format").value;
  $("format-example").classList.toggle("hidden", format !== "example");
  $("format-visual").classList.toggle("hidden", format !== "visual");
  const example = state.run?.practice?.closed?.options?.[1]?.text || "";
  $("example-body").textContent = example || t("example_wait");
  const target = format === "practice" ? "check" : format === "visual" ? "format-visual" : format === "example" ? "format-example" : "why";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  $(target)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function renderMaterials() {
  const items = state.materials.list();
  const list = $("material-list");
  const empty = $("materials-empty");
  empty.classList.toggle("hidden", items.length > 0);
  list.replaceChildren();
  for (const item of items) {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = item.name;
    const meta = document.createElement("p");
    meta.textContent = `${t("use_lesson")}. ${item.preview}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost";
    remove.textContent = t("delete_item");
    remove.addEventListener("click", () => {
      state.materials.remove(item.id);
      renderMaterials();
    });
    li.append(name, meta, remove);
    list.appendChild(li);
  }
}

function renderParsers() {
  const list = $("parser-list");
  if (!list) return;
  list.replaceChildren();
  for (const parser of PARSER_REGISTRY) {
    const li = document.createElement("li");
    li.className = `parser-${parser.support}`;
    const status = document.createElement("span");
    status.className = "support";
    status.textContent = t(`parser_${parser.support}`);
    const name = document.createElement("span");
    const extra = [parser.limitKey, parser.reasonKey].filter(Boolean).map((key) => t(key)).join(" ");
    name.textContent = extra ? `${t(parser.labelKey)}. ${extra}` : t(parser.labelKey);
    li.append(status, name);
    list.appendChild(li);
  }
}

function renderModelTasks() {
  const list = $("model-tasks");
  if (!list) return;
  list.replaceChildren();
  for (const task of MODEL_TASKS) {
    const li = document.createElement("li");
    li.textContent = `${t(task.labelKey)}: ${t(task.detailKey)}`;
    list.appendChild(li);
  }
  if (spatialViewFor("pw-workplace-status-update") !== null) {
    const li = document.createElement("li");
    li.textContent = t("about_spatial");
    list.appendChild(li);
  }
}

function renderDrafts() {
  const list = $("contrib-list");
  if (!list) return;
  list.replaceChildren();
  for (const draft of state.drafts.list()) {
    const li = document.createElement("li");
    const text = document.createElement("p");
    text.textContent = `${t("contrib_held")}: ${draft.attribution}. ${t("contrib_license_declared")} ${draft.license}. ${draft.preview}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost";
    remove.textContent = t("contrib_delete");
    remove.addEventListener("click", () => {
      state.drafts.remove(draft.id);
      $("contrib-status").textContent = t("contrib_deleted");
      renderDrafts();
    });
    li.append(text, remove);
    list.appendChild(li);
  }
}

function paintMaterialChrome() {
  $("file-meta").textContent = state.file
    ? t("chars", { name: state.file.name, size: formatSize(state.file.size) })
    : t("no_file");
  $("extract-status").textContent = t(state.extraction.messageKey || "extract_idle");
  $("material-status").textContent = state.materialStatusKey ? t(state.materialStatusKey) : "";
}

function resetMaterialForm() {
  state.file = null;
  state.extraction = { status: "idle", text: "", messageKey: "extract_idle" };
  $("material-file").value = "";
  $("material-note").value = "";
  $("material-preview").value = "";
  paintMaterialChrome();
  const lesson = document.querySelector('input[name="material-use"][value="lesson"]');
  if (lesson) lesson.checked = true;
}

let tourStep = 0;
function renderTour() {
  const step = tourStep + 1;
  $("tour-title").textContent = t(`tour_${step}_title`);
  $("tour-body").textContent = t(`tour_${step}_body`);
  $("tour-progress").textContent = t("tour_progress", { n: String(step) });
  $("tour-back").disabled = tourStep === 0;
  $("tour-next").hidden = tourStep === 3;
  $("tour-finish").hidden = tourStep !== 3;
}

function openTour() {
  tourStep = 0;
  renderTour();
  $("tour").showModal();
  $("tour-next").focus();
}

function closeTour(done) {
  if (done) tours.complete();
  $("tour").close();
  $("tour-help").focus();
}

$("lang-en").addEventListener("click", () => setLanguage("en"));
$("lang-fr").addEventListener("click", () => setLanguage("fr"));
$("language").addEventListener("change", () => {
  if (state.run) showRun(state.run);
});
$("country").addEventListener("change", () => {
  $("custom-wrap").classList.toggle("hidden", $("country").value !== "custom");
});
for (const link of document.querySelectorAll("[data-view]")) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const name = link.dataset.view;
    history.replaceState(null, "", `#${name}`);
    showView(name);
  });
}
$("add-material-jump").addEventListener("click", () => {
  history.replaceState(null, "", "#materials");
  showView("materials");
  $("material-note").focus();
});
async function readSelectedFile(file) {
  if (!file) return;
  state.file = { name: file.name, size: file.size };
  if (file.size > MAX_FILE_BYTES) {
    state.extraction = { status: "error", text: "", messageKey: "extract_too_big" };
    $("material-preview").value = "";
    paintMaterialChrome();
    return;
  }
  state.extraction = { status: "reading", text: "", messageKey: "extract_reading" };
  paintMaterialChrome();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await extractBuffer(file.name, bytes);
    state.extraction = result;
    $("material-preview").value = result.text;
  } catch {
    state.extraction = { status: "error", text: "", messageKey: "extract_error" };
    $("material-preview").value = "";
  }
  paintMaterialChrome();
}

$("material-file").addEventListener("change", () => {
  const file = $("material-file").files?.[0];
  if (file) readSelectedFile(file);
});
const dropzone = $("dropzone");
for (const type of ["dragenter", "dragover"]) {
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
}
for (const type of ["dragleave", "drop"]) {
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  });
}
dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) readSelectedFile(file);
});
$("material-preview").addEventListener("input", () => {
  const text = $("material-preview").value;
  if (!text.trim()) return;
  if (UNREAD_FILE_STATUSES.includes(state.extraction.status)) {
    $("extract-status").textContent = t("extract_not_in_lesson");
    return;
  }
  if (state.extraction.status !== "extracted" && state.extraction.status !== "edited") return;
  state.extraction = { ...state.extraction, status: "edited", text, messageKey: "extract_edited" };
  $("extract-status").textContent = t("extract_edited");
});
$("material-clear").addEventListener("click", () => {
  state.materialStatusKey = "";
  resetMaterialForm();
});
$("material-clear-session").addEventListener("click", () => {
  state.materials.clear();
  state.materialStatusKey = "session_cleared";
  resetMaterialForm();
  renderMaterials();
});
$("material-keep").addEventListener("click", () => {
  const purpose = document.querySelector('input[name="material-use"]:checked')?.value || "lesson";
  const decision = textForLesson({
    fileSelected: Boolean(state.file),
    status: state.file ? state.extraction.status : "edited",
    preview: $("material-preview").value,
    note: $("material-note").value,
  });
  const use = assessUse({ purpose, training: false, rights: false, license: "" });
  if (!use.ok || !decision.ok) {
    state.materialStatusKey = !use.ok ? use.errorKey : decision.errorKey;
    paintMaterialChrome();
    return;
  }
  const stored = state.materials.add({
    id: `mat-${Date.now()}`,
    name: state.file?.name || t("note"),
    preview: decision.preview,
    status: state.file && state.extraction.status === "extracted" ? "extracted" : "edited",
    ...use,
  });
  if (!stored.ok) {
    state.materialStatusKey = stored.errorKey;
    paintMaterialChrome();
    return;
  }
  state.materialStatusKey = "kept";
  renderMaterials();
  resetMaterialForm();
});
$("contrib-preview")?.addEventListener("input", () => {
  $("contrib-preview").dataset.touched = "true";
});
$("contrib-submit")?.addEventListener("click", () => {
  const result = submitContribution({
    id: `draft-${Date.now()}`,
    preview: $("contrib-preview").value,
    removedPersonal: $("contrib-redact").checked,
    rights: $("contrib-rights").checked,
    attribution: $("contrib-attribution").value,
    license: $("contrib-license").value,
    training: $("contrib-training").checked,
  });
  $("contrib-status").textContent = result.ok ? t("contrib_saved") : t(result.errorKey);
  if (!result.ok) return;
  state.drafts.add(result.draft);
  renderDrafts();
});
$("contrib-clear")?.addEventListener("click", () => {
  state.drafts.clear();
  $("contrib-status").textContent = t("contrib_cleared");
  renderDrafts();
});
$("tour-help").addEventListener("click", () => {
  tours.reset();
  openTour();
});
$("tour-back").addEventListener("click", () => {
  tourStep = Math.max(0, tourStep - 1);
  renderTour();
});
$("tour-next").addEventListener("click", () => {
  tourStep = Math.min(3, tourStep + 1);
  renderTour();
});
$("tour-skip").addEventListener("click", () => closeTour(true));
$("tour-finish").addEventListener("click", () => closeTour(true));
$("tour").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeTour(true);
});
$("tour").addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const items = [...$("tour").querySelectorAll("button")].filter((button) => !button.hidden && !button.disabled);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

state.lang = getLang(localStorage);
setLanguage(state.lang);
showView((location.hash || "#learn").slice(1) || "learn");
if (!tours.done()) openTour();

loadCatalog().catch((error) => {
  $("disclaimer").textContent = error.message;
});
