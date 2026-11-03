import React from "react";
import type { Candidate } from "./api";

export function Spinner() {
  return <span className="spinner" />;
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`badge plain status-pill ${status}`}>
      {status === "completed" ? "✅ completed" : status === "running" ? "⏳ running" : status}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`badge ${severity}`}>{severity}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card">
      <div className="big-num">{value}</div>
      <div className="stat-label">{label}</div>
      {hint ? <div className="small muted" style={{ marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div className="icon">{icon}</div>
      <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{title}</div>
      <div className="small">{children}</div>
    </div>
  );
}

export function ErrorBanner({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="callout bad">
      <b>Something went wrong</b>
      {message}
    </div>
  );
}

/** Renders code with the flagged line range highlighted (1-based). */
export function Excerpt({
  code, startLine, highlight,
}: { code: string; startLine: number; highlight?: [number, number] }) {
  const lines = code.split("\n");
  const [lo, hi] = highlight ?? [startLine, startLine];
  return (
    <pre className="code excerpt">
      {lines.map((line, i) => {
        const n = startLine + i;
        const flagged = n >= lo && n <= hi;
        return (
          <div
            key={i}
            style={{
              background: flagged ? "rgba(220,38,38,.28)" : "transparent",
              padding: "0 6px", borderRadius: 4,
            }}
          >
            {String(n).padStart(4, " ")}  {line}
          </div>
        );
      })}
    </pre>
  );
}

export function CandidateRow({ c }: { c: Candidate }) {
  return (
    <tr>
      <td className="cand-file">{c.path}:{c.start_line}</td>
      <td><SeverityBadge severity={c.severity} /></td>
      <td className="small">{c.vuln_type ?? "unknown"}</td>
      <td className="small">{c.message}</td>
      <td className="mono small muted">{c.rule_id}</td>
    </tr>
  );
}
