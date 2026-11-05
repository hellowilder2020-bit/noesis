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

  const [picked, setPicked] = useState<Picked[]>([]);
  const [investigate, setInvestigate] = useState(false);
  const [aiReady, setAiReady] = useState(false);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<unknown>(null);
  const navigate = useNavigate();

  const load = useCallback((path: string) => {
    setListing(null); setBrowseError(null);
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
    setSettingRoot(true); setRootError(null);
    try {
      const res = await api.setScanRoot(rootInput.trim());
      setScanRoot(res.scan_root);
      setRootInput("");
      setShowRootEditor(false);
      setDir("");
      setPicked([]);
      load("");
    } catch (e) {
      setRootError(e);
    } finally {
      setSettingRoot(false);
    }
  };

  const startAudit = async () => {
    if (picked.length === 0) return;
    setStarting(true); setStartError(null);
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

  const step = picked.length === 0 ? 1 : starting ? 3 : 2;

  return (
    <>
      <div className="hero">
        <h1 className="page-title">Audit a project</h1>
        <p className="page-sub">
          Point the scanner at any folder on this machine, pick what to audit, and
          launch. The analysis only <i>reads</i> files — it never runs the code,
          never talks to the internet, and never touches credential files.
        </p>
        <div className="steps-rail">
          <div className={`step-chip ${step === 1 ? "active" : step > 1 ? "done" : ""}`}>
            <span className="n">{step > 1 ? "✓" : "1"}</span> Choose folders
          </div>
          <div className="step-line" />
          <div className={`step-chip ${step === 2 ? "active" : step > 2 ? "done" : ""}`}>
            <span className="n">{step > 2 ? "✓" : "2"}</span> Review scope
          </div>
          <div className="step-line" />
          <div className={`step-chip ${step === 3 ? "active" : ""}`}>
            <span className="n">3</span> Launch audit
          </div>
        </div>
      </div>

      {/* ---- location bar -------------------------------------------------- */}
      <div className="card">
        <div className="row spread">
          <div>
            <h3>📍 Where are your projects?</h3>
            <p className="hint" style={{ marginBottom: 0 }}>
              Audits happen inside one approved root. Currently:{" "}
              <b className="mono">{scanRoot ?? "…"}</b>
            </p>
          </div>
          <button onClick={() => setShowRootEditor((v) => !v)}>
            {showRootEditor ? "Cancel" : "Change root"}
          </button>
        </div>
        {showRootEditor && (
          <div style={{ marginTop: 12 }}>
            <div className="row">
              <input
                type="text"
                value={rootInput}
                autoFocus
                placeholder="e.g. C:\Users\you\my-projects  or  /home/you/repos"
                onChange={(e) => setRootInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyRoot(); }}
                style={{ flex: 1, minWidth: 260 }}
              />
              <button className="btn-primary" onClick={applyRoot} disabled={settingRoot || !rootInput.trim()}>
                {settingRoot ? (<><Spinner /> Setting…</>) : "Use this folder"}
              </button>
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              Tip: pick a parent folder that holds several projects — you can then
              audit any of them (or many at once) without coming back here.
            </p>
            {rootError ? <ErrorBanner error={rootError} /> : null}
          </div>
        )}
      </div>

      {/* ---- folder browser ------------------------------------------------ */}
      <div className="card">
        <div className="row spread" style={{ marginBottom: 10 }}>
          <div className="crumbs">
            <button className="crumb" onClick={() => goToCrumb("")}>🏠 root</button>
            {crumbs.map((c) => (
              <span key={c.path} style={{ display: "inline-flex", alignItems: "center" }}>
                <span className="crumb-sep">›</span>
                <button className="crumb" onClick={() => goToCrumb(c.path)}>{c.name}</button>
              </span>
            ))}
          </div>
          <div className="row">
            {dir && (
              <button onClick={goUp}>↑ Up</button>
            )}
            {dir && !isPicked(dir) && (
              <button className="btn-primary" onClick={() => pick(dir)}>＋ Audit this folder</button>
            )}
            {dir && isPicked(dir) && (
              <span className="badge ok">✓ in selection</span>
            )}
          </div>
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
                : "The approved root is empty — use “Change root” above to point at your projects."}
            </div>
          </div>
        ) : (
          <div className="folder-grid">
            {listing.directories.map((d) => {
              const p = dir ? `${dir}/${d}` : d;
              const chosen = isPicked(p);
              return (
                <div key={d} className={`folder-tile ${chosen ? "chosen" : ""}`}>
                  <button className="tile-open" onClick={() => goInto(d)} title={`Open ${d}`}>
                    <span className="tile-icon">📁</span>
                    <span className="tile-name">{d}</span>
                  </button>
                  <button
                    className={`tile-select ${chosen ? "on" : ""}`}
                    onClick={() => (chosen ? unpick(p) : pick(p))}
                    title={chosen ? "Remove from selection" : "Add to audit selection"}
                  >
                    {chosen ? "✓" : "＋"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- selection tray ------------------------------------------------ */}
      <div className="tray">
        <div className="tray-inner">
          <div className="tray-chips">
            {picked.length === 0 ? (
              <span className="muted small">Nothing selected yet — click ＋ on folders above.</span>
            ) : (
              picked.map((item) => (
                <span key={item.path} className="chip" title={item.path}>
                  📁 {item.name}
                  {item.preview ? (
                    <span className="chip-meta">
                      {item.preview.source_files} src · {item.preview.total_files} files
                    </span>
                  ) : item.previewError ? (
                    <span className="chip-meta" style={{ color: "var(--bad)" }}>preview failed</span>
                  ) : (
                    <Spinner />
                  )}
                  <button className="chip-x" onClick={() => unpick(item.path)} title="Remove">✕</button>
                </span>
              ))
            )}
          </div>
          <div className="row" style={{ gap: 14 }}>
            <label className="small" style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={investigate}
                onChange={(e) => setInvestigate(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              🤖 AI investigation{!aiReady && <span className="muted"> (not configured)</span>}
            </label>
            <button
              className="btn-launch"
              onClick={startAudit}
              disabled={starting || picked.length === 0}
            >
              {starting
                ? (<><Spinner /> Launching…</>)
                : picked.length > 1
                  ? `🚀 Start audit — ${picked.length} folders`
                  : "🚀 Start audit"}
            </button>
          </div>
        </div>
        {startError ? <ErrorBanner error={startError} /> : null}
        {picked.length > 1 && !starting && (
          <p className="hint" style={{ margin: "8px 2px 0" }}>
            Each folder gets its own audit; you'll be taken to the first one and the
            rest will run in the background (see Overview).
          </p>
        )}
      </div>
    </>
  );
}
