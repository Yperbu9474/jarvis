import React from "react";
import type { WorkflowEvent } from "../../hooks/useWebSocket";
import { api } from "../../hooks/useApi";

type Workflow = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  tags: string[];
  current_version: number;
  execution_count: number;
  last_executed_at: number | null;
  last_success_at: number | null;
  last_failure_at: number | null;
  created_at: number;
};

export default function WorkflowList({
  workflows,
  loading,
  onSelect,
  onRefetch,
  workflowEvents,
}: {
  workflows: Workflow[];
  loading: boolean;
  onSelect: (id: string) => void;
  onRefetch: () => void;
  workflowEvents: WorkflowEvent[];
}) {
  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--j-text-dim)" }}>
        Loading workflows...
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div style={{
        padding: "60px 40px", textAlign: "center", color: "var(--j-text-dim)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: "12px",
      }}>
        <div style={{ fontSize: "32px" }}>&#9889;</div>
        <div style={{ fontSize: "14px" }}>No workflows yet</div>
        <div style={{ fontSize: "12px" }}>Create your first automation to get started</div>
      </div>
    );
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await api(`/api/workflows/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !enabled }),
      });
      onRefetch();
    } catch (err) {
      console.error("Failed to toggle workflow:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this workflow?")) return;
    try {
      await api(`/api/workflows/${id}`, { method: "DELETE" });
      onRefetch();
    } catch (err) {
      console.error("Failed to delete workflow:", err);
    }
  };

  const handleRun = async (id: string) => {
    try {
      await api(`/api/workflows/${id}/execute`, { method: "POST", body: "{}" });
    } catch (err) {
      console.error("Failed to run workflow:", err);
    }
  };

  return (
    <div style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px", overflowY: "auto", height: "100%" }}>
      {workflows.map((wf) => {
        const recentEvents = workflowEvents.filter(e => e.workflowId === wf.id).slice(-3);
        const lastEvent = recentEvents[recentEvents.length - 1];
        const isRunning = lastEvent?.type === "execution_started";

        return (
          <div
            key={wf.id}
            style={{
              background: "var(--j-surface)",
              border: "1px solid var(--j-border)",
              borderRadius: "8px",
              padding: "16px",
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onClick={() => onSelect(wf.id)}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--j-accent)"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--j-border)"}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--j-text)" }}>
                {wf.name}
              </div>
              <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                {isRunning && (
                  <span style={{
                    width: "8px", height: "8px", borderRadius: "50%",
                    background: "var(--j-accent)", display: "inline-block",
                    animation: "pulse 1.5s infinite",
                  }} />
                )}
                <span style={{
                  padding: "2px 8px", borderRadius: "10px", fontSize: "10px", fontWeight: 600,
                  background: wf.enabled ? "rgba(16, 185, 129, 0.15)" : "rgba(107, 114, 128, 0.15)",
                  color: wf.enabled ? "var(--j-success)" : "var(--j-text-muted)",
                }}>
                  {wf.enabled ? "Active" : "Disabled"}
                </span>
              </div>
            </div>

            {wf.description && (
              <div style={{ fontSize: "12px", color: "var(--j-text-dim)", marginBottom: "8px", lineHeight: "1.4" }}>
                {wf.description}
              </div>
            )}

            {wf.tags.length > 0 && (
              <div style={{ display: "flex", gap: "4px", marginBottom: "8px", flexWrap: "wrap" }}>
                {wf.tags.map(tag => (
                  <span key={tag} style={{
                    padding: "1px 6px", borderRadius: "4px", fontSize: "10px",
                    background: "rgba(0, 212, 255, 0.1)", color: "var(--j-accent)",
                  }}>{tag}</span>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--j-text-muted)" }}>
              <span>v{wf.current_version} | {wf.execution_count} runs</span>
              <div style={{ display: "flex", gap: "6px" }} onClick={e => e.stopPropagation()}>
                <button onClick={() => handleRun(wf.id)} style={{ background: "none", border: "none", color: "var(--j-accent)", cursor: "pointer", fontSize: "11px" }} title="Run">
                  &#9654;
                </button>
                <button onClick={() => handleToggle(wf.id, wf.enabled)} style={{ background: "none", border: "none", color: "var(--j-text-dim)", cursor: "pointer", fontSize: "11px" }} title="Toggle">
                  {wf.enabled ? "Pause" : "Enable"}
                </button>
                <button onClick={() => handleDelete(wf.id)} style={{ background: "none", border: "none", color: "var(--j-error, #ef4444)", cursor: "pointer", fontSize: "11px" }} title="Delete">
                  &#10005;
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
