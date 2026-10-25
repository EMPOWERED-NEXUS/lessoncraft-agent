import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "..");
export const packsDir = path.join(repoRoot, "packs");
export const publicDir = path.join(repoRoot, "public");
export const hmemPersistDir = path.join(repoRoot, ".lessoncraft", "hmem");
