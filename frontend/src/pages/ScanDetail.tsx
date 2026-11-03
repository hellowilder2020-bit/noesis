import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Candidate, ScanDetail as ScanDetailT } from "../api";
import { EmptyState, ErrorBanner, Excerpt, SeverityBadge, Spinner, StatusPill } from "../ui";

const STAGE_LABEL: Record<string, string> = {
  start: "Kick-off",
  discovery: "Reading the file tree",
  scan: "Static analysis (Semgrep)",
  persist: "Saving results",
  done: "Finished",
  ai: "AI investigation",
};

export default function ScanDetail() {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<ScanDetailT | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [open, setOpen] = useState<Candidate | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await api.scan(id);
        if (!cancelled) setDetail(d);
        if (d.status === "completed" || d.status === "failed" || d.status === "interrupted") {
          const c = await api.candidates(id);
          if (!cancelled) setCandidates(c.candidates);
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

  return (
    <>
      <p><Link to="/">← Back to overview</Link></p>
      <h1 className="page-title">Audit: {detail.repository}</h1>
      <p className="page-sub row">
        <StatusPill status={detail.status} />
        <span className="muted small">{detail.candidates_count} candidates found</span>
        {detail.duration_ms ? <span className="muted small">· {Math.round(detail.duration_ms / 1000)}s</span> : null}
      </p>

      {detail.status === "running" && (
        <div className="callout info"><b>Audit in progress</b>Static analysis is running — this usually takes under a minute. The page updates automatically.</div>
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
                <td className={e.level === "error" || e.level === "warning" ? "small" : "small"} style={e.level === "error" ? { color: "var(--bad)" } : e.level === "warning" ? { color: "var(--warn)" } : undefined}>
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
        <h3>Candidates — things worth a human look</h3>
        <p className="hint">
          These are <b>not</b> confirmed vulnerabilities yet. Each is a pattern the
          scanner recognised; a reviewer (or, soon, the AI investigator) decides
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
