import React from "react";
import { useApiData } from "../../hooks/useApi";
import type { WorkflowEvent } from "../../hooks/useWebSocket";

type Execution = {
  id: string;
  workflow_id: string;
  version: number;
  trigger_type: string;
  status: string;
  error_message: string | null;
  started_at: number;
  completed_at: number | null;
};

type StepResult = {
  id: string;
  node_id: string;
  node_type: string;
  status: string;
  error_message: string | null;
  retry_count: number;
  started_at: number | null;
  completed_at: number | null;
};

const STATUS_COLORS: Record<string, string> = {
  running: "var(--j-accent)",
  completed: "var(--j-success)",
  failed: "var(--j-error, #ef4444)",
  cancelled: "var(--j-warning, #f59e0b)",
  paused: "var(--j-text-muted)",
  pending: "var(--j-text-dim)",
  skipped: "var(--j-text-dim)",
  waiting: "var(--j-accent)",
};

export default function ExecutionMonitor({
  workflowId,
  workflowEvents,
}: {
  workflowId: string;
  workflowEvents: WorkflowEvent[];
}) {
  const { data: executions, loading } = useApiData<Execution[]>(
    `/api/workflows/${workflowId}/executions`
  );

  if (loading) {
    return <div style={{ padding: "16px", color: "var(--j-text-dim)", fontSize: "12px" }}>Loading executions...</div>;
  }

  if (!executions || executions.length === 0) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "var(--j-text-dim)", fontSize: "12px" }}>
        No executions yet. Run the workflow to see results.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px" }}>
      {executions.slice(0, 20).map(exec => (
        <ExecutionCard key={exec.id} execution={exec} workflowEvents={workflowEvents} />
      ))}
    </div>
  );
}

function ExecutionCard({
  execution: exec,
  workflowEvents,
}: {
  execution: Execution;
  workflowEvents: WorkflowEvent[];
}) {
  const [expanded, setExpanded] = React.useState(exec.status === "running");
  const { data: steps } = useApiData<{ execution: Execution; steps: StepResult[] }>(
    expanded ? `/api/workflows/executions/${exec.id}` : null
  );

  const liveEvents = workflowEvents.filter(e => e.executionId === exec.id);
  const color = STATUS_COLORS[exec.status] ?? "var(--j-text-dim)";
  const duration = exec.completed_at
    ? `${((exec.completed_at - exec.started_at) / 1000).toFixed(1)}s`
    : exec.status === "running" ? "running..." : "—";

  return (
    <div style={{
      background: "var(--j-bg)",
      border: "1px solid var(--j-border)",
      borderRadius: "6px",
      overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          cursor: "pointer",
          fontSize: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%",
            background: color,
            boxShadow: exec.status === "running" ? `0 0 6px ${color}` : "none",
            animation: exec.status === "running" ? "pulse 1.5s infinite" : undefined,
          }} />
          <span style={{ color: "var(--j-text)", fontWeight: 500 }}>
            v{exec.version}
          </span>
          <span style={{ color: "var(--j-text-muted)", fontSize: "11px" }}>
            {exec.trigger_type}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "var(--j-text-muted)", fontSize: "11px" }}>{duration}</span>
          <span style={{ color: "var(--j-text-dim)", fontSize: "10px" }}>{expanded ? "\u25BC" : "\u25B6"}</span>
        </div>
      </div>

      {expanded && steps?.steps && (
        <div style={{ borderTop: "1px solid var(--j-border)", padding: "8px 12px" }}>
          {steps.steps.map(step => {
            const stepColor = STATUS_COLORS[step.status] ?? "var(--j-text-dim)";
            return (
              <div key={step.id} style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px 0",
                fontSize: "11px",
              }}>
                <span style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  background: stepColor, flexShrink: 0,
                }} />
                <span style={{ color: "var(--j-text)", flex: 1 }}>{step.node_id}</span>
                <span style={{ color: "var(--j-text-muted)" }}>{step.node_type}</span>
                {step.retry_count > 0 && (
                  <span style={{ color: "var(--j-warning, #f59e0b)", fontSize: "10px" }}>
                    {step.retry_count}x retry
                  </span>
                )}
                {step.error_message && (
                  <span style={{ color: "var(--j-error, #ef4444)", fontSize: "10px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={step.error_message}>
                    {step.error_message}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {exec.error_message && (
        <div style={{
          borderTop: "1px solid var(--j-border)",
          padding: "6px 12px",
          fontSize: "11px",
          color: "var(--j-error, #ef4444)",
          background: "rgba(239, 68, 68, 0.05)",
        }}>
          {exec.error_message}
        </div>
      )}
    </div>
  );
}
