/**
 * Parser registry. A format is usable only when support is "supported"
 * and extractBuffer returns text that was actually read.
 */

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export const PARSER_REGISTRY = [
  { id: "txt", extensions: [".txt"], support: "supported", labelKey: "parser_txt" },
  { id: "md", extensions: [".md", ".markdown"], support: "supported", labelKey: "parser_md" },
  { id: "docx", extensions: [".docx"], support: "supported", labelKey: "parser_docx" },
  { id: "pptx", extensions: [".pptx"], support: "supported", labelKey: "parser_pptx" },
  { id: "pdf", extensions: [".pdf"], support: "supported", labelKey: "parser_pdf", limitKey: "parser_pdf_limit" },
  { id: "image", extensions: [".jpg", ".jpeg", ".png"], support: "unavailable", labelKey: "parser_image", reasonKey: "parser_ocr_off" },
  { id: "sheet", extensions: [".csv", ".xlsx"], support: "later", labelKey: "parser_sheet", reasonKey: "parser_later_reason" },
  { id: "audio", extensions: [".mp3", ".wav", ".m4a"], support: "later", labelKey: "parser_audio", reasonKey: "parser_later_reason" },
  { id: "video", extensions: [".mp4", ".webm"], support: "later", labelKey: "parser_video", reasonKey: "parser_later_reason" },
];

export function parserForName(filename) {
  const name = String(filename || "").toLowerCase();
  return PARSER_REGISTRY.find((parser) => parser.extensions.some((ext) => name.endsWith(ext))) || null;
}

export async function extractBuffer(filename, bytes) {
  if (!bytes || bytes.length === 0) {
    return { status: "empty", text: "", messageKey: "extract_empty_file" };
  }
  if (bytes.length > MAX_FILE_BYTES) {
    return { status: "error", text: "", messageKey: "extract_too_big" };
  }
  const parser = parserForName(filename);
  if (!parser) return { status: "unsupported", text: "", messageKey: "extract_unsupported" };
  if (parser.support === "unavailable") {
    return { status: "unavailable", text: "", messageKey: "extract_ocr_unavailable" };
  }
  if (parser.support === "later") {
    return { status: "later", text: "", messageKey: "extract_later" };
  }
  if (parser.id === "txt" || parser.id === "md") return readPlain(bytes);
  if (parser.id === "docx") return extractZipText(bytes, (entry) => entry === "word/document.xml", /<w:t[^>]*>([^<]*)<\/w:t>/g);
  if (parser.id === "pptx") return extractZipText(bytes, (entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry), /<a:t[^>]*>([^<]*)<\/a:t>/g);
  if (parser.id === "pdf") return extractPdf(bytes);
  return { status: "unsupported", text: "", messageKey: "extract_unsupported" };
}

function readPlain(bytes) {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "").trim();
  return text
    ? { status: "extracted", text, messageKey: "extract_ok" }
    : { status: "empty", text: "", messageKey: "extract_empty" };
}

async function extractZipText(bytes, include, pattern) {
  let files;
  try {
    files = await unzip(bytes);
  } catch {
    return { status: "error", text: "", messageKey: "extract_error" };
  }
  const parts = [];
  for (const file of files) {
    if (!include(file.name)) continue;
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(file.content);
    for (const match of xml.matchAll(pattern)) {
      const text = decodeXml(match[1] || "").trim();
      if (text) parts.push(text);
    }
  }
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text
    ? { status: "extracted", text, messageKey: "extract_ok" }
    : { status: "empty", text: "", messageKey: "extract_empty" };
}

async function extractPdf(bytes) {
  const raw = latin1(bytes);
  if (!raw.startsWith("%PDF-")) return { status: "error", text: "", messageKey: "extract_error" };
  const parts = [];
  const marker = /stream\r?\n/g;
  let match;
  while ((match = marker.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const dictStart = raw.lastIndexOf("<<", match.index);
    const dict = dictStart >= 0 ? raw.slice(dictStart, match.index) : "";
    if (/DCTDecode|JPXDecode|JBIG2Decode|CCITTFaxDecode/.test(dict)) continue;
    let slice = raw.slice(start, end);
    let content = slice;
    if (/FlateDecode/.test(dict)) {
      const inflated = await inflatePdf(slice);
      if (!inflated) continue;
      content = inflated;
    }
    const text = readPdfText(content);
    if (text) parts.push(text);
  }
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text
    ? { status: "extracted", text, messageKey: "extract_ok" }
    : { status: "no_text", text: "", messageKey: "extract_pdf_no_text" };
}

function readPdfText(content) {
  const bits = [];
  const shown = /(?:\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>)(?=\s*(?:Tj|'|"))/g;
  for (const match of content.matchAll(shown)) {
    const text = match[1] !== undefined ? unescapePdf(match[1]) : decodeHex(match[2] || "");
    if (text.trim()) bits.push(text.trim());
  }
  const arrays = /\[([\s\S]*?)\]\s*TJ/g;
  for (const match of content.matchAll(arrays)) {
    const inner = match[1];
    for (const piece of inner.matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/g)) {
      const text = piece[1] !== undefined ? unescapePdf(piece[1]) : decodeHex(piece[2] || "");
      if (text.trim()) bits.push(text.trim());
    }
  }
  return bits.join(" ");
}

function unescapePdf(body) {
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== "\\") {
      out += body[i];
      continue;
    }
    const next = body[i + 1];
    i += 1;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "(" || next === ")" || next === "\\") out += next;
    else if (next >= "0" && next <= "7") {
      let oct = next;
      while (oct.length < 3 && body[i + 1] >= "0" && body[i + 1] <= "7") {
        i += 1;
        oct += body[i];
      }
      out += String.fromCharCode(parseInt(oct, 8));
    } else if (next) out += next;
  }
  return out;
}

function decodeHex(value) {
  const hex = value.replace(/\s+/g, "");
  if (hex.length < 2) return "";
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

async function inflatePdf(slice) {
  const attempts = [slice];
  if (slice.endsWith("\r\n")) attempts.push(slice.slice(0, -2));
  else if (slice.endsWith("\n") || slice.endsWith("\r")) attempts.push(slice.slice(0, -1));
  for (const candidate of attempts) {
    try {
      const inflated = await inflateZlib(toBytes(candidate));
      return latin1(inflated);
    } catch {
      /* try the next cut */
    }
  }
  return "";
}

async function inflateZlib(data) {
  if (globalThis.process?.versions?.node) {
    const { inflateSync } = await import("node:zlib");
    return new Uint8Array(inflateSync(data));
  }
  if (typeof DecompressionStream !== "function") throw new Error("Deflate is not available.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function latin1(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function toBytes(value) {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

export async function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) break;
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    if (flags & 0x08) throw new Error("Zip data descriptor is not supported.");
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let content = compressed;
    if (method === 8) content = await inflateRaw(compressed);
    else if (method !== 0) throw new Error("Zip method is not supported.");
    files.push({ name, content });
    offset = dataStart + compressedSize;
  }
  return files;
}

async function inflateRaw(data) {
  if (globalThis.process?.versions?.node) {
    const { inflateRawSync } = await import("node:zlib");
    return new Uint8Array(inflateRawSync(data));
  }
  if (typeof DecompressionStream !== "function") throw new Error("Deflate is not available.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
