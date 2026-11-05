import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Dashboard as DashboardData } from "../api";
import { EmptyState, ErrorBanner, Spinner } from "../ui";

const SEVERITY_COLORS: Record<string, string> = {
  high: "var(--bad)", medium: "var(--warn)", low: "var(--ok)", info: "var(--info)",
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch(setError);
  }, []);

  if (error) return <><h1 className="page-title">Security Overview</h1><ErrorBanner error={error} /></>;
  if (!data) return <p><Spinner /> Loading your audit overview…</p>;

  const totalCandidates = data.total_candidates;
  const sevEntries = Object.entries(data.severity_counts);
  const totalSev = sevEntries.reduce((a, [k, v]) => a + (k === "info" ? 0 : v), 0) || 1;

  const pillColor = (status: string) => {
    if (status === "completed") return "var(--ok)";
    if (status === "failed") return "var(--bad)";
    if (status === "running") return "var(--accent)";
    return "var(--text-soft)";
  };

  return (
    <>
      <h1 className="page-title">Security Overview</h1>
      <p className="page-sub"></p>

      {/* Stat cards — spacious, glass */}
      <div className="tile-grid">
        <div className="tile stat accent">
          <div className="big">{data.total_scans}</div>
          <div className="label">Total Audits</div>
        </div>
        <div className="tile stat warn">
          <div className="big">{totalCandidates}</div>
          <div className="label">Candidates to Review</div>
        </div>
        <div className="tile stat ok">
          <div className="big">{data.total_findings}</div>
          <div className="label">Findings Confirmed</div>
        </div>
        <div className="tile stat info">
          <div className="big">{data.scans_completed}</div>
          <div className="label">Audits Completed</div>
        </div>
      </div>

      {/* Severity distribution tile */}
      <div className="tile">
        <h3>Severity Distribution</h3>
        <div style={{ marginBottom: "14px" }}>
          {sevEntries.filter(([k]) => k !== "info").map(([k, v]) => {
            const percent = Math.round((v / totalSev) * 100);
            const color = k === "high" ? "var(--bad)" : k === "medium" ? "var(--warn)" : k === "low" ? "var(--ok)" : "var(--info)";
            return (
              <div key={k} style={{ marginBottom: "14px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: color, flex: "0 0 auto" }} />
                <span style={{ fontSize: "12px", color: "var(--text-soft)", width: "60px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</span>
                <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", overflow: "hidden" }}>
                  <div style={{ width: `${percent}%`, height: "100%", background: color, borderRadius: "6px" }} />
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-soft)", fontFamily: "var(--font-mono)", flex: "0 0 auto", marginLeft: "8px" }}>{v}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent audits table tile */}
      <div className="tile" style={{ gridColumn: "span 2" }}>
        <h3>Recent Audits</h3>
        {data.recent.length === 0 ? (
          <EmptyState icon="📂" title="Nothing Scanned Yet" />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: "28%" }}>Project</th>
                <th style={{ width: "16%" }}>Status</th>
                <th style={{ width: "14%" }}>Candidates</th>
                <th style={{ width: "14%" }}>Findings</th>
                <th style={{ width: "28%" }}>When</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((s) => {
                const color = pillColor(s.status);
                return (
                  <tr key={s.id} className="clickable" onClick={() => (window.location.href = `/scan/${s.id}`)}>
                    <td style={{ color: "var(--accent)", fontWeight: 600 }}>{s.repository}</td>
                    <td>
                      <span className="status-pill" style={{ borderColor: color, color }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{s.candidates_count}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{s.findings_count}</td>
                    <td className="small muted">{new Date(s.created_at).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* System health tile */}
      <div className="tile">
        <h3>System Health</h3>
        <div style={{ marginBottom: "var(--space-md)" }}>
          <span className="badge ok">Semgrep Installed</span>
        </div>
        <div style={{ marginBottom: "var(--space-md)" }}>
          <span className="badge plain">AI Provider: Not configured</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-soft)" }}>
          Scan Root: —
        </div>
      </div>

    </>
  );
}