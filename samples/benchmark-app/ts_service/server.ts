/**
 * Small TypeScript service (benchmark fixture).
 * Unsafe endpoints are intentionally interleaved with safe endpoints.
 */

import express, { Request, Response } from "express";
import { exec } from "child_process";
import { readFileSync } from "fs";
import { db } from "./fake-db";

const app = express();
app.use(express.json());

// VULNERABLE: hardcoded credential in source
const SERVICE_API_KEY = "sk_demo_hardcoded_api_key_2f8d91b7";

function runJob(command: string, callback: (err: Error | null, out: string) => void): void {
  exec(command, { timeout: 5000 }, (err, stdout) => callback(err, stdout));
}

app.get("/search", (req: Request, res: Response) => {
  // VULNERABLE: request data concatenated into SQL
  const q = String(req.query.q ?? "");
  const sql = "SELECT id, title FROM items WHERE title LIKE '%" + q + "%'";
  void db.query(sql);
  res.json([]);
});

app.get("/search-safe", (req: Request, res: Response) => {
  // SAFE: parameterised query (placeholder-bound)
  const q = String(req.query.q ?? "");
  const sql = "SELECT id, title FROM items WHERE title LIKE ?";
  void db.query(sql, ["%" + q + "%"]);
  res.json({ ok: true });
});

app.post("/run", (req: Request, res: Response) => {
  // VULNERABLE: request-controlled input passed to shell exec
  const target = String(req.body?.target ?? "/tmp/data");
  runJob("wc -l " + target, (err, out) => {
    if (err) res.status(500).json({ error: String(err) });
    else res.json({ output: out });
  });
});

app.post("/run-safe", (req: Request, res: Response) => {
  // SAFE: argument list instead of a shell string
  const target = String(req.body?.target ?? "/tmp/data");
  const { execFile } = require("child_process");
  execFile("wc", ["-l", target], { timeout: 5000 }, (err: Error | null, out: string) => {
    if (err) res.status(500).json({ error: String(err) });
    else res.json({ output: out });
  });
});

app.get("/health", (_req: Request, res: Response) => {
  // SAFE: constant response, no user input used
  res.json({ ok: true });
});

app.get("/go", (req: Request, res: Response) => {
  // VULNERABLE: user-controlled path goes straight into redirect
  const target = String(req.query.target ?? "home");
  res.redirect(`/${target}`);
});

app.get("/go-safe", (req: Request, res: Response) => {
  // SAFE: allowlisted redirect targets only — analysis-visible constants
  const want = String(req.query.target ?? "home");
  const target = want === "home" ? "/" : want === "help" ? "/help" : "/help";
  res.redirect(target);
});

app.get("/report", (req: Request, res: Response) => {
  // VULNERABLE: request-controlled path read straight from the disk
  const name = String(req.query.name ?? "");
  res.send(readFileSync(`/var/reports/${name}`, "utf8"));
});

app.get("/report-safe", (req: Request, res: Response) => {
  // SAFE: analysis-visible allowlist — the request never reaches the fs path
  const want = String(req.query.key ?? "");
  const path = want === "weekly" ? "/var/reports/weekly.txt" : "/var/reports/daily.txt";
  res.send(readFileSync(path, "utf8"));
});

app.listen(8081);
