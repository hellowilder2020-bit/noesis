# AI Pentester

**AI Pentester — From Source Code to Security Intelligence.**

A local, read-only, deterministic-first source-code security auditing tool.
It discovers repositories safely, scans them with offline Semgrep, and reports
evidence-rich candidates — never executing scanned code, never calling the
internet at scan time, and never presenting a raw pattern match as a confirmed
vulnerability.

> ⚠️ **Authorized use only.** AI Pentester audits source code you own or are
> authorised to audit. It only ever **reads** files — it never executes the code
> it examines, never talks to the internet at scan time, and never invents
> results.

**Version:** 0.1.0 (pre-alpha)

---

## What it does

- Discovers a repository safely (ignored directories, size/depth/file-count
  limits, symlink protection, sensitive-file skipping).
- Scans source files with Semgrep using rules bundled in the repository — no
  network required at scan time.
- Normalises scanner hits into evidence-rich candidates: matched code excerpt,
  rule id, severity, line numbers, vulnerability family, and a content
  fingerprint.
- Persists scans, repositories, candidates, and scan events in SQLite.
- Serves a React 19 frontend and a FastAPI REST API from a single process.
- Provides a self-audit ("Health checks") page that runs real checks against
  the engine and reports honest pass/fail results.

Every candidate is flagged as "worth a human look" — not a confirmed finding.

---

## Features

- Safe repository discovery with allow/deny lists, size/depth/file-count limits,
  symlink-safe, binary-aware
- Path safety — every user path validated inside an approved scan root; `..`
  traversal, absolute paths outside the root, and symlinks are rejected
- Sensitive-file protection — `.env`, `*.pem`, `*.key`, `id_rsa*`, and other
  credential-shaped files are never inventoried or read
- Offline static analysis — Semgrep CLI with vendored local rules (Python,
  JavaScript, TypeScript); no network at scan time
- Background scan orchestration on a single worker; crash-honest restart
  handling marks interrupted scans instead of leaving them "running"
- Evidence-rich candidates — redacted excerpt, rule id, severity, lines,
  vulnerability family, fingerprint, code SHA-256
- Live audit UI — dashboard, project selection, scan progress, candidate and
  finding review, health checks
- SQLite persistence — WAL-journaled, foreign keys enforced

---

## Installation

### Requirements

| Component | Version |
|-----------|---------|
| Python | ≥ 3.12 |
| Node.js + npm | ≥ 18 (frontend build only) |
| Semgrep | ≥ 1.80 |
| Git | optional |

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e "backend[dev]" "semgrep>=1.80" "GitPython>=3.1"
```

### Frontend

```bash
cd frontend
npm install
npm run build
cd ..
```

### Run

```bash
.venv/bin/uvicorn aipentester.main:app --port 8000
```

Open <http://127.0.0.1:8000>. Interactive API docs at
<http://127.0.0.1:8000/docs>.

On Windows use `.venv\Scripts\uvicorn.exe` instead.

---

## Usage

1. Start the backend and open <http://127.0.0.1:8000>.
2. By default scans may only target `samples/` (the bundled `benchmark-app`).
   To audit your own directories, set `PENTEST_SCAN_ROOT` to an absolute path
   (via `.env` or the UI Settings page).
3. Go to **Audit a project**, browse a directory inside the approved scan root,
   and click **Start audit**.
4. Watch progress on the scan detail page, then review candidates at
   `GET /api/scans/{id}/candidates`.

Each candidate shows the redacted excerpt, rule id, severity, lines, and
vulnerability family. A candidate is not a confirmed finding.

---

## API reference

All routes are under `/api`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Liveness probe |
| GET | `/api/system/capabilities` | Semgrep version, AI readiness, limits |
| POST | `/api/repositories/inspect` | Validate path + measured inventory |
| GET | `/api/repositories/browse?path=` | Safe directory listing inside the root |
| POST | `/api/scans` | Start a background scan (202) |
| GET | `/api/scans` | List recent scans |
| GET | `/api/scans/{id}` | Scan status, timeline, warnings, errors |
| GET | `/api/scans/{id}/candidates` | Evidence-rich candidate list |
| GET | `/api/scans/{id}/findings` | AI-investigated findings |
| GET | `/api/dashboard` | Aggregate scan stats and distributions |
| GET | `/api/quality` | Last self-audit report |
| POST | `/api/quality/run` | Run the self-audit battery |
| GET | `/api/settings` | Current non-secret configuration |
| POST | `/api/settings/scan-root` | Change the approved scan root |

Example — start a scan:

```bash
curl -s -X POST http://127.0.0.1:8000/api/scans \
     -H 'Content-Type: application/json' -d '{"path":"benchmark-app"}'
```

---

## Configuration

All settings use the `PENTEST_` prefix. Copy `.env.example` to `.env` and edit.

| Variable | Default | Meaning |
|----------|---------|---------|
| `PENTEST_SCAN_ROOT` | `<repo>/samples` | The only directory scans may target |
| `PENTEST_DATA_DIR` | `<repo>/data` | SQLite DB location |
| `PENTEST_SEMGREP_BIN` | `semgrep` | Semgrep binary name or path |
| `PENTEST_MAX_FILES` | `5000` | Inventory file cap |
| `PENTEST_MAX_FILE_BYTES` | `1000000` | Per-file read cap |
| `PENTEST_MAX_TOTAL_BYTES` | `200000000` | Whole-repo byte cap |
| `PENTEST_MAX_DEPTH` | `24` | Directory recursion cap |
| `PENTEST_DEBUG` | off | Verbose logs |

Never commit `.env` — it is gitignored.

---

## Testing

```bash
# Unit tests (fast)
.venv/bin/pytest backend/tests/unit -q

# All tests including integration (requires semgrep)
.venv/bin/pytest backend/tests -q
```

Integration tests run real Semgrep scans against `samples/benchmark-app` and
sandbox fixtures.

---

## Repository structure

```
ai-pentester/
├── README.md
├── .env.example
├── .gitignore
├── Makefile
├── backend/
│   ├── pyproject.toml
│   └── aipentester/
│       ├── main.py              # FastAPI app factory
│       ├── config.py            # PENTEST_* settings
│       ├── api/routes/          # FastAPI routers
│       ├── db/                  # SQLAlchemy models + session
│       ├── repository/          # safe file discovery
│       ├── scanners/            # Semgrep adapter + bundled rules
│       ├── schemas/             # Pydantic request/response models
│       ├── security/            # path validation, redaction
│       ├── services/            # orchestrator, jobs, AI, quality
│       └── tests/               # unit + integration tests
├── frontend/                    # React 19 + Vite app
│   └── src/
│       ├── api.ts               # typed fetch helpers
│       ├── App.tsx
│       └── pages/
├── samples/
│   └── benchmark-app/           # vulnerable + safe twin fixtures
└── scripts/
    └── vendor_rules.py          # re-vendor Semgrep rules (offline)
```

---

*Version 0.1.0 (pre-alpha). The code is the source of truth.*
