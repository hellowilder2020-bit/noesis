# AI Pentester

**An open-source, AI-powered source-code security auditing tool.**
It reads code, looks for dangerous patterns, and reports them *with evidence* —
while being honest about what it knows and does not know yet.

> ⚠️ **Ethical framing:** AI Pentester audits *source code you own or are
> authorised to audit*. It only ever **reads** files — it never executes the
> code it examines, never talks to the internet, and never invents results.

---

## 1. What is this project about?

Modern code repositories hide dozens of dangerous patterns: SQL injection,
disabled TLS verification, shell command construction, unsafe deserialisation,
hardcoded secrets… Human reviewers miss them; generic scanners flood you with
false positives.

AI Pentester takes a **deterministic-analysis-first** approach:

1. **Discover** the repository safely (using an `os.walk`-style scan with
   allow/deny lists, size limits and symlink protection — defined *before*
   any scan runs).
2. **Scan** with [Semgrep](https://semgrep.dev) and a curated, *offline-bundled*
   rule set (we vendor a security-focused subset of the Semgrep registry plus
   our own custom rules — no network needed at scan time).
3. **Report candidates** — raw patterns worth human attention. A *candidate*
   is **not** a confirmed finding: it is evidence that a risky pattern exists.
4. *(Coming)* **Investigate with AI**: an LLM reads the surrounding code (from
   a dedicated context engine) and produces evidence-based verdicts —
   *verdicts must cite real code, never guess*.
5. *(Coming)* **Verify & benchmark**: consolidation, deduplication and scoring
   against known ground truth.

The design rules we enforce:
- **Candidates ≠ findings.** The UI never claims confirmation unless evidence
  backs it.
- **No fake results.** The built-in health-check page runs real self-tests
  against the engine and shows honest pass/fail rows.
- **Never execute scanned code.** Code is treated as text, always.
- **Provider-independent AI.** Any OpenAI-compatible or Anthropic endpoint
  works; local models are fine.

---

## 2. Install & run

### 2.1 Requirements

| Component | Version | Why |
|---|---|---|
| Python | **≥ 3.12** (developed on 3.14) | backend runtime |
| Node.js + npm | Node ≥ 18 (developed on Node 26) | frontend build tooling only |
| Semgrep | ≥ 1.80 (developed on 1.183.0) | static analysis engine |
| RAM | ~200 MB idle, under 1 GB during a typical scan | tuned for an 8 GB machine |
| Disk | < 200 MB (deps + bundled rules + SQLite db) | small |

No GPU, no cloud account, no API key required to run the scanner.
(An AI API key is needed only for the AI-investigation milestone, not yet wired.)

### 2.2 Install (one-time)

```bash
# from the project root (/home/mcqueen95/python)
python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -e "backend[dev]" "semgrep>=1.80" "GitPython>=3.1"

cd frontend && npm install && npm run build && cd ..   # builds frontend/dist
```

Side-effects of the build step: `frontend/dist/` (the compiled UI, served by
the backend) and the vendored Semgrep rules inside
`backend/aipentester/scanners/rules/` (already committed; see
`scripts/vendor_rules.py` if you want to re-vendor or curate the registry).

### 2.3 Run

```bash
.venv/bin/uvicorn aipentester.main:app --port 8000
```

Open **<http://127.0.0.1:8000>**. The same server serves the API *and* the UI —
one command, one port. Handy aliases already exist in the `Makefile`:

```bash
make run-backend    # uvicorn with auto-reload on port 8000
make run-frontend   # vite dev server on 5173 (proxies /api to :8000)
make test           # pytest backend/tests
```

You should then:

1. Open **Overview** to see aggregate stats,
2. Go to **Audit a project → audit `benchmark-app`** (the bundled, safe sample
   project with deliberately planted vulnerabilities) and watch a ~40 s live
   scan,
3. Open **Health checks → ▶ Run all checks** to watch the tool prove its own
   safety/detection behaviour (takes 1–2 min).

### 2.4 Auditing your own directories — “custom dirs” ✅ (built in)

All scans happen **inside one approved scan root** — a hard security boundary
(see §1). You choose which directory that is:

**Option A — one-off (shell):**

```bash
PENTEST_SCAN_ROOT=/home/you/my-projects .venv/bin/uvicorn aipentester.main:app --port 8000
```

**Option B — persistent: copy `.env.example` → `.env` and edit:**

```bash
cp .env.example .env
$EDITOR .env       # set PENTEST_SCAN_ROOT=/absolute/path/to/your/projects
```

Then open **Audit a project** in the UI: the folder browser only shows paths
inside your root, the two-column file preview shows exactly what will be
scanned (with skip reasons), and **Start audit** kicks off a background scan —
progress is streamed live to the audit page.

You can also script it:

```bash
# list a directory's contents (read-only, no scan)
curl -s "http://127.0.0.1:8000/api/repositories/browse?path=my-projects"

# dry-run: full inventory with file counts, languages, manifests, warnings
curl -s -X POST http://127.0.0.1:8000/api/repositories/inspect \
     -H 'Content-Type: application/json' -d '{"path":"my-projects/my-app"}'

# start a scan
curl -s -X POST http://127.0.0.1:8000/api/scans \
     -H 'Content-Type: application/json' -d '{"path":"my-projects/my-app"}'
```

> 🔐 **Safety note:** paths outside the root are always rejected, as are `..`
> traversals and symlinks that escape the root. `.env`, `*.pem`/`*.key` and
> other credential-shaped files are never inventoried, hashed, or sent to an
> AI provider. This behaviour is verified by the Health-checks page.

### 2.5 The bundled sample project

`samples/benchmark-app` is a safe, self-contained fixture with **deliberately
planted vulnerabilities, each paired with a “safe twin”**: SQL injection vs
parameterised queries, `os.system` vs `execFile`/argv lists, hardcoded secrets
vs allowed config usage, disabled TLS verification, `eval`, `pickle`,
`yaml.load`, `innerHTML`, MD5 hashes, path traversal, open redirects…

It is used by both the integration tests and the health-check benchmark, and is
the easiest way to see the tool work end to end without involving your code.

### 2.6 Tests

```bash
.venv/bin/pytest backend/tests -q
```

Unit tests run in seconds; integration tests drive **real Semgrep scans**
against sandboxes and `samples/benchmark-app` and take ~5 min of a cold run.
Baseline at time of writing: **60 passed, 1 skipped.**

---

## 3. What it can do today, and what it can’t (yet)

### ✅ Can (shipped)

| Capability | Detail |
|---|---|
| Safe repository discovery | ignore-list driven walk (deps, caches, build output), size/depth/file-count limits, symlink-safe, binary-aware; metadata-only handling of binaries |
| Path safety with proof | every user path validated inside the approved root; adversarial self-tests (`..`, `/etc`, symlink escapes) run on the health page |
| Sensitive-file protection | `.env`, `*.pem`, `*.key`, `id_rsa*`, credentials files are never inventoried/read/uploaded |
| Offline static analysis | curated Semgrep rules vendored locally (python / javascript / typescript); custom `pent.*` rules; noisy, high false-positive rules are excluded with documented reasons |
| Background scan orchestration | scans run in a worker thread; crash-honest restart handling (`status: interrupted`, not a stuck “running”) |
| Evidence-rich candidates | every candidate carries the matched code excerpt, rule id, severity, lines, an audit-safe fingerprint and a normalised vulnerability family |
| Live audit UI | friendly dashboard, guided 1-2-3 audit flow, per-audit timeline, “what went right / wrong” panel, per-candidate code peek |
| Self-audit (“Health checks”) | 55 real checks: environment, path safety, discovery, rule detection matrix, full benchmark ground truth (each planted vulnerability caught; each safe twin quiet) |
| Aggregate dashboard API | scan totals, severity & vulnerability-family distributions, recent audits |
| SQLite persistence | scans, inventories, candidates, findings, and audit events survive restarts; WAL-journaled, FK-enforced |

### ❌ Can’t (yet — the roadmap)

| Missing | Planned as |
|---|---|
| **AI investigation** — turning candidates into evidence-based findings | Milestone 4 (AI adapter, provider-agnostic; any OpenAI-compatible / Anthropic endpoint; local models OK) |
| **Context engine** — feeding precise file slices to the LLM | Milestone 3 |
| **Evidence-based verification & adjudication** of AI claims against real code | Milestone 5 |
| **Formal reports** — PDF/HTML/SARIF export | Milestone 6 |
| **Benchmark scoring / metrics dashboard** | Milestone 8 |
| **Full auto-fixes** — suggesting patches | Backlog (risky; will be opt-in only) |

Because findings don’t exist yet, every list today shows **candidates =
“worth a human look”**, and the UI says so explicitly.

---

## 4. Tech stack & the nerdy details

### 4.1 Stack overview

```
┌──────────────┐  build-time install  ┌───────────────────────────────┐
│ React 19 +   │  ──────────────────▶ frontend/dist (static files)     │
│ TypeScript   │                      └──────────────┬────────────────┘
│ Vite 6       │                                     │ served by
└──────────────┘                                     ▼
                      ┌─────────────────────────────────────────────┐
                      │ FastAPI  backend/aipentester/…              │
                      │  • api/routes/*    REST endpoints           │
                      │  • services/*      orchestrator, jobs,      │
                      │                    quality_check            │
                      │  • scanners/*      semgrep adapter + rules  │
                      │  • repository/*    safe discovery           │
                      │  • security/*      path validation          │
                      │  • db/*            SQLAlchemy 2 + SQLite    │
                      │  • schemas/*       Pydantic v2 responses    │
                      └─────────────────────────────────────────────┘
                                     │ subprocess (read-only)
                                     ▼
                        semgrep binary + bundled rules
```

| Layer | Technology | Notes |
|---|---|---|
| Backend | Python 3.12+, FastAPI, Uvicorn | app factory in `main.py`, routers under `/api` |
| Config | `pydantic-settings` | env vars with `PENTEST_` prefix + optional `.env` |
| Database | SQLite + SQLAlchemy 2.0 (ORM, typed mappings) | WAL journal, FK on, 10 s busy timeout; `data/pentest.db` |
| Validation | Pydantic v2 | separate request/response schemas |
| Scanner | Semgrep ≥ 1.80 | subprocess, `--json`, offline; rules: `scanners/rules/registry` (vendored registry subset) + `scanners/rules/custom` (`pent.*` ids) |
| Frontend | React 19, TypeScript, Vite 6, react-router 7 | no UI framework; hand-rolled CSS design tokens in `src/styles.css` |
| Dev / tests | pytest 8 (+ integration marks), `httpx` TestClient | `pytest.ini` registers the `integration` marker |
| Test App | `make test` · single-command `uvicorn` | served SPA: unknown non-`/api` GET paths fall back to `index.html` |

### 4.2 Design decisions worth knowing

- **Deterministic first, AI later.** Only reproducible, offline analysis
  produces results today. This knowingly sacrifices some recall (semgrep-only
  findings) for trustworthy output and complete auditability.
- **The rule pack is vendored, not downloaded.** `scripts/vendor_rules.py`
  pulls security-oriented rules from the registry via `sempkg` (only
  `security` path segments; python/js/ts only; no fixture `.json` payloads),
  validates them offline, and stamps provenance. Nothing talks to the network
  at scan time.
- **False-positive engineering.** A documented exclusion list
  (`EXCLUDED_RULE_IDS` in `scanners/semgrep.py`) drops registry rules that
  fire on *safe* patterns (e.g. `subprocess.run(allow-listed argv)`). Each
  exclusion is commented with the reason. The benchmark ground truth in
  `services/quality_check.py` is the arbiter: every planted vulnerability must
  be caught; every safe twin must be quiet — or the CI (and Health page) fails.
- **Restart honesty.** On boot, `app.lifespan` marks scans that were killed
  mid-run as `interrupted` — you will never see a forever-“running” scan.
- **Security posture.** All user paths go through
  `security/paths.validate_inside_root` (lexical + per-segment symlink
  checks + root-containment re-resolution). Symlinks are never followed by
  discovery. Sensitive names (`is_sensitive_file`) are skipped *before* any
  read. AI providers can only ever receive source excerpts — never
  credential-shaped files, never binaries.
- **Sizing assumptions.** Default limits (see §4.3) target a modest 8 GB dev
  box: max 5 000 files, 1 MB per file, 200 MB total, depth 24, and at most
  200 candidates persisted per scan (skipped overflow is counted and
  reported, never silently dropped).

### 4.3 Full configuration reference (`PENTEST_*` / `.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PENTEST_SCAN_ROOT` | `<repo>/samples` | **The only** directory scans may target |
| `PENTEST_DATA_DIR` | `<repo>/data` | SQLite db + sandbox location (never holds source trees) |
| `PENTEST_DEBUG` | off | verbose logs |
| `PENTEST_SEMGREP_BIN` | `semgrep` | binary name or full path (venv auto-detected as fallback) |
| `PENTEST_SEMGREP_TIMEOUT_SECONDS` | `300` | per-batch scan timeout |
| `PENTEST_MAX_FILES` | `5000` | inventory cap |
| `PENTEST_MAX_FILE_BYTES` | `1000000` | per-file read cap (larger files → metadata-only) |
| `PENTEST_MAX_TOTAL_BYTES` | `200000000` | whole-repo byte cap |
| `PENTEST_MAX_DEPTH` | `24` | directory recursion cap |
| `PENTEST_MAX_CANDIDATES_PERSIST` | `200` | candidates stored per scan (overflow reported) |
| `PENTEST_SEMGREP_JOBS` | `1` | parallel semgrep batches |
| `PENTEST_AI_*` | unset/off | future milestone 4: `AI_PROVIDER`(openai_compatible/anthropic/none), `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, timeouts & token budgets — the API key is used only in-process and is never logged or persisted |
| `PENTEST_CORS_ORIGINS` | vite dev origins | list for development |

### 4.4 HTTP API (all under `/api`)

| Method & path | What it does |
|---|---|
| `GET /api/health` | liveness probe |
| `GET /api/system/capabilities` | scanner presence, AI readiness (booleans only), limits |
| `POST /api/repositories/inspect` | validate path + full measured inventory (no scan) |
| `GET /api/repositories/browse?path=` | safe directory listing inside the root |
| `POST /api/scans` | start a background scan (202) |
| `GET /api/scans?limit=` | list recent scans |
| `GET /api/scans/{id}` | status, timeline events, warnings, errors |
| `GET /api/scans/{id}/candidates` | evidence-rich candidate list |
| `GET /api/dashboard` | aggregates: counts, severity & vuln-family distributions |
| `GET /api/quality` | last self-audit report (idle/running/done/error) |
| `POST /api/quality/run` | kick off a fresh self-audit (409 if one is running) |

Interactive docs live at `/docs` (Swagger) thanks to FastAPI.

### 4.5 Project layout

```
python/
├── backend/
│   ├── aipentester/
│   │   ├── api/routes/        # FastAPI routers (scans, repositories, quality, dashboard, system)
│   │   ├── db/                # SQLAlchemy models, WAL session factory
│   │   ├── repository/        # safe file discovery, language & manifest detection
│   │   ├── scanners/          # semgrep adapter + bundled rules
│   │   │   └── rules/         # registry/ (vendored) + custom/ (pent.* custom rules)
│   │   ├── schemas/           # Pydantic request/response models
│   │   ├── security/          # path validation (the security boundary)
│   │   └── services/          # orchestrator, jobs worker, quality self-audit
│   └── tests/                 # unit + integration (real semgrep runs)
├── frontend/                  # React 19 + Vite app (built output served by backend)
├── samples/                   # approved demo root
│   ├── README.md
│   └── benchmark-app/         # vulnerable + safe twin fixtures (python, ts, legacy js)
├── scripts/vendor_rules.py    # re-vendor/curate semgrep rules (offline validation)
├── .env.example               # copy to .env for custom dirs / AI settings
├── Makefile                   # run-backend / run-frontend / test / install
└── pytest.ini                 # registers the integration marker
```

---

## 5. FAQ / troubleshooting

**Port already in use?**
`uvicorn aipentester.main:app --port 8000` — pick any other port with `--port`.

**Scans feel slow the first time?**
Semgrep compiles its rule pack on first use; subsequent invocations reuse warm
state. Typical `benchmark-app` audit: ~40 s on a cold cache, ~15 s after.

**Where are the database files?**
`PENTEST_DATA_DIR` (`data/` by default). Deleting it resets all history but
does not touch any source code.

**A check fails on the Health page — what now?**
Every failed check prints expected vs observed. Most issues are: missing
Semgrep (reinstall with `pip install semgrep`), or a rules/tools mismatch —
re-run `pip install -e 'backend[dev]'`.

**Is it safe to point `PENTEST_SCAN_ROOT` at an important directory?**
Yes — the walk is read-only, symlinks are never followed, credential-shaped
files are skipped before reading, and nothing is ever executed. Deletion or
mutation is not part of the program.

---

## 6. License / status

Pre-alpha (v0.1.0) — actively developed, milestone-by-milestone.
Milestones completed so far: **M0** scaffold · **M1** discovery ·
**M2** scanner + orchestration · **M7-partial** friendly UI · self-audits.
Next up: **M3** context engine → **M4** AI investigation → **M5** evidence-
based verification → **full **reports & benchmark metrics.
