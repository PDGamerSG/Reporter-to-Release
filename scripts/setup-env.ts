import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env.local")) {
  console.log(
    ".env.local already exists. Existing configuration was preserved.",
  );
} else {
  const secrets = new Set([
    "SESSION_SECRET",
    "ADMIN_TOKEN",
    "WORKER_TOKEN",
    "GITHUB_WEBHOOK_SECRET",
  ]);
  const configured = readFileSync(".env.example", "utf8")
    .split("\n")
    .map((line) => {
      const key = line.split("=", 1)[0];
      return secrets.has(key)
        ? `${key}=${randomBytes(32).toString("base64url")}`
        : line;
    })
    .join("\n");
  writeFileSync(".env.local", configured, { mode: 0o600, flag: "wx" });
  console.log(
    "Created private .env.local with unique session, owner, worker, and webhook keys.",
  );
  console.log(
    "Add database and GitHub credentials only when enabling live integrations.",
  );
}
