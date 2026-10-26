const en = {
  title: "Learning packs",
  local: "These accounts are a local demo on this computer. They are not a public hosted account service. Pathways still works without an account.",
  account: "Local account",
  email: "Email",
  password: "Password",
  role: "Role",
  teacher: "Teacher",
  learner: "Learner",
  register: "Create local account",
  login: "Sign in",
  logout: "Sign out",
  delete: "Delete this local account",
  teacherPack: "Teacher pack",
  packTitle: "Title",
  subject: "Subject",
  level: "Level",
  language: "Language",
  country: "Country, optional",
  curriculum: "Curriculum, optional",
  create: "Create pack",
  syllabus: "Syllabus or objectives",
  file: "Text file, optional",
  review: "Review and edit objectives, one on each line",
  reviewed: "I reviewed these objectives",
  read: "Read objectives",
  saveObjectives: "Save reviewed objectives",
  question: "Question and source",
  objective: "Objective",
  prompt: "Question",
  ideas: "Ideas to check, separated by commas",
  solution: "Reviewed solution or marking note",
  creator: "Creator or rights holder",
  sourceTitle: "Source title",
  url: "URL, optional",
  license: "License or written permission",
  attribution: "Attribution",
  topic: "Topic",
  excerpt: "Excerpt the tutor may cite",
  classShare: "Share with a class",
  publish: "Publish to the shared library",
  training: "Permit model training",
  saveQuestion: "Save question",
  learnerTitle: "Learner",
  sample: "Use the sample pack",
  pack: "Pack",
  sampleNote: "The sample is original LessonCraft text. It is not an official exam question.",
  query: "Concept or objective",
  nvidia: "Send this question and the approved excerpt to NVIDIA",
  ask: "Ask for help",
  explain: "Explanation",
  answer: "Your answer",
  check: "Check my answer",
  consent: "Store the minimum progress for this account",
  saveProgress: "Save progress",
  reset: "Reset progress",
  savedTitle: "Saved questions",
  signedIn: "Signed in",
  signedOut: "Signed out.",
  saved: "Saved on this computer.",
  notSaved: "Nothing was stored.",
  removed: "Progress for this account was deleted.",
};
const fr = {
  title: "Parcours d’apprentissage",
  local: "Ces comptes sont une démo locale sur cet ordinateur. Ce n’est pas un service de comptes public. Pathways fonctionne encore sans compte.",
  account: "Compte local",
  email: "Adresse courriel",
  password: "Mot de passe",
  role: "Rôle",
  teacher: "Enseignant",
  learner: "Apprenant",
  register: "Créer un compte local",
  login: "Se connecter",
  logout: "Se déconnecter",
  delete: "Supprimer ce compte local",
  teacherPack: "Parcours de l’enseignant",
  packTitle: "Titre",
  subject: "Matière",
  level: "Niveau",
  language: "Langue",
  country: "Pays, facultatif",
  curriculum: "Programme, facultatif",
  create: "Créer le parcours",
  syllabus: "Programme ou objectifs",
  file: "Fichier texte, facultatif",
  review: "Relisez et corrigez les objectifs, un par ligne",
  reviewed: "J’ai relu ces objectifs",
  read: "Lire les objectifs",
  saveObjectives: "Enregistrer les objectifs relus",
  question: "Question et source",
  objective: "Objectif",
  prompt: "Question",
  ideas: "Idées à vérifier, séparées par des virgules",
  solution: "Solution relue ou note de correction",
  creator: "Créateur ou titulaire des droits",
  sourceTitle: "Titre de la source",
  url: "URL, facultative",
  license: "Licence ou permission écrite",
  attribution: "Attribution",
  topic: "Sujet",
  excerpt: "Extrait que le tuteur peut citer",
  classShare: "Partager avec une classe",
  publish: "Publier dans la bibliothèque partagée",
  training: "Autoriser l’entraînement du modèle",
  saveQuestion: "Enregistrer la question",
  learnerTitle: "Apprenant",
  sample: "Utiliser le parcours exemple",
  pack: "Parcours",
  sampleNote: "L’exemple est un texte original de LessonCraft. Ce n’est pas une question d’examen officielle.",
  query: "Concept ou objectif",
  nvidia: "Envoyer cette question et l’extrait approuvé à NVIDIA",
  ask: "Demander de l’aide",
  explain: "Explication",
  answer: "Votre réponse",
  check: "Vérifier ma réponse",
  consent: "Enregistrer le progrès minimum de ce compte",
  saveProgress: "Enregistrer le progrès",
  reset: "Réinitialiser le progrès",
  savedTitle: "Questions enregistrées",
  signedIn: "Connecté",
  signedOut: "Déconnecté.",
  saved: "Enregistré sur cet ordinateur.",
  notSaved: "Rien n’a été enregistré.",
  removed: "Le progrès de ce compte a été supprimé.",
};

