/**
 * Job helpers for the TS benchmark fixture.
 * Intentional vulnerabilities (+ safe counterparts):
 * - hashPassword  -> password hashed with MD5 (weak crypto)
 * - redirectUser  -> open redirect via user-controlled URL
 * - readReport    -> fs.readFileSync on a request-controlled path
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";

// VULNERABLE: MD5 used on credentials — broken and far too fast.

export function hashPassword(password: string): string {
  return createHash("md5").update(password).digest("hex");
}

// SAFE: application-specific salt + SHA-256, iterated.
const APP_KDF_SALT = "benchmark-app-unused-salt-never-real";

export function hashPasswordSafe(password: string): string {
  let digest = createHash("sha256").update(APP_KDF_SALT + password + APP_KDF_SALT).digest("hex");
  for (let i = 0; i < 1000; i++) {
    digest = createHash("sha256").update(digest).digest("hex");
  }
  return digest;
}

// VULNERABLE: user-controlled URL goes straight into redirect.
export function redirectUser(res: { redirect: (location: string) => void }, want: string): void {
  res.redirect(`/${want}`);
}

// SAFE: only allowlisted destinations can be redirected to.
const REDIRECT_ALLOWLIST: Record<string, string> = {
  home: "/",
  help: "/help",
};

export function redirectUserSafe(res: { redirect: (location: string) => void }, want: string): void {
  const target = REDIRECT_ALLOWLIST[want];
  if (target === undefined) {
    res.redirect("/help");
    return;
  }
  res.redirect(target);
}

// VULNERABLE: request-controlled path read straight from the filesystem.
export function readReport(fileName: string): string {
  return readFileSync(`/var/reports/${fileName}`, "utf8");
}

// SAFE: allowlist mapping so no request segment reaches readFileSync.
const REPORT_FILES: Record<string, string> = {
  daily: "/var/reports/daily.txt",
  weekly: "/var/reports/weekly.txt",
};

export function readReportSafe(reportKey: string): string {
  const path = REPORT_FILES[reportKey];
  if (path === undefined) {
    throw new Error("unknown report");
  }
  return readFileSync(path, "utf8");
}
