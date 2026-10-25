import { loadEnv } from "./env.ts";
import { diagnoseZetaris } from "./zetaris.ts";

loadEnv();
const result = await diagnoseZetaris();
console.log(JSON.stringify(result, null, 2));
if (result.status === "error") process.exitCode = 1;
