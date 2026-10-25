import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { MODEL_TASKS, spatialViewFor } from "../../public/pathways/capabilities.js";
import { createDraftStore, submitContribution } from "../../public/pathways/contribute.js";
import { extractBuffer } from "../../public/pathways/extract.js";
import { STRINGS, getLang, setLang, t } from "../../public/pathways/i18n.js";
import { assessUse, createSessionMaterials, lessonPreview, textForLesson } from "../../public/pathways/materials.js";
import { PARSER_REGISTRY } from "../../public/pathways/parsers.js";
import { TOUR_KEY, tourStore } from "../../public/pathways/tour.js";

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
    assert.equal(png.status, "unavailable");
    assert.equal(png.messageKey, "extract_ocr_unavailable");
    assert.equal(png.text, "");

    const sheet = await extractBuffer("marks.xlsx", new TextEncoder().encode("not a workbook"));
    assert.equal(sheet.status, "later");
    assert.equal(sheet.text, "");
    const video = await extractBuffer("clip.mp4", new TextEncoder().encode("not a video"));
    assert.equal(video.status, "later");
    assert.equal(video.text, "");

    const empty = await extractBuffer("note.txt", new Uint8Array());
    assert.equal(empty.status, "empty");
    assert.equal(empty.messageKey, "extract_empty_file");
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
    assert.deepEqual(readable, ["txt", "md", "docx", "pptx", "pdf"]);
    assert.equal(PARSER_REGISTRY.find((parser) => parser.id === "image")?.support, "unavailable");
    assert.equal(PARSER_REGISTRY.find((parser) => parser.id === "video")?.support, "later");
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
