import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, BrowseResponse, Inventory } from "../api";
import { ErrorBanner, Spinner } from "../ui";

type Picked = {
  path: string;
  name: string;
  preview: Inventory | null;
  previewError: string | null;
};

export default function NewScan() {
  const [dir, setDir] = useState("");
  const [listing, setListing] = useState<BrowseResponse | null>(null);
  const [browseError, setBrowseError] = useState<unknown>(null);

  const [scanRoot, setScanRoot] = useState<string | null>(null);
  const [showRootEditor, setShowRootEditor] = useState(false);
  const [rootInput, setRootInput] = useState("");
  const [settingRoot, setSettingRoot] = useState(false);
  const [rootError, setRootError] = useState<unknown>(null);
  const [rootSaved, setRootSaved] = useState(false);

  const [picked, setPicked] = useState<Picked[]>([]);
  const [investigate, setInvestigate] = useState(false);
  const [aiReady, setAiReady] = useState(false);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<unknown>(null);
  const navigate = useNavigate();

  const load = useCallback((path: string) => {
    setListing(null);
    setBrowseError(null);
    api.browse(path).then(setListing).catch(setBrowseError);
  }, []);

  useEffect(() => {
    load("");
    api.settings().then((s) => {
      setScanRoot(s.scan_root);
      setAiReady(s.ai.ready);
    }).catch(() => undefined);
  }, [load]);

  const crumbs = useMemo(() => {
    const parts = dir.split("/").filter(Boolean);
    return parts.map((p, i) => ({ name: p, path: parts.slice(0, i + 1).join("/") }));
  }, [dir]);

  const goInto = (sub: string) => {
    const next = dir ? `${dir}/${sub}` : sub;
    setDir(next);
    load(next);
  };

  const goUp = () => {
    const parts = dir.split("/").filter(Boolean);
    parts.pop();
    const up = parts.join("/");
    setDir(up);
    load(up);
  };

  const goToCrumb = (path: string) => {
    setDir(path);
    load(path);
  };

  const isPicked = (p: string) => picked.some((x) => x.path === p);

  const pick = (p: string) => {
    if (isPicked(p)) return;
    const name = p.split("/").pop() ?? p;
    setPicked((prev) => [...prev, { path: p, name, preview: null, previewError: null }]);
    api.inspect(p)
      .then((inv) => {
        setPicked((prev) => prev.map((x) => (x.path === p ? { ...x, preview: inv } : x)));
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setPicked((prev) => prev.map((x) => (x.path === p ? { ...x, previewError: msg } : x)));
      });
  };

  const unpick = (p: string) => setPicked((prev) => prev.filter((x) => x.path !== p));

  const applyRoot = async () => {
    if (!rootInput.trim()) return;
    setSettingRoot(true);
    setRootError(null);
    try {
      const res = await api.setScanRoot(rootInput.trim());
      setScanRoot(res.scan_root);
      setRootInput("");
      setShowRootEditor(false);
      setDir("");
      setPicked([]);
      setRootSaved(true);
      load("");
    } catch (e) {
      setRootError(e);
    } finally {
      setSettingRoot(false);
    }
  };

  const startAudit = async () => {
    if (picked.length === 0) return;
    setStarting(true);
    setStartError(null);
    let firstId: string | null = null;
    const failures: string[] = [];
    for (const item of picked) {
      try {
        const res = await api.startScan(item.path, investigate);
        if (!firstId) firstId = res.id;
      } catch (e) {
        failures.push(`${item.path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (firstId) {
      navigate(`/scan/${firstId}`, {
        state: picked.length > 1
          ? { batchNote: `${picked.length} audits started — the others are visible on the Overview page.` }
          : undefined,
      });
      return;
    }
    setStartError(new Error(failures.join(" · ") || "Could not start the audit."));
    setStarting(false);
  };

  return (
    <>
      <h1 className="page-title">Audit a Project</h1>
      <p className="page-sub">Point the scanner at a folder. Code is only read — never executed.</p>

      {/* Scan root tile */}
      <div className="tile">
        <h3>Scan Root</h3>
        <div style={{ marginBottom: "var(--space-md)" }}>
          <span className="mono small" style={{ color: "var(--accent)" }}>{scanRoot ?? "—"}</span>
        </div>
        <div className="row" style={{ gap: "var(--space-md)" }}>
          <button onClick={() => setShowRootEditor(true)} className="btn-ghost">Change Root</button>
        </div>
        {showRootEditor && (
          <div style={{ marginTop: "var(--space-lg)" }}>
            <div className="form-group" style={{ marginBottom: "var(--space-md)" }}>
              <label>Root Folder Path</label>
              <input
                type="text"
                value={rootInput}
                autoFocus
                placeholder="Enter folder path"
                onChange={(e) => setRootInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyRoot(); }}
                style={{ flex: 1 }}
              />
            </div>
            <div className="row" style={{ gap: "var(--space-md)" }}>
              <button className="btn-primary" onClick={applyRoot} disabled={settingRoot || !rootInput.trim()}>
                {settingRoot ? (<><Spinner /> Setting…</>) : "Save Root"}
              </button>
              <p className="muted small" style={{ marginLeft: "var(--space-md)", marginTop: "var(--space-xs)" }}>
                Pick a parent folder holding your projects.
              </p>
            </div>
            {rootError ? <ErrorBanner error={rootError} /> : null}
          </div>
        )}
        {rootSaved && (
          <p style={{ marginTop: "var(--space-sm)", fontSize: "12px", fontWeight: 700, color: "var(--ok)" }}>✓ Scan root updated.</p>
        )}
      </div>

      {/* Folder browser tile */}
      <div className="tile">
        <h3>Select Folders</h3>
        <div className="crumbs">
          <button className="crumb" onClick={() => goToCrumb("")}>Root</button>
          {crumbs.map((c) => (
            <span key={c.path} style={{ display: "inline-flex", alignItems: "center" }}>
              <span className="crumb-sep">›</span>
              <button className="crumb" onClick={() => goToCrumb(c.path)}>{c.name}</button>
            </span>
          ))}
        </div>
        <div style={{ marginTop: "var(--space-md)", display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          {dir && <button onClick={goUp}>↑ Up</button>}
          {dir && !isPicked(dir) && (
            <button className="btn-primary" onClick={() => pick(dir)}>Audit This Folder</button>
          )}
          {dir && isPicked(dir) && (
            <span className="badge ok">Selected</span>
          )}
        </div>

        {browseError ? <ErrorBanner error={browseError} /> : null}

        {!listing ? (
          <p><Spinner /> Reading folder…</p>
        ) : listing.directories.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📂</div>
            <div style={{ fontWeight: 600 }}>No subfolders here</div>
            <div className="small">
              {dir
                ? "Go up one level, or select this folder itself for auditing."
                : "The scan root is empty. Change root to point at your projects."}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-md)", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {listing.directories.map((d) => {
              const p = dir ? `${dir}/${d}` : d;
              const chosen = isPicked(p);
              return (
                <div key={d} className={`tile ${chosen ? "chosen" : ""}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                    <span style={{ fontSize: 20 }}>{chosen ? "✓" : "📁"}</span>
                    <span className="mono" style={{ flex: 1, fontSize: "13px" }}>{d}</span>
                    <button
                      className="btn-ghost"
                      onClick={() => (chosen ? unpick(p) : pick(p))}
                      title={chosen ? "Remove from selection" : "Add to selection"}
                    >
                      {chosen ? "✕" : "+"}
                    </button>
                  </div>
                  <div className="tile-body">
                    <span className="muted small">{chosen ? "Selected for auditing" : "Click to add"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selection & launch tile */}
      <div className="tile">
        <h3>Launch Audit</h3>
        <div style={{ marginBottom: "var(--space-md)" }}>
          {picked.length === 0 ? (
            <span className="muted small">Nothing selected yet — click folders above.</span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)" }}>
              {picked.map((item) => (
                <span key={item.path} className="badge ok" style={{ fontSize: "11px", padding: "4px 10px" }}>
                  📁 {item.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="form-group" style={{ marginBottom: "var(--space-lg)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", cursor: "pointer", fontSize: "13px" }}>
            <input
              type="checkbox"
              checked={investigate}
              onChange={(e) => setInvestigate(e.target.checked)}
              style={{ margin: 0 }}
            />
            AI Investigation {!aiReady && <span className="muted">(not configured)</span>}
          </label>
        </div>
        <div className="row">
          <button
            className="btn-primary"
            onClick={startAudit}
            disabled={starting || picked.length === 0}
          >
            {starting ? (<><Spinner /> Launching…</>) : `🚀 Start Audit${picked.length > 1 ? ` — ${picked.length} Folders` : ""}`}
          </button>
        </div>
        {startError ? <ErrorBanner error={startError} /> : null}
        {picked.length > 1 && !starting && (
          <p className="muted small" style={{ marginTop: "var(--space-sm)" }}>
            Each folder gets its own audit. You'll be taken to the first one.
          </p>
        )}
      </div>

    </>
  );
}