const text = { en, fr };
let lang = "en";
const PACK_KEY = "lessoncraft-studio-pack";
const state = {
  user: null,
  csrf: "",
  packId: sessionStorage.getItem(PACK_KEY) || "pack-sample-notice",
  lessonId: "",
};

const $ = (id) => document.getElementById(id);
function say(message) { $("status").textContent = message; }
function t(key) { return text[lang][key]; }

function applyLanguage() {
  document.documentElement.lang = lang;
  $("lang-en").setAttribute("aria-pressed", lang === "en" ? "true" : "false");
  $("lang-fr").setAttribute("aria-pressed", lang === "fr" ? "true" : "false");
  const map = {
    title: "title", local: "local-note", account: "account-title", email: "email-label", password: "password-label",
    role: "role-label", register: "register", login: "login", logout: "logout", delete: "delete-account",
    teacherPack: "teacher-title", create: "create-pack", read: "read-objectives", saveObjectives: "save-objectives",
    question: "question-title", saveQuestion: "save-question", learnerTitle: "learner-title", sample: "use-sample",
    sampleNote: "sample-note", ask: "ask", explain: "explain-title", check: "check", saveProgress: "save-progress",
    reset: "reset-progress", savedTitle: "saved-title",
  };
  for (const [key, id] of Object.entries(map)) $(id).textContent = t(key);
  $("role").options[0].textContent = t("teacher");
  $("role").options[1].textContent = t("learner");
  for (const [key, id] of Object.entries({
    packTitle: "pack-title", subject: "subject", level: "level", language: "language", country: "country",
    curriculum: "curriculum", syllabus: "syllabus", file: "file", review: "objectives", reviewed: "reviewed",
    objective: "objective-id", prompt: "prompt", ideas: "ideas", solution: "solution", creator: "creator",
    sourceTitle: "source-title", url: "source-url", license: "license", attribution: "attribution", topic: "topic",
    excerpt: "excerpt", classShare: "class-share", publish: "publish", training: "training", pack: "pack-id",
    query: "query", nvidia: "nvidia", answer: "answer", consent: "consent",
  })) setFieldLabel(id, t(key));
}

