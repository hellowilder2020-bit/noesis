import React, { useState } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import NewScan from "./pages/NewScan";
import ScanDetail from "./pages/ScanDetail";
import Quality from "./pages/Quality";
import Settings from "./pages/Settings";
import "./styles.css";

/* ---------------------------------------------------------------------------
   Layout shell — fixed sidebar + main content
   Navigation items separated: primary section + bottom utility section
--------------------------------------------------------------------------- */
function Layout({ children }: { children: React.ReactNode }) {
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiProvider, setAiProvider] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiSettingsStatus, setAiSettingsStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  const handleAiSettingsSave = async () => {
    setAiSettingsStatus("saving");
    try {
      const res = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: aiProvider || undefined,
          model: aiModel || undefined,
          base_url: aiBaseUrl || undefined,
          api_key: aiApiKey || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setAiSettingsStatus("success");
      setShowAiSettings(false);
      setTimeout(() => setAiSettingsStatus("idle"), 2000);
    } catch {
      setAiSettingsStatus("error");
    }
  };

  const handleBackup = async () => {
    try {
      const res = await fetch("/api/settings/backup");
      if (!res.ok) throw new Error("Backup failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aipentester-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download backup");
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">A</span> AI Pentester
        </div>
        <nav className="nav">
          {/* Primary navigation section */}
          <div className="nav-section">
            <div className="nav-title">Platform</div>
            <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Security Overview
            </NavLink>
            <NavLink to="/scan" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Audit a Project
            </NavLink>
            <NavLink to="/quality" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Scanner Health Check
            </NavLink>
          </div>

          <div className="nav-divider" />

          {/* Bottom utility section */}
          <div className="nav-section">
            <div className="nav-title">Settings</div>
            <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Settings
            </NavLink>
          </div>
        </nav>
        <div className="sidebar-foot">
          <button className="settings-btn" onClick={() => setShowAiSettings(true)} title="Settings">
            ⚙
          </button>
          <div style={{ marginTop: 12, color: "var(--text-dim)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Source-code security auditing. Code is only read — never executed.
          </div>
        </div>
      </aside>
      <main className="content">
        {children}
        
        {showAiSettings && (
          <div className="modal-overlay" onClick={() => setShowAiSettings(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3>AI Provider Settings</h3>
              <p>Configure your AI provider for vulnerability investigation.</p>
              <div className="form-group">
                <label>Provider</label>
                <select value={aiProvider} onChange={e => setAiProvider(e.target.value)}>
                  <option value="openai_compatible">OpenAI Compatible</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="none">Disabled</option>
                </select>
              </div>
              <div className="form-group">
                <label>Model</label>
                <input type="text" value={aiModel} onChange={e => setAiModel(e.target.value)} placeholder="e.g. claude-3-5-sonnet" />
              </div>
              <div className="form-group">
                <label>Base URL</label>
                <input type="text" value={aiBaseUrl} onChange={e => setAiBaseUrl(e.target.value)} placeholder="e.g. https://api.anthropic.com" />
              </div>
              <div className="form-group">
                <label>API Key</label>
                <input type="password" value={aiApiKey} onChange={e => setAiApiKey(e.target.value)} placeholder="Enter API key" />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowAiSettings(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleAiSettingsSave} disabled={aiSettingsStatus === "saving"}>
                  {aiSettingsStatus === "saving" ? "Saving…" : "Save"}
                </button>
              </div>
              {aiSettingsStatus === "success" && <p className="ok">Settings saved!</p>}
              {aiSettingsStatus === "error" && <p className="error">Failed to save settings.</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StrictMode>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <Layout>
                <Dashboard />
              </Layout>
            }
          />
          <Route
            path="/scan"
            element={
              <Layout>
                <NewScan />
              </Layout>
            }
          />
          <Route
            path="/scan/:id"
            element={
              <Layout>
                <ScanDetail />
              </Layout>
            }
          />
          <Route
            path="/quality"
            element={
              <Layout>
                <Quality />
              </Layout>
            }
          />
          <Route
            path="/settings"
            element={
              <Layout>
                <Settings />
              </Layout>
            }
          />
        </Routes>
      </BrowserRouter>
    </StrictMode>
  );
}