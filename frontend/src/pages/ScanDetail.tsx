import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, Candidate, Finding, ScanDetail as ScanDetailT } from "../api";
import { EmptyState, ErrorBanner, Excerpt, SeverityBadge, Spinner } from "../ui";

const STAGE_LABEL: Record<string, string> = {
  start: "Kick-off",
  discovery: "Reading File Tree",
  scan: "Static Analysis",
  persist: "Saving Results",
  done: "Finished",
  ai: "AI Investigation",
  ai_investigation: "AI Investigation",
};

const ASSESSMENT_LABEL: Record<string, { label: string; cls: string }> = {
  confirmed_by_available_evidence: { label: "Confirmed", cls: "bad" },
  potential: { label: "Potential", cls: "warn" },
  inconclusive: { label: "Inconclusive", cls: "plain" },
  false_positive: { label: "False Positive", cls: "ok" },
};

const VERIFICATION_LABEL: Record<string, string> = {
  verified: "✓ Citations Verified",
  partially_verified: "⚠ Partial Verification",
  unsupported: "✗ Citations Unverified",
  uninvestigated: "— Not Investigated",
};

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function ScanDetail() {
  const { id = "" } = useParams();
  const location = useLocation() as { state?: { batchNote?: string } };
  const [detail, setDetail] = useState<ScanDetailT | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [open, setOpen] = useState<Candidate | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [elapsed, setElapsed] = useState(0);

  const running = detail?.status === "running" || detail?.status === "queued";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await api.scan(id);
        if (!cancelled) setDetail(d);
        if (d.status === "completed" || d.status === "failed" || d.status === "interrupted") {
          const c = await api.candidates(id);
          if (!cancelled) setCandidates(c);
          try {
            const f = await api.findings(id);
            if (!cancelled) setFindings(f);
          } catch { /* findings endpoint may not exist for old scans */ }
        } else {
          setTimeout(load, 2000);
        }
      } catch (e) {
        if (!cancelled) setError(e);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <ErrorBanner error={error} />;
  if (!detail) return <p><Spinner /> Loading audit…</p>;

  const byFile = new Map<string, Candidate[]>();
  for (const c of candidates ?? []) {
    const list = byFile.get(c.path) ?? [];
    list.push(c);
    byFile.set(c.path, list);
  }

  const pillColor = (status: string) => {
    if (status === "completed") return "var(--ok)";
    if (status === "failed") return "var(--bad)";
    if (status === "running") return "var(--accent)";
    return "var(--text-soft)";
  };

  return (
    <>
      <div className="row spread" style={{ marginBottom: "var(--space-xl)", flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Audit Detail</h1>
          <p className="page-sub" style={{ margin: 0 }}>{detail.repository}</p>
        </div>
        <div className="row" style={{ gap: "var(--space-md)" }}>
          <span className="status-pill"
            style={{
              borderColor: pillColor(detail.status),
              color: pillColor(detail.status),
            }}
          >
            {detail.status}
          </span>
          <span className="mono small muted">
            {running ? `running ${elapsed}s` : detail.duration_ms ? `finished in ${fmtDuration(detail.duration_ms)}` : "—"}
          </span>
        </div>
      </div>

      {location.state?.batchNote && (
        <div className="tile">
          <span className="badge ok">Batch Audit Started</span>
          <span className="small muted" style={{ marginLeft: "var(--space-md)" }}>{location.state.batchNote}</span>
        </div>
      )}

      <div className="tile-grid">
        {/* Stat tiles */}
        <div className="tile stat accent">
          <div className="big">{detail.total_files}</div>
          <div className="label">Files Discovered</div>
        </div>
        <div className="tile stat warn">
          <div className="big">{detail.files_scanned}</div>
          <div className="label">Files Analyzed</div>
        </div>
        <div className="tile stat ok">
          <div className="big">{detail.candidates_count}</div>
          <div className="label">Candidates</div>
        </div>
        <div className="tile stat info">
          <div className="big">{detail.findings_count}</div>
          <div className="label">AI Findings</div>
        </div>

        {/* Event timeline tile */}
        <div className="tile" style={{ gridColumn: "span 2" }}>
          <h3>Event Timeline</h3>
          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            {detail.events.length === 0 ? (
              <div className="muted small">No events recorded.</div>
            ) : (
              detail.events.map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                  <span
                    style={{ width: "8px", height: "8px", borderRadius: "50%", background: e.level === "error" ? "var(--bad)" : e.level === "warning" ? "var(--warn)" : "var(--ok)", flex: "0 0 auto" }}
                  />
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)", minWidth: "90px" }}>
                    {STAGE_LABEL[e.stage] ?? e.stage}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-soft)", flex: 1 }}>{e.message}</span>
                  <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginLeft: "var(--space-sm)" }}>
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Warnings tile */}
        {detail.warnings.length > 0 && (
          <div className="tile" style={{ gridColumn: "span 2" }}>
            <h3>Warnings</h3>
            {detail.warnings.map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
                <span style={{ color: "var(--warn)", fontSize: 16, flex: "0 0 auto", marginTop: "2px" }}>⚠</span>
                <span style={{ fontSize: "12px", color: "var(--text-soft)", lineHeight: 1.4 }}>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* AI findings tile */}
        <div className="tile" style={{ gridColumn: "span 2" }}>
          <h3>AI Findings</h3>
          {findings === null ? (
            <p><Spinner /> Loading findings…</p>
          ) : findings.length === 0 ? (
            <div className="muted small">No AI findings produced.</div>
          ) : (
            <div style={{ maxHeight: "400px", overflowY: "auto" }}>
              {findings.map((f) => {
                const a = ASSESSMENT_LABEL[f.assessment ?? ""] ?? { label: f.assessment ?? "?", cls: "plain" };
                return (
                  <div key={f.id} style={{ marginBottom: "var(--space-lg)", paddingBottom: "var(--space-lg)", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}>
                      <span className={`badge ${a.cls}`}>{a.label}</span>
                      {f.severity ? <SeverityBadge severity={f.severity} /> : null}
                      <span style={{ fontSize: "11px", color: "var(--text-soft)" }}>{Math.round((f.confidence ?? 0) * 100)}% confidence</span>
                    </div>
                    <div className="mono small muted">{f.affected_path}{f.start_line ? `:${f.start_line}` : ""}</div>
                    {f.explanation ? (
                      <p style={{ margin: "var(--space-sm) 0 0", fontSize: "12px", color: "var(--text)", lineHeight: 1.6 }}>{f.explanation}</p>
                    ) : null}
                    {f.remediation ? (
                      <div style={{ marginTop: "var(--space-sm)", padding: "var(--space-md)", background: "rgba(52,211,153,0.08)", borderRadius: "var(--radius-sm)" }}>
                        <span style={{ display: "block", fontSize: "11px", color: "var(--ok)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.06, marginBottom: "var(--space-xs)" }}>Fix</span>
                        <span style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.6 }}>{f.remediation}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Candidates tile */}
        <div className="tile" style={{ gridColumn: "span 2" }}>
          <h3>Candidates — Human Review</h3>
          <p className="muted small" style={{ marginBottom: "var(--space-md)" }}>
            Scanner-recognized patterns. Not yet confirmed vulnerabilities.
          </p>
          {candidates === null ? (
            <p><Spinner /> Loading candidates…</p>
          ) : candidates.length === 0 ? (
            <div className="muted small">No candidates found.</div>
          ) : (
            Object.entries(Object.fromEntries(byFile)).map(([path, list]) => (
              <div key={path} style={{ marginBottom: "var(--space-xl)" }}>
                <div className="mono small muted">{path}</div>
                <table className="data" style={{ marginTop: "var(--space-md)" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "10%" }}>Line</th>
                      <th style={{ width: "16%" }}>Severity</th>
                      <th style={{ width: "20%" }}>Type</th>
                      <th>Message</th>
                      <th style={{ width: "18%" }}>Rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.id} className="clickable" onClick={() => setOpen(open?.id === c.id ? null : c)}>
                        <td className="mono">{c.start_line}</td>
                        <td><SeverityBadge severity={c.severity} /></td>
                        <td className="small">{c.vuln_type?.replace(/-/g, " ")}</td>
                        <td className="small">{c.message}</td>
                        <td className="mono small muted">{c.rule_id.split(".").pop()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {open && list.some((c) => c.id === open.id) && (
                  <div style={{ marginTop: "var(--space-sm)" }}>
                    <Excerpt code={open.excerpt_redacted ?? ""} startLine={Math.max(1, open.start_line - 3)} highlight={[open.start_line, open.end_line]} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

    </>
  );
}