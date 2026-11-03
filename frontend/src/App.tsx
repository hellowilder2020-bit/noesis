import React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import NewScan from "./pages/NewScan";
import ScanDetail from "./pages/ScanDetail";
import Quality from "./pages/Quality";
import Settings from "./pages/Settings";
import "./styles.css";

function Layout({ children }: { children: React.ReactNode }) {
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
          🧪 Health checks
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          ⚙️ Settings
        </NavLink>
        <div className="sidebar-foot">
          Source-code security auditing. Nothing is executed — code is only
          read and analysed as text.
        </div>
      </aside>
      <main className="content">{children}</main>
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
