import { useEffect, useState } from "react";
import { api, Capabilities } from "../api";
import { ErrorBanner, Spinner } from "../ui";

export default function Settings() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.capabilities().then(setCaps).catch(setError);
  }, []);

  if (error) return <><h1 className="page-title">Settings</h1><ErrorBanner error={error} /></>;
  if (!caps) return <p><Spinner /> Loading configuration…</p>;

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">
        Configuration is read from environment variables (prefix <span className="mono">PENTEST_</span>).
        Secrets are shown only asyes/no — the value itself is never displayed to anyone.
      </p>

      <div className="grid cols2">
        <div className="card">
          <h3>📁 Approved scan folder</h3>
          <p className="hint">Every audit path must be inside this directory; everything else is refused.</p>
          <span className="mono">{caps.scan_root}</span>
        </div>

        <div className="card">
          <h3>🔎 Static analysis engine</h3>
          <p className="hint">Runs the bundled Semgrep rules offline. Reports candidates (not verdicts).</p>
          {caps.semgrep.installed
            ? <span className="badge ok">✅ available · {caps.semgrep.version}</span>
            : <span className="badge bad">❌ not installed</span>}
        </div>

        <div className="card">
          <h3>🤖 AI investigator (coming in milestone 4)</h3>
          <p className="hint">Turns candidates into evidence-based findings. Does nothing until configured — and never receives credential-shaped files.</p>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Provider: {caps.ai.provider}</li>
            <li>Model: {caps.ai.model ?? <i>not set</i>}</li>
            <li>API key: {caps.ai.api_key_configured ? "✅ configured (hidden)" : "❌ not set"}</li>
            <li>Ready: {caps.ai.ready ? "✅ yes" : "⏳ no — the AI stage will be skipped for now"}</li>
          </ul>
        </div>

        <div className="card">
          <h3>📏 Resource limits</h3>
          <p className="hint">These keep scans predictable on modest machines (e.g. 8 GB RAM).</p>
          <table className="data">
            <tbody>
              {Object.entries(caps.limits).map(([k, v]) => (
                <tr key={k}><td className="mono small">{k}</td><td className="small">{v.toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
