import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { MODEL_TASKS, spatialViewFor } from "../../public/pathways/capabilities.js";
import { createDraftStore, submitContribution } from "../../public/pathways/contribute.js";
import { extractBuffer, MAX_FILE_BYTES } from "../../public/pathways/extract.js";
import { STRINGS, getLang, setLang, t } from "../../public/pathways/i18n.js";
import { assessUse, createSessionMaterials, lessonPreview, materialPhase, pathwayText, textForLesson } from "../../public/pathways/materials.js";
import { localCorePath, OCR_ASSET_PATHS, ocrLang } from "../../public/pathways/ocr.js";
import { PARSER_REGISTRY } from "../../public/pathways/parsers.js";
import { TOUR_KEY, tourStore } from "../../public/pathways/tour.js";
import { PATHWAY_VIEWS, railStage, viewFromHash } from "../../public/pathways/views.js";

type TestFn = (name: string, fn: () => Promise<void> | void) => Promise<void>;

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  };
}

function zipStored(name: string, content: string): Uint8Array {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const data = encoder.encode(content);
  const bytes = new Uint8Array(30 + nameBytes.length + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(8, 0, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, nameBytes.length, true);
  bytes.set(nameBytes, 30);
  bytes.set(data, 30 + nameBytes.length);
  return bytes;
}

export async function pathwayUiTests(test: TestFn): Promise<void> {
  await test("language switch keeps every visible string in both languages", () => {
    const storage = memory();
    assert.equal(getLang(storage), "en");
    setLang(storage, "fr");
    assert.equal(getLang(storage), "fr");
    const english = Object.keys(STRINGS.en).sort();
    const french = Object.keys(STRINGS.fr).sort();
    assert.deepEqual(french, english);
    for (const key of english) {
      assert.ok(STRINGS.fr[key as keyof typeof STRINGS.fr].trim());
      assert.equal(t("fr", key).includes("{"), false);
    }
    assert.match(t("fr", "nav_learn"), /Apprendre/);
    assert.match(t("en", "nav_materials"), /My materials/);
    assert.match(t("fr", "rail_bring"), /Objectif/);
    assert.match(t("en", "setup_notes"), /do not change/);
    assert.match(t("fr", "format_waits"), /ne change pas la décision/);
    assert.match(t("en", "rail_question"), /practice stays closed/);
    assert.match(t("fr", "rail_question"), /pratique reste fermée/);
    assert.match(t("en", "accepted_practice"), /Practice is open/);
    assert.match(t("fr", "accepted_practice"), /pratique est ouverte/);
  });

  await test("navigation stays on known views and the learning rail follows the lesson", () => {
    assert.deepEqual(PATHWAY_VIEWS, ["learn", "materials", "progress", "about"]);
    assert.equal(viewFromHash(""), "learn");
    assert.equal(viewFromHash("#learn"), "learn");
    assert.equal(viewFromHash("#materials"), "materials");
    assert.equal(viewFromHash("#progress"), "progress");
    assert.equal(viewFromHash("#about"), "about");
    assert.equal(viewFromHash("#login"), "learn");
    assert.equal(viewFromHash("#next"), "learn");
    assert.equal(railStage({ view: "learn", hasRun: false, practiceOpen: false }), "bring");
    assert.equal(railStage({ view: "materials", hasRun: false, practiceOpen: false }), "explore");
    assert.equal(railStage({ view: "progress", hasRun: false, practiceOpen: false }), "bring");
    assert.equal(railStage({ view: "about", hasRun: false, practiceOpen: false }), "bring");
    assert.equal(railStage({ view: "learn", hasRun: true, practiceOpen: false }), "next");
    assert.equal(railStage({ view: "learn", hasRun: true, practiceOpen: true }), "practice");

    const html = readFileSync(new URL("../../public/pathways/index.html", import.meta.url), "utf8");
    const app = readFileSync(new URL("../../public/pathways/app.js", import.meta.url), "utf8");
    for (const stage of ["bring", "explore", "next", "practice"]) {
      assert.match(html, new RegExp(`data-rail="${stage}"`));
    }
    assert.ok(html.indexOf('id="advanced"') < html.indexOf('id="context"'));
    assert.ok(html.indexOf('id="language"') < html.indexOf('id="advanced"'));
    assert.match(html, /data-i18n="setup_notes"/);
    assert.match(html, /data-i18n="format_waits"/);
    assert.doesNotMatch(html, /href="\/pathways\/#learn"/);
    assert.match(app, /popstate/);
    assert.match(app, /hashchange/);
    assert.match(app, /function showViewFromLocation\(\)[\s\S]*replaceState/);
    assert.match(app, /stage === "practice"[\s\S]{0,500}rail_need_run/);
    assert.match(app, /rail_question/);
    assert.match(html, /app\.js\?v=20261026d/);
    const css = readFileSync(new URL("../../public/pathways/styles.css", import.meta.url), "utf8");
    assert.match(app, /setLive\("memory-status", "memory_saved"/);
    assert.match(app, /setLive\(\s*"memory-status",\s*result\.deleted\.length \? "memory_removed" : "memory_absent"/);
    assert.match(css, /#view-learn\.hidden\s*\{\s*display:\s*none/);
    assert.match(css, /setup-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(css, /#context-sources li,[\s\S]*overflow-wrap:\s*anywhere/);
    assert.match(app, /\$\("format"\)\.addEventListener\("change"/);
    assert.match(html, /disabled[\s\S]{0,80}use_account/);
    assert.match(html, /contrib-training" type="checkbox" disabled/);
  });

  await test("guided tour remembers only completion", () => {
    const storage = memory();
    const tour = tourStore(storage);
    assert.equal(tour.done(), false);
    tour.complete();
    assert.equal(storage.getItem(TOUR_KEY), "done");
    assert.equal(tour.done(), true);
    tour.reset();
    assert.equal(storage.getItem(TOUR_KEY), null);
    assert.equal(tour.done(), false);
  });

  await test("file selection reports real extraction or an honest unsupported state", async () => {
    const docx = zipStored(
      "word/document.xml",
      "<w:document><w:t>How much of the work is complete?</w:t></w:document>",
    );
    const extracted = await extractBuffer("status.docx", docx);
    assert.equal(extracted.status, "extracted");
    assert.match(extracted.text, /How much of the work is complete/);

    const slides = zipStored("ppt/slides/slide1.xml", "<p:sld><a:t>Name one unknown.</a:t></p:sld>");
    const pptx = await extractBuffer("deck.pptx", slides);
    assert.equal(pptx.status, "extracted");
    assert.match(pptx.text, /Name one unknown/);

    const pdf = await extractBuffer("scan.pdf", new TextEncoder().encode("%PDF-1.4 fake"));
    assert.equal(pdf.status, "no_text");
    assert.equal(pdf.text, "");
    assert.equal(pdf.messageKey, "extract_pdf_no_text");

    const digital = await extractBuffer("note.pdf", pdfWithText("Counted 12 cups"));
    assert.equal(digital.status, "extracted");
    assert.match(digital.text, /Counted 12 cups/);

    const packed = await extractBuffer("note-flate.pdf", pdfFlate("Known fact"));
    assert.equal(packed.status, "extracted");
    assert.match(packed.text, /Known fact/);

    const png = await extractBuffer("page.png", Uint8Array.from([137, 80, 78, 71, 13, 10]));
    assert.equal(png.status, "needs_ocr");
    assert.equal(png.messageKey, "ocr_pending");
    assert.equal(png.text, "");
    const jpeg = await extractBuffer("page.jpeg", Uint8Array.from([255, 216, 255]));
    assert.equal(jpeg.status, "needs_ocr");
    const jpg = await extractBuffer("page.jpg", Uint8Array.from([255, 216, 255]));
    assert.equal(jpg.status, "needs_ocr");
    const hugeImage = await extractBuffer("huge.png", new Uint8Array(MAX_FILE_BYTES + 1));
    assert.equal(hugeImage.status, "error");
    assert.equal(hugeImage.messageKey, "extract_too_big");
    assert.equal(hugeImage.text, "");

    const sheet = await extractBuffer("marks.xlsx", new TextEncoder().encode("not a workbook"));
    assert.equal(sheet.status, "later");
    assert.equal(sheet.text, "");
    const video = await extractBuffer("clip.mp4", new TextEncoder().encode("not a video"));
    assert.equal(video.status, "later");
    assert.equal(video.text, "");

    const empty = await extractBuffer("note.txt", new Uint8Array());
    assert.equal(empty.status, "empty");
    assert.equal(empty.messageKey, "extract_empty_file");

    const txt = await extractBuffer("note.txt", new TextEncoder().encode("  Counted 12 cups  "));
    assert.equal(txt.status, "extracted");
    assert.equal(txt.text, "Counted 12 cups");
    const blank = await extractBuffer("blank.txt", new TextEncoder().encode(" \n\t "));
    assert.equal(blank.status, "empty");
    assert.equal(blank.messageKey, "extract_empty");

    const markdown = await extractBuffer("note.md", new TextEncoder().encode("# Status\n\nThe report is half done."));
    assert.equal(markdown.status, "extracted");
    assert.match(markdown.text, /The report is half done/);
    const markdownAlias = await extractBuffer("note.markdown", new TextEncoder().encode("Plain markdown"));
    assert.equal(markdownAlias.status, "extracted");

    const oversized = await extractBuffer("big.txt", new Uint8Array(MAX_FILE_BYTES + 1));
    assert.equal(oversized.status, "error");
    assert.equal(oversized.messageKey, "extract_too_big");
    assert.equal(oversized.text, "");
    assert.equal(MAX_FILE_BYTES, 8 * 1024 * 1024);
  });

  await test("materials review names each state and sends only reviewed text", () => {
    const html = readFileSync(new URL("../../public/pathways/index.html", import.meta.url), "utf8");
    const app = readFileSync(new URL("../../public/pathways/app.js", import.meta.url), "utf8");
    assert.match(html, /class="material-steps"/);
    for (const step of ["step_add", "step_review", "step_use", "step_remove"]) {
      assert.match(html, new RegExp(`data-i18n="${step}"`));
    }
    assert.match(html, /id="extract-phase"/);
    assert.match(html, /id="material-preview"/);
    assert.match(html, /id="material-keep"/);
    assert.equal(t("en", "keep"), "Use for my lesson");
    assert.equal(t("fr", "keep"), "Utiliser pour ma leçon");
    assert.equal(t("en", "phase_ready"), "Ready to review");
    assert.equal(t("fr", "phase_not_readable"), "Illisible");
    assert.match(html, /disabled[\s\S]{0,80}use_training/);
    assert.equal(materialPhase({ status: "selected", file: true }), "selected");
    assert.equal(materialPhase({ status: "reading", file: true }), "reading");
    assert.equal(materialPhase({ status: "extracted", file: true }), "ready");
    assert.equal(materialPhase({ status: "edited", file: true }), "ready");
    assert.equal(materialPhase({ status: "no_text", file: true }), "not_readable");
    assert.equal(materialPhase({ status: "idle", notice: "removed" }), "removed");
    assert.equal(materialPhase({ status: "idle", note: "My own note" }), "ready");
    assert.match(app, /pathwayText\(\{ sample: \$\("sample"\)\.value, items: state\.materials\.list\(\) \}\)/);
    assert.match(app, /materialPhase\(/);
    assert.match(app, /item_removed/);
    const refused = textForLesson({ fileSelected: true, status: "no_text", preview: "typed over an unread file", note: "note" });
    assert.equal(refused.ok, false);
    const unreviewed = textForLesson({ fileSelected: true, status: "extracted", preview: "Counted 12 cups", note: "", ocr: true, reviewed: false });
    assert.equal(unreviewed.ok, false);
    assert.equal(unreviewed.errorKey, "ocr_review_required");
    const reviewed = textForLesson({ fileSelected: true, status: "edited", preview: "Counted 12 cups", note: "", ocr: true, reviewed: true });
    assert.equal(reviewed.ok, true);
    assert.equal(reviewed.preview, "Counted 12 cups");
    const sample = "Note";
    const long = "A".repeat(600);
    const included = pathwayText({
      sample,
      items: [{ purpose: "lesson", status: "extracted", preview: long }],
    });
    assert.equal(included.limit, 500);
    assert.equal(included.text, `${sample}\n${"A".repeat(500 - sample.length - 1)}`);
    assert.equal(included.count, 500);
    assert.ok(included.omitted > 0);
    assert.equal(ocrLang("en"), "eng");
    assert.equal(ocrLang("fr"), "fra");
    assert.equal(ocrLang("de"), "");
    assert.equal(ocrLang(""), "");
    for (const path of Object.values(OCR_ASSET_PATHS)) {
      assert.match(path, /^\/pathways\/ocr\//);
      assert.equal(path.includes("http"), false);
    }
    assert.match(localCorePath(), /^\/pathways\/ocr\/tesseract-core/);
    const ocrSource = readFileSync(new URL("../../public/pathways/ocr.js", import.meta.url), "utf8");
    assert.equal(ocrSource.includes("cdn.jsdelivr.net"), false);
    assert.match(ocrSource, /gzip: false/);
    assert.match(ocrSource, /cacheMethod: "none"/);
    const worker = readFileSync(new URL("../../public/pathways/ocr/worker.min.js", import.meta.url), "utf8");
    const engine = readFileSync(new URL("../../public/pathways/ocr/tesseract.esm.min.js", import.meta.url), "utf8");
    assert.equal(worker.includes("cdn.jsdelivr.net"), false);
    assert.equal(engine.includes("cdn.jsdelivr.net"), false);
    assert.match(html, /id="material-image"/);
    assert.match(html, /id="material-camera"[^>]*capture="environment"/);
    assert.match(html, /id="ocr-reviewed"/);
    assert.match(html, /id="inclusion-text"/);
    assert.match(html, /id="ocr-source-language"/);
    assert.match(app, /revokeObjectURL/);
    assert.match(app, /ocr-source-language/);
    assert.doesNotMatch(app, /ocr-source-language"\)\.value = state\.lang/);
  });

  await test("consent choices stay session-only and do not train or publish", () => {
    const lesson = assessUse({ purpose: "lesson", training: false, rights: false, license: "" });
    assert.equal(lesson.ok, true);
    assert.equal(lesson.sessionOnly, true);
    assert.equal(lesson.trainingApplied, false);
    assert.equal(lesson.trainingRequested, false);
    assert.equal(lesson.published, false);
    assert.equal(lesson.savedToAccount, false);
    assert.equal(lesson.sendsToExternalModel, false);
    assert.equal(lesson.savedToZetaris, false);
    assert.equal(lesson.savedToMeterless, false);

    const training = assessUse({ purpose: "lesson", training: true, rights: false, license: "" });
    assert.equal(training.ok, false);
    assert.equal(training.errorKey, "use_unavailable");

    const blocked = assessUse({ purpose: "public", training: false, rights: true, license: "CC BY 4.0" });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.errorKey, "use_unavailable");
    assert.equal(blocked.published, false);

    const account = assessUse({ purpose: "account", training: false, rights: false, license: "" });
    assert.equal(account.ok, false);
    assert.equal(account.savedToAccount, false);

    const store = createSessionMaterials();
    const kept = store.add({
      id: "mat-1",
      name: "note",
      preview: "I counted 12 clean cups.",
      status: "edited",
      purpose: "lesson",
      training: false,
      rights: false,
      license: "",
    });
    assert.equal(kept.ok, true);
    assert.equal(lessonPreview(store.list()), "I counted 12 clean cups.");
    store.remove("mat-1");
    assert.equal(store.list().length, 0);

    const unread = textForLesson({ fileSelected: true, status: "later", preview: "not a transcript", note: "I counted cups" });
    assert.equal(unread.ok, false);
    assert.equal(unread.errorKey, "extract_not_in_lesson");
    const unreadKeep = store.add({
      id: "clip",
      name: "clip.mp4",
      preview: "not a transcript",
      status: "later",
      purpose: "lesson",
      training: false,
    });
    assert.equal(unreadKeep.ok, false);
    assert.equal(lessonPreview([{ purpose: "lesson", preview: "not a transcript", status: "unavailable" }]), "");
    assert.equal(lessonPreview([{ purpose: "lesson", preview: "I counted cups", status: "extracted" }]), "I counted cups");
    const noteOnly = textForLesson({ fileSelected: false, status: "idle", preview: "", note: "I counted cups" });
    assert.equal(noteOnly.ok, true);
    assert.equal(noteOnly.preview, "I counted cups");
  });

  await test("parser registry marks only implemented formats as readable", () => {
    const readable = PARSER_REGISTRY.filter((parser) => parser.support === "supported").map((parser) => parser.id);
    assert.deepEqual(readable, ["txt", "md", "docx", "pptx", "pdf", "image"]);
    assert.match(PARSER_REGISTRY.find((parser) => parser.id === "image")?.limitKey || "", /parser_image_limit/);
    assert.equal(PARSER_REGISTRY.find((parser) => parser.id === "video")?.support, "later");
    assert.match(t("en", "parser_image_limit"), /Printed text/);
    assert.match(t("fr", "parser_image_limit"), /imprimé/);
    assert.match(t("en", "ocr_scope"), /handwriting/);
    assert.doesNotMatch(t("en", "ocr_camera_note"), /phone camera capture works/i);
  });

  await test("contribution stays a private draft and training stays off", () => {
    const missing = submitContribution({ preview: "A next step", removedPersonal: false, rights: false, attribution: "", license: "", training: false });
    assert.equal(missing.ok, false);
    assert.equal(missing.published, false);
    const trained = submitContribution({
      preview: "Point to one fact.",
      removedPersonal: true,
      rights: true,
      attribution: "A learner",
      license: "CC BY 4.0",
      training: true,
    });
    assert.equal(trained.ok, false);
    assert.equal(trained.errorKey, "contrib_training_off");
    const draft = submitContribution({
      preview: "Point to one fact.",
      removedPersonal: true,
      rights: true,
      attribution: "A learner",
      license: "CC BY 4.0",
      training: false,
    });
    assert.equal(draft.ok, true);
    assert.equal(draft.draft?.status, "private_draft");
    assert.equal(draft.draft?.published, false);
    assert.equal(draft.draft?.savedToZetaris, false);
    assert.equal(draft.draft?.savedToMeterless, false);
    assert.equal(draft.draft?.training, false);
    assert.equal(draft.draft?.storedIn, "browser-tab-memory");
    assert.equal(draft.draft?.persisted, false);
    assert.equal(draft.draft?.licenseVerified, false);

    const drafts = createDraftStore();
    drafts.add(draft.draft);
    assert.equal(drafts.remove(draft.draft?.id), true);
    assert.equal(drafts.list().length, 0);
    const source = readFileSync(new URL("../../public/pathways/contribute.js", import.meta.url), "utf8");
    const materials = readFileSync(new URL("../../public/pathways/materials.js", import.meta.url), "utf8");
    assert.equal(source.includes("setItem"), false);
    assert.equal(source.includes("getItem"), false);
    assert.equal(materials.includes("setItem"), false);
    assert.equal(materials.includes("getItem"), false);
  });

  await test("model and spatial capabilities stay unconfigured for this pathway", () => {
    assert.equal(MODEL_TASKS.every((task) => task.configured === false), true);
    assert.equal(spatialViewFor("pw-workplace-status-update"), null);
    const page = readFileSync(new URL("../../public/pathways/index.html", import.meta.url), "utf8");
    assert.equal(page.includes("<canvas"), false);
    assert.equal(/hackathon/i.test(page), false);
  });
}

function pdfWithText(text: string): Uint8Array {
  const stream = `BT (${text}) Tj ET`;
  const body = `%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`;
  return new TextEncoder().encode(body);
}

function pdfFlate(text: string): Uint8Array {
  const compressed = deflateSync(Buffer.from(`BT (${text}) Tj ET`));
  const header = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`);
  const footer = Buffer.from("\nendstream\nendobj\n%%EOF");
  return new Uint8Array(Buffer.concat([header, compressed, footer]));
}
