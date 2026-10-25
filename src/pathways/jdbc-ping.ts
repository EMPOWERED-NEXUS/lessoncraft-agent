import { loadEnv } from "../env.ts";
import { jdbcConfigured, lightningQuery } from "./zetaris-read.ts";

loadEnv();

function set(name: string): boolean {
  return Boolean((process.env[name] ?? "").trim());
}

const status = {
  source: ".env.local",
  jdbc_url_set: set("ZETARIS_JDBC_URL"),
  jdbc_jar_set: set("ZETARIS_JDBC_JAR"),
  jdbc_user_set: set("ZETARIS_JDBC_USER"),
  jdbc_password_set: set("ZETARIS_JDBC_PASSWORD"),
  configured: jdbcConfigured(),
};

if (!status.configured) {
  console.log(JSON.stringify({ ...status, select1: "skipped" }));
  process.exit(2);
}

try {
  const table = await lightningQuery("SELECT 1");
  console.log(JSON.stringify({
    ...status,
    select1: "ok",
    rowCount: table.rowCount,
    columnCount: table.columns.length,
  }));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify({ ...status, select1: "failed", error: message.slice(0, 400) }));
  process.exit(1);
}
