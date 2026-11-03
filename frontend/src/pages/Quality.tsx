import { useEffect, useState } from "react";
import { api, QualityCheck, QualityState } from "../api";
import { ErrorBanner, Spinner } from "../ui";

const CATEGORY_INFO: Record<string, { title: string; blurb: string }> = {
  "environment": {
    title: "Environment",
    blurb: "Is the tooling ready to run at all?",
  },
  "path-safety": {
    title: "Path safety",
    blurb: "Can the system actually be fooled into scanning outside its folder? These checks try real attacks and verify they are rejected.",
  },
  "discovery": {
    title: "File discovery",
    blurb: "Does the file reader ignore the things it should (dependencies, caches, credential files) and read only what it should?",
  },
  "detection": {
    title: "Detection rules",
    blurb: "Known-vulnerable test snippets must be flagged, and their safe twins must be left alone.",
  },
  "benchmark": {
    title: "Benchmark project",
    blurb: "Every planted vulnerability in the sample project must be caught, and every safe block must stay clean.",
  },
};

const CATEGORY_ORDER = ["environment", "path-safety", "discovery", "detection", "benchmark"];

function CheckRow({ c }: { c: QualityCheck }) {
  return (
    <div className="check-row">
      <div className="check-head">
        <span>{c.passed ? "✅" : "❌"}</span>
        <span className="check-title">{c.title}</span>
        {c.detail ? null : null}
      </div>
      <details className="check-detail">
        <summary>More about this check</summary>
        <div className="body">
          <p>{c.description}</p>
          <dl>
            <dt>Expected</dt><dd>{c.expected}</dd>
            <dt>Observed</dt><dd style={c.passed ? undefined : { color: "var(--bad)" }}>{c.actual}</dd>
            {c.detail ? <><dt>Why it matters</dt><dd>{c.detail}</dd></> : null}
          </dl>
        </div>
      </details>
    </div>
  );
}

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
    setKicking(true); setError(null);
    try {
      await api.runQuality();
      setState({ status: "running", checks: [] });
    } catch (e) {
      setError(e);
    } finally {
      setKicking(false);
    }
  };

  if (error) return <><h1 className="page-title">Health checks</h1><ErrorBanner error={error} /></>;
  if (!state) return <p><Spinner /> Loading health-check results…</p>;

  const groups = new Map<string, QualityCheck[]>();
  for (const c of state.checks) {
    const list = groups.get(c.category) ?? [];
    list.push(c);
    groups.set(c.category, list);
  }

  return (
    <>
      <h1 className="page-title">Health checks</h1>
      <p className="page-sub">
        <b>What went right and what went wrong</b> — this page runs a live test
        battery against the scanning engine itself and reports honest pass/fail
        results. Nothing is simulated: failing checks mean the tool is not yet
        trustworthy, and we show that.
      </p>

      <div className="card">
        <div className="row spread">
          <div>
            <h3>Latest run</h3>
            <p className="hint" style={{ margin: 0 }}>
              {state.status === "idle" && "No run yet. Press the button to run all checks (takes ~1–2 minutes; it runs real scans)."}
              {state.status === "running" && <><Spinner /> Checks are running right now — page updates automatically…</>}
              {state.status === "done" && <>Completed in {Math.round((state.duration_ms ?? 0) / 1000)}s.</>}
              {state.status === "error" && `Run failed: ${state.error}`}
            </p>
          </div>
          <button className="btn-primary" onClick={run} disabled={kicking || state.status === "running"}>
            ▶ Run all checks
          </button>
        </div>
        {state.status === "done" && state.summary && (
          <div className="row" style={{ marginTop: 10 }}>
            <span className="badge ok">✅ {state.summary.passed} passed</span>
            {state.summary.failed > 0
              ? <span className="badge bad">❌ {state.summary.failed} failed</span>
              : <span className="badge plain">0 failed</span>}
          </div>
        )}
      </div>

      {state.checks.length === 0 && state.status !== "running" ? (
        <div className="callout info">
          <b>Nothing to show yet</b>
          Run the checks to see a full breakdown here.
        </div>
      ) : (
        CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => {
          const info = CATEGORY_INFO[cat] ?? { title: cat, blurb: "" };
          const checks = groups.get(cat)!;
          const passed = checks.filter((c) => c.passed).length;
          return (
            <div className="card" key={cat}>
              <div className="row spread">
                <h3>{info.title}</h3>
                <span className={`badge ${passed === checks.length ? "ok" : "warn"}`}>{passed}/{checks.length} passed</span>
              </div>
              <p className="hint">{info.blurb}</p>
              {checks.map((c) => <CheckRow key={c.id} c={c} />)}
            </div>
          );
        })
      )}

      <div className="callout info">
        <b>How to read this page</b>
        Green rows are proofs that a protection or detection behaviour works.
        Red rows are real defects or gaps we know about. Candidates on the audit
        pages are “worth looking at”, findings are “confirmed problems” — this
        page tells you how much you can lean on that distinction so far.
      </div>
    </>
  );
}
