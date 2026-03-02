import React, { useState, useCallback } from "react";
import type { WorkflowEvent } from "../hooks/useWebSocket";
import { useApiData, api } from "../hooks/useApi";
import WorkflowList from "../components/workflows/WorkflowList";
import WorkflowCanvas from "../components/workflows/WorkflowCanvas";

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
  updated_at: number;
};

export default function WorkflowsPage({
  workflowEvents,
  sendMessage,
}: {
  workflowEvents: WorkflowEvent[];
  sendMessage: (text: string) => void;
}) {
  const [view, setView] = useState<"list" | "canvas">("list");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const { data: workflows, loading, refetch } = useApiData<Workflow[]>("/api/workflows");

  const handleSelect = useCallback((id: string) => {
    setSelectedWorkflowId(id);
    setView("canvas");
  }, []);

  const handleBack = useCallback(() => {
    setView("list");
    setSelectedWorkflowId(null);
    refetch();
  }, [refetch]);

  const handleCreate = useCallback(async () => {
    const name = prompt("Workflow name:");
    if (!name) return;
    try {
      const wf = await api<Workflow>("/api/workflows", {
        method: "POST",
        body: JSON.stringify({
          name,
          definition: {
            nodes: [{
              id: "trigger-1",
              type: "trigger.manual",
              label: "Manual Trigger",
              position: { x: 100, y: 200 },
              config: {},
            }],
            edges: [],
            settings: {
              maxRetries: 3,
              retryDelayMs: 5000,
              timeoutMs: 300000,
              parallelism: "parallel",
              onError: "stop",
            },
          },
        }),
      });
      handleSelect(wf.id);
    } catch (err) {
      console.error("Failed to create workflow:", err);
    }
  }, [handleSelect]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--j-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--j-surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {view === "canvas" && (
            <button
              onClick={handleBack}
              style={{
                background: "none", border: "none", color: "var(--j-text-dim)",
                cursor: "pointer", fontSize: "14px", padding: "4px 8px",
              }}
            >
              {"<"} Back
            </button>
          )}
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--j-text)" }}>
            {view === "list" ? "Workflows" : workflows?.find(w => w.id === selectedWorkflowId)?.name ?? "Workflow"}
          </h2>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {view === "list" && (
            <button
              onClick={handleCreate}
              style={{
                padding: "6px 16px", borderRadius: "6px", border: "none",
                background: "var(--j-accent)", color: "#fff", cursor: "pointer",
                fontSize: "12px", fontWeight: 600,
              }}
            >
              + New Workflow
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {view === "list" && (
          <WorkflowList
            workflows={workflows ?? []}
            loading={loading}
            onSelect={handleSelect}
            onRefetch={refetch}
            workflowEvents={workflowEvents}
          />
        )}
        {view === "canvas" && selectedWorkflowId && (
          <WorkflowCanvas
            workflowId={selectedWorkflowId}
            workflowEvents={workflowEvents}
            sendMessage={sendMessage}
          />
        )}
      </div>
    </div>
  );
}
