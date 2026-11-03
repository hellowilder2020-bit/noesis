import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, BrowseResponse, Inventory } from "../api";
import { ErrorBanner, Spinner } from "../ui";

export default function NewScan() {
  const [dir, setDir] = useState("");
  const [listing, setListing] = useState<BrowseResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [inspect, setInspect] = useState<Inventory | null>(null);
  const [browseError, setBrowseError] = useState<unknown>(null);
  const [inspectError, setInspectError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<unknown>(null);
  const navigate = useNavigate();

  const load = useCallback((path: string) => {
    setListing(null); setInspect(null); setInspectError(null); setBrowseError(null);
    api.browse(path).then(setListing).catch(setBrowseError);
  }, []);

  useEffect(() => { load(""); }, [load]);

  const choose = (p: string) => {
    setSelected(p);
    setInspect(null);
    setInspectError(null);
  };

  const inspectSelected = () => {
    if (!selected) return;
    api.inspect(selected).then(setInspect).catch(setInspectError);
  };

  const start = async () => {
    if (!selected) return;
    setStarting(true); setStartError(null);
    try {
      const res = await api.startScan(selected);
      navigate(`/scan/${res.id}`);
    } catch (e) {
      setStartError(e);
      setStarting(false);
    }
  };

  const goUp = () => {
    const parts = dir.split("/").filter(Boolean);
    parts.pop();
    const up = parts.join("/");
    load(up);
    setDir(up);
    setSelected(null); setInspect(null);
  };

  return (
    <>
      <h1 className="page-title">Audit a project</h1>
      <p className="page-sub">
        Three steps: <b>1)</b> pick a folder inside the approved root,{" "}
        <b>2)</b> preview what the scanner will look at, then <b>3)</b> start the
        audit. The analysis only <i>reads</i> files — it never runs the code.
      </p>

      <div className="card">
        <div className="step">
          <div className="num">1</div>
          <div style={{ flex: 1 }}>
            <h4>Pick a project folder</h4>
            <p>Only folders inside the approved scan root can be audited, for safety.</p>
            <div className="row" style={{ margin: "10px 0" }}>
              <button onClick={goUp}>↑ Up one level</button>
              <span className="mono">root/{listing?.path ?? dir}</span>
            </div>
            {browseError ? <ErrorBanner error={browseError} /> : null}
            {!listing ? <Spinner /> : (
              <table className="data">
                <thead><tr><th>Folders</th><th>Files</th></tr></thead>
                <tbody>
                  {listing.directories.length === 0 && listing.files.length === 0 ? (
                    <tr><td colSpan={2} className="muted">This folder is empty.</td></tr>
                  ) : (
                    <tr>
                      <td>
                        {listing.directories.map((d) => (
                          <div key={d} style={{ marginBottom: 4 }}>
                            <a href="#" onClick={(e) => { e.preventDefault(); goInto(d); }}>📁 {d}/</a>
                          </div>
                        ))}
                      </td>
                      <td className="small muted">{listing.files.slice(0, 8).join(", ")}{listing.files.length > 8 ? ` +${listing.files.length - 8} more` : ""}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="step">
          <div className="num">2</div>
          <div style={{ flex: 1 }}>
            <h4>Preview the audit scope</h4>
            {selected ? (
              <>
                <p>Audit folder: <b className="mono">{selected}</b></p>
                <div className="row">
                  <button className="btn-primary" onClick={inspectSelected}>🔍 Show what will be scanned</button>
                  <button className="btn-primary" onClick={start} disabled={starting}>
                    {starting ? (<><Spinner /> Starting…</>) : "▶ Start audit (step 3)"}
                  </button>
                </div>
                {inspectError ? <ErrorBanner error={inspectError} /> : null}
                {inspect ? (
                  <div style={{ marginTop: 12 }}>
                    <ul className="small" style={{ color: "var(--text)" }}>
                      <li><b>{inspect.source_files}</b> source files ({inspect.languages ? Object.entries(inspect.languages).map(([k, v]) => `${v} ${k}`).join(", ") : "none"})</li>
                      <li>Ignored: dependencies, caches, binaries, credential-shaped files (.env, *.pem…)</li>
                      {inspect.truncated ? <li style={{ color: "var(--warn)" }}>⚠ some files were left out (limits: {inspect.truncation_reasons.join(", ")})</li> : null}
                      {inspect.warnings.length > 0 ? <li className="muted">{inspect.warnings.length} warning(s): {inspect.warnings[0]}</li> : null}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">Select a folder from step 1 (or one of its subfolders).</p>
            )}
          </div>
        </div>

        <div className="step">
          <div className="num">3</div>
          <div style={{ flex: 1 }}>
            <h4>Start &amp; watch</h4>
            <p>
              The audit runs in the background; you'll be taken to a live status
              page. First the file inventory is built, then the static scanner
              runs. Candidates appear as they are found.
            </p>
            {startError ? <ErrorBanner error={startError} /> : null}
          </div>
        </div>
      </div>
    </>
  );

  function goInto(d: string) {
    const next = dir ? `${dir}/${d}` : d;
    setDir(next);
    load(next);
  }
}
