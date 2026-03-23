import React, { useState, useEffect } from "react";
import { api } from "../../hooks/useApi";
import type { Project } from "../../pages/SitesPage";

type Template = {
  id: string;
  name: string;
  description: string;
  framework: string;
};

type Props = {
  onClose: () => void;
  onCreated: (project: Project) => void;
};

export function SiteNewProjectModal({ onClose, onCreated }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Template[]>("/api/sites/templates")
      .then((t) => {
        setTemplates(t);
        if (t.length > 0) setSelectedTemplate(t[0]!.id);
      })
      .catch(() => setTemplates([]));
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !selectedTemplate) return;
    setCreating(true);
    setError(null);
    try {
      const project = await api<Project>("/api/sites/projects", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), template: selectedTemplate }),
      });
      onCreated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--j-text)", marginBottom: "16px" }}>
          New Project
        </h3>

        {/* Project name */}
        <div style={{ marginBottom: "12px" }}>
          <label style={labelStyle}>Project Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-awesome-site"
            style={inputStyle}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
        </div>

        {/* Template selection */}
        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>Template</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {templates.map((t) => (
              <label
                key={t.id}
                style={{
                  ...templateOptionStyle,
                  borderColor: selectedTemplate === t.id ? "var(--j-accent)" : "var(--j-border)",
                  background: selectedTemplate === t.id ? "rgba(0, 212, 255, 0.05)" : "var(--j-surface)",
                }}
              >
                <input
                  type="radio"
                  name="template"
                  value={t.id}
                  checked={selectedTemplate === t.id}
                  onChange={() => setSelectedTemplate(t.id)}
                  style={{ display: "none" }}
                />
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--j-text)" }}>{t.name}</div>
                  <div style={{ fontSize: "11px", color: "var(--j-text-muted)" }}>{t.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: "8px", marginBottom: "12px", borderRadius: "4px", fontSize: "12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--j-error)" }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !selectedTemplate || creating}
            style={{ ...createBtnStyle, opacity: name.trim() && selectedTemplate ? 1 : 0.4 }}
          >
            {creating ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "var(--j-bg)",
  border: "1px solid var(--j-border)",
  borderRadius: "8px",
  padding: "20px",
  width: 420,
  maxWidth: "90vw",
  maxHeight: "80vh",
  overflow: "auto",
};

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--j-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: "6px",
  display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: "13px",
  background: "var(--j-surface)",
  border: "1px solid var(--j-border)",
  borderRadius: "4px",
  color: "var(--j-text)",
  outline: "none",
  boxSizing: "border-box",
};

const templateOptionStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid var(--j-border)",
  borderRadius: "6px",
  cursor: "pointer",
  transition: "border-color 0.15s",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: "12px",
  background: "none",
  border: "1px solid var(--j-border)",
  borderRadius: "4px",
  color: "var(--j-text-dim)",
  cursor: "pointer",
};

const createBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: "12px",
  fontWeight: 600,
  background: "rgba(0, 212, 255, 0.15)",
  border: "1px solid rgba(0, 212, 255, 0.4)",
  borderRadius: "4px",
  color: "var(--j-accent)",
  cursor: "pointer",
};
