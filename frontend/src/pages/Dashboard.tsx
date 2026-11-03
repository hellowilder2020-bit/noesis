import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Dashboard as DashboardData } from "../api";
import { EmptyState, ErrorBanner, Spinner, Stat, StatusPill } from "../ui";

const SEVERITY_COLORS: Record<string, string> = {
  high: "var(--high)", medium: "var(--medium)", low: "var(--low)", info: "var(--info)",
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch(setError);
  }, []);

  if (error) return <><h1 className="page-title">Security overview</h1><ErrorBanner error={error} /></>;
  if (!data) return <p><Spinner /> Loading your audit overview…</p>;

  const totalCandidates = data.total_candidates;
  const sevEntries = Object.entries(data.severity_counts);
  const totalSev = sevEntries.reduce((a, [k, v]) => a + (k === "info" ? 0 : v), 0) || 1;

  return (
    <>
      <h1 className="page-title">Security overview</h1>
      <p className="page-sub">
        This tool reads code and looks for dangerous patterns. It never runs any of
        the code it examines. Results move left-to-right: the scanner produces{" "}
        <b>candidates</b> (things worth a human look) and later milestones turn
        candidates into confirmed <b>findings</b>.
      </p>

      <div className="grid cols3">
        <Stat label="Audits so far" value={data.total_scans} hint={`${data.scans_completed} completed`} />
        <Stat label="Candidates to review" value={totalCandidates} hint="real hits the scanner flagged" />
        <Stat
          label="Confirmed findings"
          value={data.total_findings}
          hint={data.total_findings === 0 ? "AI investigation arrives in milestone 4" : undefined}
        />
      </div>

      <div className="card">
        <h3>Where the risk clusters</h3>
        <p className="hint">How many candidates fall into each severity level.</p>
        {totalCandidates === 0 ? (
          <EmptyState icon="🌱" title="No audit data yet">
            Start your first audit on the “Audit a project” page.
          </EmptyState>
        ) : (
          <>
            <div className="sevbar">
              {sevEntries.filter(([k]) => k !== "info").map(([k, v]) => (
                <div key={k} title={`${k}: ${v}`} style={{ width: `${(v / totalSev) * 100}%`, background: SEVERITY_COLORS[k] ?? "var(--info)" }} />
              ))}
            </div>
            <div className="sev-legend">
              {sevEntries.map(([k, v]) => (
                <span key={k}><span className="dot" style={{ background: SEVERITY_COLORS[k] ?? "var(--info)" }} />{k}: {v}</span>
              ))}
            </div>
            {Object.keys(data.vuln_type_counts).length > 0 && (
              <p className="small muted" style={{ marginTop: 10 }}>
                Common issue types:{" "}
                {Object.entries(data.vuln_type_counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${t.replace(/-/g, " ")} (${n})`).join(", ")}
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div className="row spread">
          <div>
            <h3>Recent audits</h3>
            <p className="hint" style={{ margin: 0 }}>The newest scans across the approved folder.</p>
          </div>
          <Link to="/scan"><button className="btn-primary">＋ New audit</button></Link>
        </div>
        {data.recent.length === 0 ? (
          <EmptyState icon="📂" title="Nothing scanned yet">
            Pick a project on the “Audit a project” page — the built-in benchmark
            project is a good first try.
          </EmptyState>
        ) : (
          <table className="data">
            <thead>
              <tr><th>Project</th><th>Status</th><th>Candidates</th><th>Findings</th><th>When</th></tr>
            </thead>
            <tbody>
              {data.recent.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => (window.location.href = `/scan/${s.id}`)}>
                  <td style={{ color: "var(--accent)", fontWeight: 600 }}>{s.repository}</td>
                  <td><StatusPill status={s.status} /></td>
                  <td>{s.candidates_count}</td>
                  <td>{s.findings_count}</td>
                  <td className="small muted">{new Date(s.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
