/**
 * Printed-text OCR runs in a browser worker.
 * The engine, WASM, and language data are loaded from this app.
 * Image bytes are passed only to that worker. They are not uploaded.
 */

export const OCR_ASSET_PATHS = {
  workerPath: "/pathways/ocr/worker.min.js",
  langPath: "/pathways/ocr/lang",
  coreSimd: "/pathways/ocr/tesseract-core-simd-lstm.wasm.js",
  coreBaseline: "/pathways/ocr/tesseract-core-lstm.wasm.js",
};

const TESSERACT_MODULE = "/pathways/ocr/tesseract.esm.min.js";

export function ocrLang(sourceLanguage) {
  if (sourceLanguage === "en") return "eng";
  if (sourceLanguage === "fr") return "fra";
  return "";
}

export function localCorePath() {
  const simd = typeof WebAssembly !== "undefined"
    && WebAssembly.validate(Uint8Array.from([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]));
  return simd ? OCR_ASSET_PATHS.coreSimd : OCR_ASSET_PATHS.coreBaseline;
}

function assertAppAsset(path) {
  if (!String(path || "").startsWith("/pathways/ocr/")) {
    throw new Error("OCR assets must be served by this app");
  }
}

let worker = null;
let workerLang = "";
let progressHandler = () => {};

export async function recognizeImage(file, sourceLanguage, onProgress = () => {}) {
  const lang = ocrLang(sourceLanguage);
  if (!lang) return { status: "selected", text: "", messageKey: "ocr_language_required", ocr: true };
  const corePath = localCorePath();
  for (const path of [OCR_ASSET_PATHS.workerPath, OCR_ASSET_PATHS.langPath, corePath, TESSERACT_MODULE]) {
    assertAppAsset(path);
  }
  progressHandler = onProgress;
  if (!worker || workerLang !== lang) {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    const loaded = await import(TESSERACT_MODULE);
    const Tesseract = loaded.default;
    worker = await Tesseract.createWorker(lang, 1, {
      workerPath: OCR_ASSET_PATHS.workerPath,
      corePath,
      langPath: OCR_ASSET_PATHS.langPath,
      gzip: false,
      cacheMethod: "none",
      workerBlobURL: false,
      logger: (message) => {
        if (typeof message?.progress === "number") progressHandler(Math.round(message.progress * 100));
      },
    });
    workerLang = lang;
  }
  const result = await worker.recognize(file);
  const text = String(result?.data?.text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return { status: "no_text", text: "", messageKey: "ocr_no_text", ocr: true };
  return { status: "extracted", text, messageKey: "ocr_ready", ocr: true };
}

export async function terminateOcr() {
  progressHandler = () => {};
  if (!worker) return;
  await worker.terminate();
  worker = null;
  workerLang = "";
}
