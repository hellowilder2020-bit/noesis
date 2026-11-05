// Typed helpers for talking to the AI Pentester backend.

export type Capabilities = {
  version: string;
  scan_root: string;
  semgrep: { installed: boolean; version: string | null; error: string | null };
  ai: {
    provider: string;
    model: string | null;
    base_url: string | null;
    api_key_configured: boolean;
    ready: boolean;
  };
  limits: Record<string, number>;
};

export type BrowseResponse = { path: string; directories: string[]; files: string[] };

export type Inventory = {
  root: string;
  name: string;
  total_files: number;
  total_size_bytes: number;
  source_files: number;
  languages: Record<string, number>;
  manifests: string[];
  files: { path: string; size_bytes: number; language: string | null; is_manifest: boolean }[];
  git: { commit: string; branch: string; dirty: boolean; remote_host: string } | null;
  warnings: string[];
  skipped: Record<string, number>;
  truncated: boolean;
  truncation_reasons: string[];
};

export type ScanSummary = {
  id: string;
  repository: string;
  repository_path: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  total_files: number;
  files_scanned: number;
  candidates_count: number;
  candidates_skipped: number;
  findings_count: number;
  languages: Record<string, number>;
};

export type ScanDetail = ScanSummary & {
  options: Record<string, unknown>;
  scanner_status: Record<string, unknown> | null;
  ai_status: Record<string, unknown> | null;
  warnings: string[];
  error: string | null;
  events: { ts: string; level: string; stage: string; message: string; data: unknown }[];
};

export type Candidate = {
  id: string;
  scanner: string;
  rule_id: string;
  vuln_type: string | null;
  severity: string;
  path: string;
  start_line: number;
  end_line: number;
  message: string;
  excerpt_redacted: string | null;
  state: string;
  skip_reason: string | null;
  rules: string[];
};

export type Finding = {
  id: string;
  candidate_id: string | null;
  assessment: string | null;
  verification_status: string | null;
  vulnerability_type: string | null;
  severity: string | null;
  confidence: number | null;
  affected_path: string | null;
  start_line: number | null;
  end_line: number | null;
  explanation: string | null;
  remediation: string | null;
  uncertainty: string | null;
  evidence: { path: string; start_line: number; end_line: number; excerpt: string }[];
  checks: { evidence?: { path: string; status: string }[] } | null;
  thinking: string | null;
  provider: string | null;
  model: string | null;
  created_at: string | null;
};

export type AppSettings = {
  scan_root: string;
  data_dir: string;
  semgrep: { installed: boolean; version: string | null; error: string | null };
  ai: {
    provider: string;
    model: string | null;
    base_url: string | null;
    api_key_configured: boolean;
    ready: boolean;
  };
  limits: Record<string, number>;
};

export type Dashboard = {
  total_scans: number;
  scans_running: number;
  scans_completed: number;
  scans_other: number;
  total_candidates: number;
  total_findings: number;
  severity_counts: Record<string, number>;
  vuln_type_counts: Record<string, number>;
  last_event: string | null;
  recent: {
    id: string; repository: string; status: string; created_at: string;
    finished_at: string | null; duration_ms: number | null;
    candidates_count: number; findings_count: number;
  }[];
};

export type QualityCheck = {
  id: string; title: string; category: string; description: string;
  passed: boolean; expected: string; actual: string; detail: string;
  skipped?: boolean;
};

export type QualityState = {
  status: "idle" | "running" | "done" | "error";
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  error?: string | null;
  summary?: { total: number; passed: number; failed: number; skipped?: number };
  checks: QualityCheck[];
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  capabilities: () => request<Capabilities>("/api/system/capabilities"),
  browse: (path: string) =>
    request<BrowseResponse>(`/api/repositories/browse?path=${encodeURIComponent(path)}`),
  inspect: (path: string) =>
    request<Inventory>("/api/repositories/inspect", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  dashboard: () => request<Dashboard>("/api/dashboard"),
  scans: (limit = 50) => request<{ scans: ScanSummary[] }>(`/api/scans?limit=${limit}`),
  scan: (id: string) => request<ScanDetail>(`/api/scans/${id}`),
  candidates: (id: string) => request<Candidate[]>(`/api/scans/${id}/candidates`),
  findings: (id: string) => request<Finding[]>(`/api/scans/${id}/findings`),
  startScan: (path: string, investigate = false) =>
    request<{ id: string; status: string; repository: string }>("/api/scans", {
      method: "POST",
      body: JSON.stringify({ path, investigate }),
    }),
  settings: () => request<AppSettings>("/api/settings"),
  setScanRoot: (path: string) =>
    request<{ scan_root: string }>("/api/settings/scan-root", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  quality: () => request<QualityState>("/api/quality"),
  runQuality: () =>
    request<{ status: string }>("/api/quality/run", { method: "POST" }),
};
