import React, { useState, useCallback } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import NewScan from "./pages/NewScan";
import ScanDetail from "./pages/ScanDetail";
import Quality from "./pages/Quality";
import Settings from "./pages/Settings";
import "./styles.css";

// Profile menu component
function ProfileMenu({ onSettingsClick, onBackupClick, onRestoreClick }: { 
  onSettingsClick: () => void;
  onBackupClick: () => void;
  onRestoreClick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");

  const handleRestore = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreFile) return;
    setRestoreStatus("uploading");
    try {
      const text = await restoreFile.text();
      const data = JSON.parse(text);
      const res = await fetch("/api/settings/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) throw new Error("Restore failed");
      setRestoreStatus("success");
      setShowRestore(false);
      setRestoreFile(null);
      setTimeout(() => setRestoreStatus("idle"), 2000);
      alert("Backup restored successfully! Please refresh the page.");
    } catch (err) {
      setRestoreStatus("error");
      setTimeout(() => setRestoreStatus("idle"), 3000);
    }
  }, [restoreFile]);

  return (
    <div className="profile-menu">
      <button className="profile-btn" onClick={() => setOpen(!open)} aria-label="Profile menu">
        ⚙️
      </button>
      {open && (
        <div className="profile-dropdown">
          <div className="profile-header">
            <span>AI Pentester</span>
            <span className="version">v0.1.0</span>
          </div>
          <hr />
          <button className="dropdown-item" onClick={() => { setOpen(false); onSettingsClick(); }}>
            🔑 AI Settings
          </button>
          <button className="dropdown-item" onClick={() => { setOpen(false); onBackupClick(); }}>
            💾 Download Backup
          </button>
          <button className="dropdown-item" onClick={() => { setOpen(false); setShowRestore(true); }}>
            📥 Restore Backup
          </button>
        </div>
      )}
      
      {showRestore && (
        <div className="modal-overlay" onClick={() => { setShowRestore(false); setRestoreFile(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Restore Backup</h3>
            <p>Select a backup JSON file to restore. This will overwrite all existing data.</p>
            <form onSubmit={handleRestore}>
              <input 
                type="file" 
                accept=".json" 
                onChange={e => setRestoreFile(e.target.files?.[0] || null)} 
                required
              />
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowRestore(false); setRestoreFile(null); }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={!restoreFile || restoreStatus === "uploading"}>
                  {restoreStatus === "uploading" ? "Restoring..." : "Restore"}
                </button>
              </div>
              {restoreStatus === "error" && <p className="error">Restore failed. Check file format.</p>}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

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
      setTimeout(() => setAiSettingsStatus("idle"), 3000);
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
          <span className="logo">🛡</span> AI Pentester
        </div>
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          🏠 Overview
        </NavLink>
        <NavLink to="/scan" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          📂 Audit a project
        </NavLink>
        <NavLink to="/quality" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          🧪 Scanner Health Check
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          ⚙️ Settings
        </NavLink>
        <div className="sidebar-foot">
          Source-code security auditing. Nothing is executed — code is only
          read and analysed as text.
        </div>
      </aside>
      <main className="content">
        <header className="content-header">
          <ProfileMenu 
            onSettingsClick={() => setShowAiSettings(true)}
            onBackupClick={handleBackup}
            onRestoreClick={() => {}}
          />
        </header>
        {children}
        
        {showAiSettings && (
          <div className="modal-overlay" onClick={() => setShowAiSettings(false)}>
            <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
              <h3>AI Provider Settings</h3>
              <p>Configure your AI provider for vulnerability investigation. Supports OpenAI-compatible APIs (OpenRouter, NVIDIA, Ollama, LM Studio, etc.) and Anthropic.</p>
              <div className="form-group">
                <label>Provider</label>
                <select value={aiProvider} onChange={e => setAiProvider(e.target.value)}>
                  <option value="openai_compatible">OpenAI Compatible (OpenRouter, NVIDIA, Ollama, LM Studio, etc.)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="nvidia">NVIDIA</option>
                  <option value="omnirouter">OmniRouter</option>
                  <option value="none">Disabled</option>
                </select>
              </div>
              <div className="form-group">
                <label>Model</label>
                <input 
                  type="text" 
                  value={aiModel} 
                  onChange={e => setAiModel(e.target.value)} 
                  placeholder="e.g. gpt-4o, claude-3-5-sonnet, nvidia/nemotron-3-ultra"
                />
              </div>
              <div className="form-group">
                <label>Base URL (for OpenAI-compatible)</label>
                <input 
                  type="text" 
                  value={aiBaseUrl} 
                  onChange={e => setAiBaseUrl(e.target.value)} 
                  placeholder="e.g. https://openrouter.ai/api/v1, http://localhost:11434/v1"
                />
              </div>
              <div className="form-group">
                <label>API Key</label>
                <input 
                  type="password" 
                  value={aiApiKey} 
                  onChange={e => setAiApiKey(e.target.value)} 
                  placeholder="Enter your API key (stored encrypted)"
                />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowAiSettings(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleAiSettingsSave} disabled={aiSettingsStatus === "saving"}>
                  {aiSettingsStatus === "saving" ? "Saving..." : "Save"}
                </button>
              </div>
              {aiSettingsStatus === "success" && <p className="success">Settings saved!</p>}
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