function setFieldLabel(id, value) {
  const field = $(id);
  const label = field.labels?.[0];
  if (!label) return;
  const textNode = [...label.childNodes].find((node) => node.nodeType === 3 && node.textContent.trim());
  if (textNode) textNode.textContent = field.type === "checkbox" ? ` ${value}` : value;
  else if (label.htmlFor) label.textContent = value;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (state.csrf && options.method && options.method !== "GET") headers["x-csrf-token"] = state.csrf;
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showAccount() {
  const signedIn = Boolean(state.user);
  $("logout").classList.toggle("hidden", !signedIn);
  $("delete-account").classList.toggle("hidden", !signedIn);
  $("teacher").classList.toggle("hidden", state.user?.role !== "teacher");
  if (signedIn) say(`${t("signedIn")}: ${state.user.email} (${state.user.role})`);
}

function rememberPack(packId) {
  state.packId = packId || "pack-sample-notice";
  sessionStorage.setItem(PACK_KEY, state.packId);
}

function clearTeacherDraft() {
  $("objectives").value = "";
  $("reviewed").checked = false;
  $("objective-id").replaceChildren();
  $("saved-questions").replaceChildren();
}

function clearSignedInView() {
  state.user = null;
  state.csrf = "";
  state.lessonId = "";
  sessionStorage.removeItem(PACK_KEY);
  clearTeacherDraft();
  $("pack-id").replaceChildren();
  $("explanation").textContent = "";
  $("citation").textContent = "";
  $("hint").textContent = "";
  $("try-prompt").textContent = "";
  $("feedback").textContent = "";
  $("competency").textContent = "";
  $("next-action").textContent = "";
  $("trace").textContent = "";
  $("memory").textContent = "";
  $("teaching").hidden = true;
  $("result").hidden = true;
  $("trace").hidden = true;
  showAccount();
  say(t("signedOut"));
}

async function refreshPacks() {
  if (!state.user) return;
  const data = await api("/api/studio/packs");
  $("pack-id").replaceChildren();
  for (const pack of data.packs) {
    const option = document.createElement("option");
    option.value = pack.id;
    option.textContent = pack.title;
    $("pack-id").append(option);
  }
  const known = [...$("pack-id").options].some((option) => option.value === state.packId);
  if (!known) rememberPack($("pack-id").options[0]?.value || "pack-sample-notice");
  $("pack-id").value = state.packId;
  await loadSavedPack();
}

async function loadSavedPack() {
  if (state.user?.role !== "teacher" || !state.packId || state.packId === "pack-sample-notice") {
    clearTeacherDraft();
    return;
  }
  const data = await api(`/api/studio/packs/${state.packId}`);
  $("objectives").value = data.objectives.map((item) => item.text).join("\n");
  $("reviewed").checked = data.objectives.length > 0 && data.objectives.every((item) => item.reviewed);
  $("objective-id").replaceChildren();
  for (const objective of data.objectives) {
    const option = document.createElement("option");
    option.value = objective.id;
    option.textContent = objective.text;
    $("objective-id").append(option);
  }
  $("saved-questions").replaceChildren();
  for (const question of data.questions) {
    const source = data.sources.find((item) => item.id === question.sourceId);
    const item = document.createElement("li");
    item.textContent = `${question.prompt} — ${source?.title || "Source on file"}. Reviewed solution saved.`;
    $("saved-questions").append(item);
  }
}

$("lang-en").addEventListener("click", () => { lang = "en"; applyLanguage(); });
$("lang-fr").addEventListener("click", () => { lang = "fr"; applyLanguage(); });

$("account-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/api/studio/register", { method: "POST", body: JSON.stringify({ email: $("email").value, password: $("password").value, role: $("role").value }) });
    state.user = data.user;
    state.csrf = data.csrf;
    $("password").value = "";
    showAccount();
    await refreshPacks();
  } catch (error) { say(error.message); }
});

$("login").addEventListener("click", async () => {
  try {
    const data = await api("/api/studio/login", { method: "POST", body: JSON.stringify({ email: $("email").value, password: $("password").value }) });
    state.user = data.user;
    state.csrf = data.csrf;
    $("password").value = "";
    showAccount();
    await refreshPacks();
  } catch (error) { say(error.message); }
});

$("logout").addEventListener("click", async () => {
  try {
    await api("/api/studio/logout", { method: "POST", body: "{}" });
    clearSignedInView();
  } catch (error) { say(error.message); }
});

$("delete-account").addEventListener("click", async () => {
  const password = $("password").value;
  try {
    await api("/api/studio/account/delete", { method: "POST", body: JSON.stringify({ password }) });
    $("password").value = "";
    clearSignedInView();
    say(t("removed"));
  } catch (error) { say(error.message); }
});

$("pack-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/api/studio/packs", { method: "POST", body: JSON.stringify({
      title: $("pack-title").value, subject: $("subject").value, level: $("level").value,
      language: $("language").value, countryCode: $("country").value, curriculum: $("curriculum").value,
    }) });
    rememberPack(data.pack.id);
    await refreshPacks();
    say(t("saved"));
  } catch (error) { say(error.message); }
});

$("read-objectives").addEventListener("click", async () => {
  try {
    const file = $("file").files?.[0];
    let result;
    if (file) {
      const base64 = await fileToBase64(file);
      result = await api(`/api/studio/packs/${state.packId}/objectives/import`, { method: "POST", body: JSON.stringify({ filename: file.name, base64 }) });
      $("extract-note").textContent = result.message || "";
    } else {
      result = await api(`/api/studio/packs/${state.packId}/objectives/propose`, { method: "POST", body: JSON.stringify({ text: $("syllabus").value }) });
      $("extract-note").textContent = result.needsReview ? t("review") : "";
    }
    $("objectives").value = (result.proposals || []).map((item) => item.text).join("\n");
    $("reviewed").checked = false;
  } catch (error) { say(error.message); }
});

