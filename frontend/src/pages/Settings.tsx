import { useEffect, useState } from "react";
import { api, AppSettings } from "../api";
import { ErrorBanner, Spinner } from "../ui";

export default function Settings() {
  const [caps, setCaps] = useState<AppSettings | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [rootInput, setRootInput] = useState("");
  const [settingRoot, setSettingRoot] = useState(false);
  const [rootError, setRootError] = useState<unknown>(null);
  const [rootSaved, setRootSaved] = useState(false);

  const load = () => {
    api.settings().then(setCaps).catch(setError);
  };
  useEffect(load, []);

  const applyRoot = async () => {
    if (!rootInput.trim()) return;
    setSettingRoot(true); setRootError(null); setRootSaved(false);
    try {
      await api.setScanRoot(rootInput.trim());
      setRootInput("");
      setRootSaved(true);
      load();
    } catch (e) {
      setRootError(e);
    } finally {
      setSettingRoot(false);
    }
  };

  if (error) return <><h1 className="page-title">Settings</h1><ErrorBanner error={error} /></>;
  if (!caps) return <p><Spinner /> Loading configuration…</p>;

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">
        The approved scan folder can be changed right here — everything else comes
        from environment variables (prefix <span className="mono">PENTEST_</span>).
        Secrets are shown only as yes/no — the value itself is never displayed to anyone.
      </p>

      <div className="grid cols2">
        <div className="card">
          <h3>📁 Approved scan folder</h3>
          <p className="hint">
            Every audit path must be inside this directory; everything else is refused.
            Change it to scan projects that live anywhere on this machine.
          </p>
          <span className="mono">{caps.scan_root}</span>
          <div className="row" style={{ margin: "10px 0" }}>
            <input
              type="text"
              value={rootInput}
              placeholder="New absolute folder path…"
              onChange={(e) => setRootInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyRoot(); }}
              style={{ flex: 1, minWidth: 220 }}
            />
            <button className="btn-primary" onClick={applyRoot} disabled={settingRoot || !rootInput.trim()}>
              {settingRoot ? (<><Spinner /> Setting…</>) : "Set root"}
            </button>
          </div>
          {rootError ? <ErrorBanner error={rootError} /> : null}
          {rootSaved ? <p className="small" style={{ color: "var(--ok)" }}>✅ Scan root updated — it persists across restarts.</p> : null}
        </div>

        <div className="card">
          <h3>🔎 Static analysis engine</h3>
          <p className="hint">Runs the bundled Semgrep rules offline. Reports candidates (not verdicts).</p>
          {caps.semgrep.installed
            ? <span className="badge ok">✅ available · {caps.semgrep.version}</span>
            : <span className="badge bad">❌ not installed</span>}
        </div>

        <div className="card">
          <h3>🤖 AI investigator</h3>
          <p className="hint">
            Turns candidates into evidence-based findings. Provider-agnostic: any
            OpenAI-compatible endpoint or Anthropic works; local models are fine.
            Never receives credential-shaped files.
          </p>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Provider: {caps.ai.provider}</li>
            <li>Model: {caps.ai.model ?? <i>not set</i>}</li>
            <li>Base URL: {caps.ai.base_url ?? <i>not set</i>}</li>
            <li>API key: {caps.ai.api_key_configured ? "✅ configured (hidden)" : "❌ not set"}</li>
            <li>Ready: {caps.ai.ready ? "✅ yes — tick “AI investigation” when starting an audit" : "⏳ no — set PENTEST_AI_PROVIDER, PENTEST_AI_BASE_URL, PENTEST_AI_MODEL and PENTEST_AI_API_KEY in .env, then restart"}</li>
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
