import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, Candidate, Finding, ScanDetail as ScanDetailT } from "../api";
import { EmptyState, ErrorBanner, Excerpt, SeverityBadge, Spinner, StatusPill } from "../ui";

const STAGE_LABEL: Record<string, string> = {
  start: "Kick-off",
  discovery: "Reading the file tree",
  scan: "Static analysis (Semgrep)",
  persist: "Saving results",
  done: "Finished",
  ai: "AI investigation",
  ai_investigation: "AI investigation",
};

const ASSESSMENT_LABEL: Record<string, { label: string; cls: string }> = {
  confirmed_by_available_evidence: { label: "Confirmed by available evidence", cls: "bad" },
  potential: { label: "Potential issue", cls: "warn" },
  inconclusive: { label: "Inconclusive — needs a human", cls: "plain" },
  false_positive: { label: "Likely false positive", cls: "ok" },
};

const VERIFICATION_LABEL: Record<string, string> = {
  verified: "✅ every citation checked against the real code",
  partially_verified: "⚠️ some citations did not match the code",
  unsupported: "❌ citations could not be verified — treat with caution",
  uninvestigated: "— not investigated",
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
          } catch {
            /* findings endpoint may not exist for old scans */
          }
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

  const problems = detail.events.filter((e) => e.level === "warning" || e.level === "error");
  const byFile = new Map<string, Candidate[]>();
  for (const c of candidates ?? []) {
    const list = byFile.get(c.path) ?? [];
    list.push(c);
    byFile.set(c.path, list);
  }

  // ---- live phase tracker --------------------------------------------------
  const hasDiscovery = detail.events.some((e) => e.stage === "discovery");
  const hasScan = detail.events.some((e) => e.stage === "static_analysis");
  const aiStage = detail.events.find((e) => e.stage === "ai_investigation");
  const wantsAi = Boolean(detail.options?.investigate);
  const terminal = !running;
  const phases: { label: string; state: "done" | "active" | "todo" }[] = [
    { label: "Discover files", state: hasDiscovery ? "done" : running ? "active" : "todo" },
    { label: "Scan code", state: hasScan ? "done" : hasDiscovery ? (running ? "active" : "todo") : "todo" },
    ...(wantsAi
      ? [{
          label: "AI investigation",
          state: aiStage || (terminal && detail.ai_status && detail.ai_status.status !== "running")
            ? "done" as const
            : hasScan ? (running ? "active" as const : "todo" as const) : "todo" as const,
        }]
      : []),
    {
      label: terminal ? "Done" : "Finishing",
      state: terminal ? "done" as const : "todo" as const,
    },
  ];

  return (
    <>
      <p><Link to="/">← Back to overview</Link></p>
      <h1 className="page-title">Audit: {detail.repository}</h1>
      <p className="page-sub row">
        <StatusPill status={detail.status} />
        <span className="muted small">
          {running
            ? (<><span className="pulse-dot" /> running for {elapsed}s</>)
            : detail.duration_ms
              ? `finished in ${fmtDuration(detail.duration_ms)}`
              : null}
        </span>
        <span className="muted small">· {detail.candidates_count} candidates</span>
        {detail.findings_count > 0 && (
          <span className="muted small">· {detail.findings_count} AI findings</span>
        )}
      </p>

      {location.state?.batchNote && (
        <div className="callout info"><b>Batch audit started</b>{location.state.batchNote}</div>
      )}

      {/* ---- live phase tracker ------------------------------------------- */}
      <div className="card">
        <h3>Where is this audit?</h3>
        <div className="phase-rail">
          {phases.map((p, i) => (
            <span key={p.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <span className="phase-arrow">→</span>}
              <span className={`phase ${p.state}`}>
                {p.state === "active" && <Spinner />}
                {p.state === "done" && "✓"}
                {p.label}
              </span>
            </span>
          ))}
        </div>
        {running && (
          <p className="hint" style={{ margin: "8px 0 0" }}>
            This page updates itself automatically — candidates appear the moment
            they are found.
          </p>
        )}
      </div>

      {/* ---- stat strip ---------------------------------------------------- */}
      <div className="stat-strip">
        <div className="card"><div className="big-num">{detail.total_files}</div><div className="stat-label">files discovered</div></div>
        <div className="card"><div className="big-num">{detail.files_scanned}</div><div className="stat-label">files analysed</div></div>
        <div className="card"><div className="big-num">{detail.candidates_count}</div><div className="stat-label">candidates</div></div>
        <div className="card"><div className="big-num">{detail.findings_count}</div><div className="stat-label">AI findings</div></div>
        <div className="card">
          <div className="big-num">{running ? `${elapsed}s` : detail.duration_ms ? fmtDuration(detail.duration_ms) : "—"}</div>
          <div className="stat-label">{running ? "elapsed" : "total time"}</div>
        </div>
      </div>

      {detail.status === "running" && (
        <div className="callout info"><b>Audit in progress</b>First the file inventory is built, then the static scanner runs{wantsAi ? ", then the AI investigator reviews each candidate" : ""}. No need to refresh — this page follows along.</div>
      )}
      {detail.error && <div className="callout bad"><b>The audit stopped with an error</b>{detail.error}</div>}

      <div className="card">
        <h3>What happened step by step</h3>
        <p className="hint">Plain-language timeline of this audit.</p>
        <table className="data">
          <thead><tr><th>Step</th><th>What happened</th><th>When</th></tr></thead>
          <tbody>
            {detail.events.map((e, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{STAGE_LABEL[e.stage] ?? e.stage}</td>
                <td className="small" style={e.level === "error" ? { color: "var(--bad)" } : e.level === "warning" ? { color: "var(--warn)" } : undefined}>
                  {e.message}
                </td>
                <td className="small muted" style={{ whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>What went right &amp; what went wrong in this run</h3>
        <p className="hint">Anything the scanner could not do, or had to skip, is listed here — no silent failures.</p>
        {problems.length === 0 ? (
          <div className="callout" style={{ background: "var(--ok-soft)", borderColor: "#bbe7c8", color: "var(--ok)" }}>
            <b>✅ Nothing went wrong this run</b>
            All stages completed without warnings.
          </div>
        ) : (
          <table className="data">
            <thead><tr><th>Severity</th><th>Problem</th></tr></thead>
            <tbody>
              {problems.map((e, i) => (
                <tr key={i}>
                  <td><span className={`badge ${e.level === "error" ? "bad" : "warn"}`}>{e.level}</span></td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {detail.warnings.length > 0 && detail.warnings.map((w, i) => (
          <p key={i} className="small" style={{ color: "var(--warn)" }}>⚠ {w}</p>
        ))}
        <p className="small muted">
          Also visible to the scanner: {detail.total_files} files in the project, {detail.files_scanned} analysed.
        </p>
      </div>

      <div className="card">
        <h3>🤖 AI investigation — evidence-based verdicts</h3>
        <p className="hint">
          The AI investigator reads the real code around each candidate and returns
          a verdict. <b>Every citation is machine-checked against the file contents</b> —
          verdicts citing code that doesn't exist are downgraded automatically.
        </p>
        {detail.ai_status && detail.ai_status.status === "skipped" ? (
          <div className="callout info">
            <b>AI investigation was skipped</b>
            {String(detail.ai_status.reason ?? "AI provider is not configured.")} — the
            static-analysis candidates below are still valid.
          </div>
        ) : findings === null ? (
          detail.options?.investigate ? (
            <p><Spinner /> Waiting for the AI investigator…</p>
          ) : null
        ) : findings.length === 0 ? (
          detail.options?.investigate ? (
            <div className="callout info">
              <b>No AI findings were produced</b>
              {detail.ai_status && detail.ai_status.error
                ? `Reason: ${String(detail.ai_status.error)}`
                : "The investigator returned no verdicts for this run."}
            </div>
          ) : null
        ) : (
          findings.map((f) => {
            const a = ASSESSMENT_LABEL[f.assessment ?? ""] ?? { label: f.assessment ?? "?", cls: "plain" };
            return (
              <div key={f.id} style={{ marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div className="row spread" style={{ flexWrap: "wrap", gap: 8 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className={`badge ${a.cls}`}>{a.label}</span>
                    {f.severity ? <SeverityBadge severity={f.severity} /> : null}
                    {f.confidence != null ? (
                      <span className="badge plain">confidence {Math.round(f.confidence * 100)}%</span>
                    ) : null}
                  </div>
                  <span className="small muted mono">
                    {f.affected_path}{f.start_line ? `:${f.start_line}` : ""} · {f.provider}/{f.model}
                  </span>
                </div>
                {f.vulnerability_type ? (
                  <p className="small" style={{ margin: "6px 0 0" }}>
                    Type: <b>{f.vulnerability_type.replace(/-/g, " ")}</b>
                  </p>
                ) : null}
                {f.explanation ? <p style={{ margin: "8px 0 0" }}>{f.explanation}</p> : null}
                {f.remediation ? (
                  <p className="small" style={{ margin: "8px 0 0", color: "var(--ok)" }}>
                    <b>Fix:</b> {f.remediation}
                  </p>
                ) : null}
                {f.uncertainty ? (
                  <p className="small muted" style={{ margin: "8px 0 0" }}>
                    <b>Uncertainty:</b> {f.uncertainty}
                  </p>
                ) : null}
                {f.verification_status ? (
                  <p className="small" style={{ margin: "8px 0 0" }}>
                    <b>Evidence check:</b> {VERIFICATION_LABEL[f.verification_status] ?? f.verification_status}
                  </p>
                ) : null}
                {f.thinking && (
                  <details style={{ marginTop: 12 }}>
                    <summary className="small" style={{ cursor: "pointer", color: "var(--muted)" }}>
                      🧠 AI thinking (click to expand)
                    </summary>
                    <pre style={{ 
                      marginTop: 8, 
                      padding: 12, 
                      background: "var(--bg-elevated)", 
                      borderRadius: 6, 
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      overflow: "auto"
                    }}>
                      {f.thinking}
                    </pre>
                  </details>
                )}
                {f.evidence.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {f.evidence.map((ev, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div className="mono small muted">{ev.path}:{ev.start_line}-{ev.end_line}</div>
                        <Excerpt code={ev.excerpt} startLine={ev.start_line} highlight={[ev.start_line, ev.end_line]} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="card">
        <h3>Candidates — things worth a human look</h3>
        <p className="hint">
          These are <b>not</b> confirmed vulnerabilities yet. Each is a pattern the
          scanner recognised; a reviewer (or the AI investigator above) decides
          whether it is exploitable. Click a row to peek at the code.
        </p>
        {candidates === null ? (
          <p><Spinner /> Waiting for the scanner to finish…</p>
        ) : candidates.length === 0 ? (
          <EmptyState icon="🎉" title="No candidates found">
            The scanner found nothing worth flagging in the files it could read.
          </EmptyState>
        ) : (
          Object.entries(Object.fromEntries(byFile)).map(([path, list]) => (
            <div key={path} style={{ marginBottom: 18 }}>
              <div className="mono" style={{ fontWeight: 600, marginBottom: 4 }}>{path}</div>
              <table className="data">
                <thead><tr><th>Line</th><th>Severity</th><th>Type</th><th>Why it looks risky</th><th>Rule</th></tr></thead>
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
                <div style={{ marginTop: 6 }}>
                  <Excerpt code={open.excerpt_redacted ?? ""} startLine={Math.max(1, open.start_line - 3)} highlight={[open.start_line, open.end_line]} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