$("save-objectives").addEventListener("click", async () => {
  try {
    await api(`/api/studio/packs/${state.packId}/objectives`, { method: "POST", body: JSON.stringify({ objectives: $("objectives").value.split("\n"), reviewed: $("reviewed").checked }) });
    await loadSavedPack();
    say(t("saved"));
  } catch (error) { say(error.message); }
});

$("question-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const source = await api(`/api/studio/packs/${state.packId}/sources`, { method: "POST", body: JSON.stringify({
      creator: $("creator").value, title: $("source-title").value, url: $("source-url").value, license: $("license").value,
      permissionNote: "", attribution: $("attribution").value, subject: $("subject").value, level: $("level").value,
      topic: $("topic").value, language: $("language").value, reviewStatus: "approved", excerpt: $("excerpt").value,
      privateUse: true, classShare: $("class-share").checked, publish: $("publish").checked, training: $("training").checked,
    }) });
    await api(`/api/studio/packs/${state.packId}/questions`, { method: "POST", body: JSON.stringify({
      objectiveId: $("objective-id").value, prompt: $("prompt").value, requiredIdeas: $("ideas").value.split(","),
      solution: $("solution").value,       sourceId: source.source.id, kind: "practice",
    }) });
    await loadSavedPack();
    say(t("saved"));
  } catch (error) { say(error.message); }
});

$("objectives").addEventListener("input", () => { $("reviewed").checked = false; });
$("use-sample").addEventListener("click", () => {
  rememberPack("pack-sample-notice");
  $("pack-id").value = state.packId;
  $("query").value = "Identify the action a short notice asks the reader to take.";
  clearTeacherDraft();
});
$("pack-id").addEventListener("change", async () => {
  rememberPack($("pack-id").value);
  try { await loadSavedPack(); } catch (error) { say(error.message); }
});

$("ask").addEventListener("click", async () => {
  try {
    const data = await api("/api/studio/lesson", { method: "POST", body: JSON.stringify({ packId: state.packId, query: $("query").value, nvidiaConsent: $("nvidia").checked }) });
    state.lessonId = data.id;
    $("explanation").textContent = data.explanation;
    $("citation").textContent = data.citation;
    $("hint").textContent = data.hint;
    $("try-prompt").textContent = data.tryPrompt;
    $("teaching").hidden = false;
    $("trace").hidden = false;
    $("trace").textContent = data.trace.map((step) => `${step.agent}: ${step.action} ${step.result}`).join("\n");
  } catch (error) { say(error.message); }
});

$("check").addEventListener("click", async () => {
  try {
    const data = await api("/api/studio/lesson/answer", { method: "POST", body: JSON.stringify({ lessonId: state.lessonId, answer: $("answer").value }) });
    $("feedback").textContent = data.judgement.feedback;
    $("competency").textContent = data.judgement.competency;
    $("next-action").textContent = data.judgement.nextAction;
    $("result").hidden = false;
    $("trace").textContent += `\n${data.judgement.trace.map((step) => `${step.agent}: ${step.action} ${step.result}`).join("\n")}`;
  } catch (error) { say(error.message); }
});

$("save-progress").addEventListener("click", async () => {
  try {
    const data = await api("/api/studio/progress", { method: "POST", body: JSON.stringify({ lessonId: state.lessonId, consent: $("consent").checked }) });
    $("memory").textContent = data.stored ? t("saved") : t("notSaved");
  } catch (error) { say(error.message); }
});

$("reset-progress").addEventListener("click", async () => {
  try {
    await api("/api/studio/progress/reset", { method: "POST", body: "{}" });
    $("memory").textContent = t("removed");
  } catch (error) { say(error.message); }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

applyLanguage();
api("/api/studio/session").then((data) => {
  if (!data.authenticated) return;
  state.user = data.user;
  state.csrf = data.csrf;
  showAccount();
  return refreshPacks();
}).catch(() => {});
