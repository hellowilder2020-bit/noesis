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
    setSettingRoot(true);
    setRootError(null);
    setRootSaved(false);
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

  if (error) return <ErrorBanner error={error} />;
  if (!caps) return <p><Spinner /> Loading configuration…</p>;

  return (
    <>
      <h1 className="page-title">Settings</h1>

      {/* Scan root tile */}
      <div className="tile">
        <h3>Scan Root</h3>
        <div style={{ marginBottom: "var(--space-md)" }}>
          <span className="mono small" style={{ color: "var(--accent)" }}>{caps.scan_root}</span>
        </div>
        <div className="row" style={{ gap: "var(--space-md)" }}>
          <button onClick={() => setRootInput(caps.scan_root)}>Edit</button>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ display: "block", marginBottom: 0 }}>New Root Path</label>
            <input
              type="text"
              value={rootInput}
              onChange={(e) => setRootInput(e.target.value)}
              placeholder="Enter folder path"
              style={{ flex: 1 }}
            />
          </div>
          <button className="btn-primary" onClick={applyRoot} disabled={settingRoot || !rootInput.trim()}>
            {settingRoot ? (<><Spinner /> Setting…</>) : "Save Root"}
          </button>
        </div>
        {rootSaved && (
          <p style={{ marginTop: "var(--space-sm)", fontSize: "12px", fontWeight: 700, color: "var(--ok)" }}>✓ Scan root updated.</p>
        )}
        {rootError ? <ErrorBanner error={rootError} /> : null}
      </div>

      {/* Capabilities tile */}
      <div className="tile">
        <h3>Capabilities</h3>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", fontSize: "12px" }}>
          <dt style={{ color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: 0.06, fontSize: "10px" }}>Scan Root</dt>
          <dd className="mono small muted">{caps.scan_root}</dd>
          <dt style={{ color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: 0.06, fontSize: "10px" }}>Semgrep</dt>
          <dd>
            <span className={`badge ${caps.semgrep.installed ? "ok" : "bad"}`}>
              {caps.semgrep.installed ? `✓ v${caps.semgrep.version}` : "Not installed"}
            </span>
          </dd>
          <dt style={{ color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: 0.06, fontSize: "10px" }}>AI Provider</dt>
          <dd>
            <span className={`badge ${caps.ai.ready ? "ok" : "plain"}`}>
              {caps.ai.ready ? "Configured" : "Not configured"}
            </span>
          </dd>
          <dt style={{ color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: 0.06, fontSize: "10px" }}>AI Model</dt>
          <dd>{caps.ai.model ?? "—"}</dd>
          <dt style={{ color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: 0.06, fontSize: "10px" }}>AI Base URL</dt>
          <dd className="mono small muted">{caps.ai.base_url ?? "—"}</dd>
        </dl>
      </div>

      {/* Limits tile */}
      <div className="tile">
        <h3>Limits</h3>
        <div className="tile-grid" style={{ gap: "var(--space-md)" }}>
          {Object.entries(caps.limits).map(([k, v]) => (
            <div key={k} className="tile stat">
              <div className="big">{v}</div>
              <div className="label">{k.replace(/_/g, " ").toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

    </>
  );
}