import fs from "node:fs";
import path from "node:path";

/** Loads .env.local / .env into process.env without overriding what is already set. */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

/** Demo and test scripts refuse to touch anything that is not a local Supabase. */
export function assertLocalSupabase(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url) && process.env.ALLOW_DEMO_DATA !== "yes-this-is-not-production") {
    console.error(
      `Refusing to run: ${url || "NEXT_PUBLIC_SUPABASE_URL"} is not a local Supabase.\n` +
        "Demo and test data must never be loaded into production.",
    );
    process.exit(1);
  }
}
