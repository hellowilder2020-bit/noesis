import { useEffect, useState } from "react";
import { api, QualityCheck, QualityState } from "../api";
import { ErrorBanner, Spinner } from "../ui";

const CATEGORY_INFO: Record<string, { title: string; blurb: string }> = {
  "environment": { title: "Environment", blurb: "Tooling ready to run?" },
  "path-safety": { title: "Path Safety", blurb: "Scanning restricted to approved folders." },
  "discovery": { title: "File Discovery", blurb: "Correct files read, caches ignored." },
  "detection": { title: "Detection Rules", blurb: "Vulnerable snippets flagged, safe twins ignored." },
  "benchmark": { title: "Benchmark Project", blurb: "Planted vulnerabilities caught, safe blocks clean." },
};

const CATEGORY_ORDER = ["environment", "path-safety", "discovery", "detection", "benchmark"];

export default function Quality() {
  const [state, setState] = useState<QualityState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [kicking, setKicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await api.quality();
        if (!cancelled) {
          setState(s);
          if (s.status === "running") setTimeout(load, 3000);
        }
      } catch (e) {
        if (!cancelled) setError(e);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const run = async () => {
    setKicking(true);
    setError(null);
    try {
      await api.runQuality();
      setState({ status: "running", checks: [] });
    } catch (e) {
      setError(e);
    } finally {
      setKicking(false);
    }
  };

  if (error) return <ErrorBanner error={error} />;
  if (!state) return <p><Spinner /> Loading health-check results…</p>;

  const groups = new Map<string, QualityCheck[]>();
  for (const c of state.checks) {
    const list = groups.get(c.category) ?? [];
    list.push(c);
    groups.set(c.category, list);
  }

  return (
    <>
      <h1 className="page-title">Scanner Health Check</h1>
      <p className="page-sub">Live test battery against the scanning engine. Honest pass/fail results.</p>

      {/* Status tile */}
      <div className="tile">
        <h3>Latest Run</h3>
        <div className="row" style={{ marginBottom: "var(--space-md)" }}>
          <span className="status-pill"
            style={{
              borderColor: state.status === "done" ? "var(--ok)" : state.status === "running" ? "var(--accent)" : state.status === "error" ? "var(--bad)" : "var(--text-soft)",
              color: state.status === "done" ? "var(--ok)" : state.status === "running" ? "var(--accent)" : state.status === "error" ? "var(--bad)" : "var(--text-soft)",
            }}
          >
            {state.status}
          </span>
          <span className="mono small muted" style={{ marginLeft: "var(--space-md)" }}>
            {state.status === "running" ? "Checks running — page updates automatically…" :
              state.status === "done" ? `Completed in ${Math.round((state.duration_ms ?? 0) / 1000)}s.` :
              state.status === "error" ? `Run failed: ${state.error}` : "No run yet."}
          </span>
        </div>
        {state.status === "done" && state.summary && (
          <div className="row" style={{ gap: "var(--space-md)", flexWrap: "wrap" }}>
            <span className="badge ok">✓ {state.summary.passed} passed</span>
            {state.summary.failed > 0 && <span className="badge bad">✗ {state.summary.failed} failed</span>}
            {state.summary.skipped && <span className="badge plain">⏭ {state.summary.skipped} skipped</span>}
          </div>
        )}
        <button className="btn-primary" onClick={run} disabled={kicking || state.status === "running"}>
          {kicking ? (<><Spinner /> Running…</>) : state.status === "running" ? "Checks Running…" : "Run All Checks"}
        </button>
      </div>

      {/* Check category tiles */}
      <div className="tile-grid">
        {CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => {
          const info = CATEGORY_INFO[cat] ?? { title: cat, blurb: "" };
          const checks = groups.get(cat)!;
          const passed = checks.filter((c) => c.passed).length;
          const failed = checks.filter((c) => !c.passed && !c.skipped).length;

          return (
            <div key={cat} className="tile">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-md)" }}>
                <h3>{info.title}</h3>
                <span className={`badge ${passed === checks.length ? "ok" : failed > 0 ? "bad" : "warn"}`}>
                  {passed}/{checks.length}
                </span>
              </div>
              <p className="muted small" style={{ marginBottom: "var(--space-md)" }}>{info.blurb}</p>
              {checks.map((c) => (
                <div key={c.id} style={{ marginBottom: "var(--space-md)", padding: "var(--space-sm)", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                    <span style={{ fontSize: 14, flex: "0 0 auto" }}>
                      {c.skipped ? "⏭" : c.passed ? "✓" : "✗"}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", flex: 1 }}>{c.title}</span>
                    <span className={`badge ${c.passed ? "ok" : c.skipped ? "plain" : "bad"}`} style={{ fontSize: "10px" }}>
                      {c.passed ? "passed" : c.skipped ? "skipped" : "failed"}
                    </span>
                  </div>
                  <details style={{ marginTop: "var(--space-sm)" }}>
                    <summary style={{ cursor: "pointer", color: "var(--accent)", fontSize: "11px", marginTop: "var(--space-xs)" }}>More details</summary>
                    <div style={{ marginTop: "var(--space-sm)" }}>
                      <dl style={{ margin: 0, fontSize: "11px", color: "var(--text-soft)", display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px" }}>
                        <dt>Description</dt><dd>{c.description}</dd>
                        <dt>Expected</dt><dd>{c.expected}</dd>
                        <dt>Observed</dt><dd style={{ color: c.passed ? "var(--ok)" : "var(--bad)" }}>{c.actual}</dd>
                      </dl>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "var(--space-xl)" }}>
        <div className="callout" style={{ background: "rgba(52,211,153,0.08)", borderColor: "var(--ok)", color: "var(--ok)" }}>
          <span style={{ display: "block", fontWeight: 700, marginBottom: "var(--space-sm)", textTransform: "uppercase", letterSpacing: 0.06, fontSize: "11px" }}>How to Read This Page</span>
          <span style={{ fontSize: "13px", lineHeight: 1.6 }}>
            Green rows prove a protection works. Red rows are real defects or gaps we know about.
            Scanner candidates are “worth looking at”; findings are “confirmed problems” — this page
            tells you how much you can lean on that distinction.
          </span>
        </div>
      </div>

    </>
  );
}